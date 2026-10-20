import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { createIran } from "../src/index.js";
import { createMockServer, type MockServer } from "../src/server.js";

const make = (extra = {}) => {
  const f = createIran({ seed: 42, referenceDate: "2026-10-20T00:00:00Z" });
  return createMockServer({
    iran: f, count: 45,
    resources: {
      users: { id: "id.uuid", name: "person.fullName", city: "address.city", age: "person.age", address: { city: "address.city" } },
      products: { fields: { id: "id.index", title: "product.name", price: "product.price" }, count: 12 },
      orders: f.schema({ _id: "id.objectId", total: "order.total" }),
    },
    ...extra,
  });
};

describe("mock server", () => {
  let mock: MockServer, url: string;
  const get = async (p: string) => { const r = await fetch(url + p); return { status: r.status, headers: r.headers, // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: (r.status === 204 ? null : await r.json()) as any }; };
  beforeAll(async () => { mock = make(); url = await mock.listen(0); });
  afterAll(() => mock.close());

  it("index lists resources", async () => {
    const r = await get("/");
    expect(r.body.resources).toEqual([{ name: "users", count: 45, url: "/users" }, { name: "products", count: 12, url: "/products" }, { name: "orders", count: 45, url: "/orders" }]);
  });
  it("list with pagination, meta, headers", async () => {
    const r = await get("/users?page=3&limit=20");
    expect(r.status).toBe(200);
    expect(r.body.meta).toEqual({ page: 3, limit: 20, total: 45, pages: 3 });
    expect(r.body.data).toHaveLength(5);
    expect(r.headers.get("x-total-count")).toBe("45");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("link")).toContain('rel="prev"');
    const bare = await get("/users?_page=1&_limit=10");
    expect(Array.isArray(bare.body)).toBe(true);
    expect(bare.body).toHaveLength(10);
    expect((await get("/users?offset=40&limit=100")).body.data).toHaveLength(5);
  });
  it("get by id (id, _id, numeric)", async () => {
    const list = (await get("/users?limit=1")).body.data;
    expect((await get(`/users/${list[0].id}`)).body).toEqual(list[0]);
    const o = (await get("/orders?limit=1")).body.data[0];
    expect((await get(`/orders/${o._id}`)).body).toEqual(o);
    expect((await get("/products/3")).body.id).toBe(3);
    expect((await get("/users/nope")).status).toBe(404);
    expect((await get("/nothing")).status).toBe(404);
    expect((await get("/USERS?limit=1")).status).toBe(200);
  });
  it("filters, search, sort", async () => {
    const all = mock.data.users;
    const city = all[0].city as string;
    const r = await get(`/users?city=${encodeURIComponent(city)}&limit=100`);
    expect(r.body.data.every((u: { city: string }) => u.city === city)).toBe(true);
    expect(r.body.meta.total).toBe(all.filter((u) => u.city === city).length);
    const nested = await get(`/users?address.city=${encodeURIComponent(city)}&limit=100`);
    expect(nested.body.meta.total).toBe(all.filter((u) => (u.address as { city: string }).city === city).length);
    const sorted = (await get("/products?sort=-price&limit=100")).body.data.map((p: { price: number }) => p.price);
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
    const asc = (await get("/users?_sort=age&_order=asc&_limit=100")).body.map((u: { age: number }) => u.age);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const range = (await get("/users?age_gte=30&age_lte=40&limit=100")).body.data;
    expect(range.every((u: { age: number }) => u.age >= 30 && u.age <= 40)).toBe(true);
    const name = (all[1].name as string).split(" ")[0];
    expect((await get(`/users?q=${encodeURIComponent(name)}`)).body.meta.total).toBeGreaterThan(0);
  });
  it("read-only by default; OPTIONS for CORS", async () => {
    expect((await fetch(url + "/users", { method: "POST", body: "{}" })).status).toBe(405);
    expect((await fetch(url + "/users", { method: "OPTIONS" })).status).toBe(204);
  });
  it("same seed => same data", async () => {
    const other = make();
    expect(other.data).toEqual(mock.data);
  });
});

describe("writable server, basePath, middleware", () => {
  it("CRUD", async () => {
    const mock = make({ writable: true, basePath: "/api" });
    const url = await mock.listen(0);
    try {
      const created = (await (await fetch(url + "/products", { method: "POST", body: JSON.stringify({ title: "x" }) })).json()) as { id: number };
      expect(created.id).toBe(13);
      const patched = await (await fetch(url + "/products/13", { method: "PATCH", body: JSON.stringify({ price: 5 }) })).json() as unknown;
      expect(patched).toEqual({ id: 13, title: "x", price: 5 });
      expect((await fetch(url + "/products/13", { method: "DELETE" })).status).toBe(204);
      expect((await fetch(url + "/products/13")).status).toBe(404);
      expect((await fetch(url + "/products", { method: "POST", body: "{bad" })).status).toBe(400);
      expect((await fetch(url.replace("/api", "") + "/products")).status).toBe(404);
    } finally { await mock.close(); }
  });
  it("handler mounts in another server and calls next() outside basePath", async () => {
    const mock = make({ basePath: "/mock" });
    const srv = createServer((req, res) => mock.handler(req, res, () => { res.writeHead(200); res.end("app"); }));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}/other`)).text()).toBe("app");
      expect(((await (await fetch(`http://127.0.0.1:${port}/mock/users?limit=2`)).json()) as { data: unknown[] }).data).toHaveLength(2);
    } finally { await new Promise((r) => srv.close(r)); }
  });
  it("needs data or resources", () => {
    expect(() => createMockServer({})).toThrow(/data/);
    expect(createMockServer({ data: { a: [{ id: 1 }] } }).data.a).toHaveLength(1);
  });
});
