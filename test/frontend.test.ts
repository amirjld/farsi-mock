import { describe, it, expect, expectTypeOf, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMockApi, compileOpenAPI, createMockRuntime, defineMockSpec, createMockFetch, createApiFetch, installMockFetch, createAxiosAdapter,
  createMswHandlers, createNextRouteHandlers, createMockMiddleware, combineMockApis, apiMode, isMockMode, isEmptyPayload, MockHttpError,
  type MockSpec, type MockApi, type StorageLike, type CreateMockApiOptions,
} from "../src/frontend/index.js";
import { validateNationalId } from "./parsi/validators.js";

const doc = JSON.parse(readFileSync(join(__dirname, "fixtures", "shop.openapi.json"), "utf8"));
const REF = "2026-10-01T00:00:00Z";
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const mk = (o: Partial<CreateMockApiOptions> = {}) => createMockApi({ spec: doc, seed: 7, referenceDate: REF, ...o });
const get = async (api: MockApi, url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
  const r = await api.handle({ url, method: init.method ?? "GET", body: init.body, headers: init.headers });
  if (!r) throw new Error(`no route for ${url}`);
  return r as { status: number; body: Any; headers: Record<string, string> };
};

describe("compileOpenAPI", () => {
  const spec = compileOpenAPI(doc);
  const route = (m: string, p: string) => spec.routes.find((r) => r.method === m && r.path === p)!;

  it("finds resources, ids and the base path", () => {
    expect(spec.basePath).toBe("/v1");
    expect(Object.keys(spec.resources).sort()).toEqual(["Category", "Order", "Product", "User"]);
    expect(spec.resources.Product).toMatchObject({ idField: "id", idType: "int" });
    expect(spec.resources.Order).toMatchObject({ idField: "id", idType: "uuid" });
    // detail-only fields of ProductDetail (allOf) are part of the resource
    expect(Object.keys(spec.resources.Product.fields)).toEqual(expect.arrayContaining(["title", "price", "description", "images", "seller", "specs"]));
  });
  it("classifies routes and envelopes", () => {
    expect(route("GET", "/products")).toMatchObject({ kind: "list", resource: "Product" });
    expect(route("GET", "/products").response).toMatchObject({ t: "object", props: { data: { t: "items", resource: "Product" }, meta: { t: "object", props: { page: { role: "page" }, perPage: { role: "pageSize" }, total: { role: "total" }, totalPages: { role: "pages" } } } } });
    expect(route("GET", "/products/{productId}")).toMatchObject({ kind: "detail", resource: "Product", params: { productId: "id" } });
    expect(route("GET", "/orders").response).toMatchObject({ props: { isSuccess: { t: "const", value: true }, message: { role: "message" }, errors: { t: "const", value: [] }, result: { props: { items: { t: "items" }, totalCount: { role: "total" }, pageNumber: { role: "page" }, hasNextPage: { role: "hasNext" }, hasPreviousPage: { role: "hasPrev" } } } } });
    expect(route("GET", "/users")).toMatchObject({ kind: "list", response: { t: "items", resource: "User" } });
    expect(route("GET", "/categories").response).toMatchObject({ props: { items: { t: "items" }, total: { role: "total" }, page: { role: "page" }, size: { role: "pageSize" } } });
    expect(route("POST", "/products")).toMatchObject({ kind: "create", status: 201 });
    expect(route("PUT", "/products/{productId}")).toMatchObject({ kind: "update" });
    expect(route("DELETE", "/products/{productId}")).toMatchObject({ kind: "delete", status: 204 });
    expect(route("POST", "/auth/login")).toMatchObject({ kind: "other" });
    expect(route("POST", "/auth/login").resource).toBeUndefined();
    expect(route("GET", "/me")).toMatchObject({ kind: "detail", resource: "User" });
    expect(route("GET", "/categories/{categoryId}/products")).toMatchObject({ kind: "list", resource: "Product", params: { categoryId: "categoryId" } });
  });
  it("reads query params (pagination, search, sort, filters)", () => {
    expect(route("GET", "/products").query).toMatchObject({ page: "page", pageSize: "perPage", search: "q", sort: "sort", defaultPageSize: 12, filters: { categoryId: { field: "categoryId", op: "eq" }, minPrice: { field: "price", op: "gte" }, maxPrice: { field: "price", op: "lte" }, inStock: { field: "inStock" } } });
    expect(route("GET", "/orders").query).toMatchObject({ page: "pageNumber", pageSize: "pageSize", defaultPageSize: 20, filters: { status: { field: "status" } } });
  });
  it("builds error bodies from the error schema", () => {
    expect(route("GET", "/products/{productId}").errors?.["404"]).toMatchObject({ props: { isSuccess: { value: false }, statusCode: { role: "status" }, message: { role: "message" } } });
  });
  it("orders static paths before params and is JSON-serializable", () => {
    const paths = spec.routes.map((r) => r.path);
    expect(paths.indexOf("/categories/{categoryId}/products")).toBeLessThan(paths.indexOf("/products/{productId}"));
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
  });
  it("uses field-name inference and overrides", () => {
    const s = compileOpenAPI(doc, { overrides: { "Product.title": "commerce.category" } });
    expect(s.resources.Product.fields.title).toBe("commerce.category");
    expect(s.resources.User.fields.nationalCode).toBe("person.nationalId");
    expect(JSON.stringify(s.resources.User.fields.avatarUrl)).toContain("internet.avatar");
    expect(compileOpenAPI(doc, { images: "url" }).resources.Product.fields.thumbnail).toBe("internet.url");
    expect(s.resources.Category.fields.name).toBe("commerce.category");
  });
  it("handles Swagger 2", () => {
    const sw = {
      swagger: "2.0", basePath: "/api", info: { title: "t" }, definitions: { Post: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" } } } },
      paths: {
        "/posts": { get: { responses: { 200: { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/definitions/Post" } }, totalCount: { type: "integer" } } } } } } },
        "/posts/{id}": { get: { responses: { 200: { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/definitions/Post" } } } } } } },
      },
    };
    const s = compileOpenAPI(sw);
    expect(s.basePath).toBe("/api");
    expect(s.routes.find((r) => r.path === "/posts")).toMatchObject({ kind: "list", resource: "Post" });
    expect(s.routes.find((r) => r.path === "/posts/{id}")).toMatchObject({ kind: "detail", resource: "Post" });
  });
  it("rejects non-OpenAPI input", () => { expect(() => compileOpenAPI({ foo: 1 })).toThrow(/OpenAPI/); });
});

describe("mock API: shapes and determinism", () => {
  it("returns the exact envelope of each endpoint", async () => {
    const api = mk();
    const list = await get(api, "/v1/products");
    expect(Object.keys(list.body)).toEqual(["data", "meta"]);
    expect(Object.keys(list.body.meta)).toEqual(["page", "perPage", "total", "totalPages"]);
    expect(Object.keys(list.body.data[0])).toEqual(["id", "title", "slug", "price", "discountPercent", "categoryId", "thumbnail", "inStock", "rating", "createdAt"]);
    expect(list.body.meta).toEqual({ page: 1, perPage: 12, total: 30, totalPages: 3 });
    expect(list.headers["x-total-count"]).toBe("30");
    const detail = await get(api, "/v1/products/3");
    expect(Object.keys(detail.body)).toEqual(["data"]);
    expect(detail.body.data).toMatchObject({ id: 3 });
    expect(detail.body.data.seller).toEqual(expect.objectContaining({ shopName: expect.any(String), mobile: expect.stringMatching(/^09\d{9}$/) }));
    const orders = await get(api, "/v1/orders?pageSize=5");
    expect(orders.body).toMatchObject({ isSuccess: true, message: "عملیات با موفقیت انجام شد", errors: [], result: { totalCount: 30, pageNumber: 1, pageSize: 5, totalPages: 6, hasNextPage: true, hasPreviousPage: false } });
    expect(orders.body.result.items).toHaveLength(5);
    expect(orders.body.result.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const users = await get(api, "/v1/users");
    expect(Array.isArray(users.body)).toBe(true);
    const stats = await get(api, "/v1/dashboard/stats");
    expect(stats.body).toMatchObject({ isSuccess: true, result: { ordersToday: expect.any(Number), topCity: expect.any(String) } });
    expect(stats.body.result.ordersToday).toBeLessThanOrEqual(500);
    const login = await get(api, "/v1/auth/login", { method: "POST", body: { username: "x" } });
    expect(Object.keys(login.body)).toEqual(["accessToken", "refreshToken", "expiresIn"]);
  });
  it("is deterministic by seed and differs between seeds", async () => {
    const a = await get(mk(), "/v1/products?page=2");
    const b = await get(mk(), "/v1/products?page=2");
    const c = await get(mk({ seed: 8 }), "/v1/products?page=2");
    expect(a.body).toEqual(b.body);
    expect(a.body).not.toEqual(c.body);
    expect((await get(mk(), "/v1/orders/abc")).body).toEqual((await get(mk(), "/v1/orders/abc")).body);
  });
  it("detail matches the list item (list/detail consistency)", async () => {
    const api = mk();
    const list = (await get(api, "/v1/products?perPage=30")).body.data as Any[];
    for (const item of list.slice(0, 10)) {
      const d = (await get(api, `/v1/products/${item.id}`)).body.data;
      for (const k of Object.keys(item)) expect(d[k]).toEqual(item[k]);
      expect(d.description).toEqual(expect.any(String));
    }
    const orders = (await get(api, "/v1/orders")).body.result.items as Any[];
    expect((await get(api, `/v1/orders/${orders[3].id}`)).body.result).toEqual(orders[3]);
  });
  it("same unknown id gives the same record; notFound: 404 is opt-in", async () => {
    const api = mk();
    const x = (await get(api, "/v1/products/9999")).body.data;
    expect(x.id).toBe(9999);
    expect((await get(mk(), "/v1/products/9999")).body.data).toEqual(x);
    expect((await get(api, "/v1/orders/order-xyz")).body.result.id).toBe("order-xyz");
    expect((await get(mk({ notFound: "404" }), "/v1/products/9999")).status).toBe(404);
  });
  it("keeps safety defaults (000 national IDs, example.* emails) and references real records", async () => {
    const api = mk();
    const users = (await get(api, "/v1/users")).body as Any[];
    for (const u of users) {
      expect(u.nationalCode.startsWith("000")).toBe(true);
      expect(validateNationalId(u.nationalCode)).toBe(true);
      expect(u.email).toMatch(/@example\.(com|net|org)$/);
    }
    const categoryIds = new Set(api.rows("Category").map((c) => c.id));
    for (const p of api.rows("Product")) expect(categoryIds.has(p.categoryId)).toBe(true);
    const productIds = new Set(api.rows("Product").map((p) => p.id));
    for (const o of api.rows("Order")) for (const it of o.items as Any[]) expect(productIds.has(it.productId)).toBe(true);
  });
  it("matches with any prefix, absolute URLs, and baseUrl", async () => {
    const api = mk();
    expect((await get(api, "https://api.example.com/v1/products/2")).body.data.id).toBe(2);
    expect((await get(api, "/backend/v1/products/2")).body.data.id).toBe(2);
    const api2 = mk({ baseUrl: "/api" });
    expect((await get(api2, "/api/products/2")).body.data.id).toBe(2);
    expect(await api2.handle({ url: "/api/nothing-here" })).toBeUndefined();
    expect(api2.matches("GET", "/api/products")).toBe(true);
    expect(api2.matches("DELETE", "/api/products")).toBe(false);
  });
});

describe("mock API: query params", () => {
  it("paginates (page/perPage, offset, page base, size caps)", async () => {
    const api = mk();
    const all = (await get(api, "/v1/products?perPage=30")).body.data as Any[];
    const p2 = (await get(api, "/v1/products?page=2&perPage=7")).body;
    expect(p2.data.map((x: Any) => x.id)).toEqual(all.slice(7, 14).map((x) => x.id));
    expect(p2.meta).toEqual({ page: 2, perPage: 7, total: 30, totalPages: 5 });
    expect((await get(api, "/v1/products?page=99")).body.data).toEqual([]);
    expect((await get(api, "/v1/orders?pageNumber=6&pageSize=5")).body.result).toMatchObject({ hasNextPage: false, hasPreviousPage: true, pageNumber: 6 });
    expect((await get(api, "/v1/categories?size=4")).body).toMatchObject({ total: 30, size: 4, page: 1 });
    expect((await get(mk({ maxPageSize: 10 }), "/v1/products?perPage=500")).body.data).toHaveLength(10);
  });
  it("searches, sorts and filters", async () => {
    const api = mk();
    const all = (await get(api, "/v1/products?perPage=100")).body.data as Any[];
    const word = all[4].title.split(" ")[0];
    const found = (await get(api, `/v1/products?perPage=100&q=${encodeURIComponent(word)}`)).body.data as Any[];
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) expect(JSON.stringify(p)).toContain(word);
    const desc = (await get(api, "/v1/products?perPage=100&sort=-price")).body.data.map((p: Any) => p.price);
    expect(desc).toEqual([...desc].sort((a: number, b: number) => b - a));
    const asc = (await get(api, "/v1/products?perPage=100&sort=price:asc")).body.data.map((p: Any) => p.price);
    expect(asc).toEqual([...asc].sort((a: number, b: number) => a - b));
    const cat = all[0].categoryId;
    const inCat = (await get(api, `/v1/products?perPage=100&categoryId=${cat}`)).body;
    expect(inCat.data.length).toBe(all.filter((p) => p.categoryId === cat).length);
    expect(inCat.meta.total).toBe(inCat.data.length);
    const ranged = (await get(api, "/v1/products?perPage=100&minPrice=1000000&maxPrice=20000000")).body.data as Any[];
    for (const p of ranged) { expect(p.price).toBeGreaterThanOrEqual(1_000_000); expect(p.price).toBeLessThanOrEqual(20_000_000); }
    const paid = (await get(api, "/v1/orders?pageSize=100&status=paid")).body.result.items as Any[];
    expect(paid.length).toBeGreaterThan(0);
    for (const o of paid) expect(o.status).toBe("paid");
    const two = (await get(api, "/v1/orders?pageSize=100&status=paid,shipped")).body.result.items as Any[];
    expect(two.length).toBeGreaterThan(paid.length);
    const inStock = (await get(api, "/v1/products?perPage=100&inStock=true")).body.data as Any[];
    for (const p of inStock) expect(p.inStock).toBe(true);
    // undeclared params that name a field still filter, and _gte/_lte work
    const users = (await get(api, "/v1/users?role=admin")).body as Any[];
    for (const u of users) expect(u.role).toBe("admin");
    for (const p of (await get(api, "/v1/products?perPage=100&rating_gte=4")).body.data as Any[]) expect(p.rating).toBeGreaterThanOrEqual(4);
  });
  it("nested lists belong to their parent", async () => {
    const api = mk();
    const a = (await get(api, "/v1/categories/3/products")).body.data as Any[];
    expect(a.length).toBeGreaterThan(0);
    for (const p of a) expect(p.categoryId).toBe(3);
    const uid = "11111111-2222-4333-8444-555555555555";
    const o = (await get(api, `/v1/users/${uid}/orders`)).body.result.items as Any[];
    expect(o.length).toBeGreaterThan(0);
    for (const x of o) expect(x.userId).toBe(uid);
    expect((await get(api, `/v1/users/${uid}/orders`)).body.result.items).toEqual(o);
    expect((await get(api, `/v1/orders/${o[0].id}`)).body.result.userId).toBe(uid);
  });
});

describe("mock API: CRUD, persistence, errors, latency", () => {
  it("POST/PUT/PATCH/DELETE mutate the in-memory store", async () => {
    const api = mk();
    const created = await get(api, "/v1/products", { method: "POST", body: JSON.stringify({ title: "میز تحریر", price: 4_500_000, hacker: true }) });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ id: 31, title: "میز تحریر", price: 4_500_000 });
    expect(created.body.data.hacker).toBeUndefined();
    expect(created.headers.location).toBe("/v1/products/31");
    expect((await get(api, "/v1/products")).body.data[0].id).toBe(31);
    expect((await get(api, "/v1/products")).body.meta.total).toBe(31);
    const put = await get(api, "/v1/products/31", { method: "PUT", body: { title: "میز ناهارخوری", id: 999 } });
    expect(put.body.data).toMatchObject({ id: 31, title: "میز ناهارخوری", price: 4_500_000 });
    await get(api, "/v1/products/31", { method: "PATCH", body: { price: 5_000_000 } });
    expect((await get(api, "/v1/products/31")).body.data).toMatchObject({ title: "میز ناهارخوری", price: 5_000_000 });
    const del = await get(api, "/v1/products/31", { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(del.body).toBeUndefined();
    expect((await get(api, "/v1/products/31")).status).toBe(404);
    expect((await get(api, "/v1/products/31")).body).toMatchObject({ isSuccess: false, statusCode: 404, message: "مورد درخواستی پیدا نشد" });
    expect((await get(api, "/v1/products")).body.meta.total).toBe(30);
    api.reset();
    expect((await get(api, "/v1/products/31")).body.data.id).toBe(31);
  });
  it("deep-strips unknown nested fields unless strict: false", async () => {
    const api = mk();
    const r = await get(api, "/v1/products", { method: "POST", body: { title: "x", seller: { shopName: "y", secret: 1 } } });
    expect(r.body.data.seller).toEqual({ shopName: "y" });
    const loose = await get(mk({ strict: false }), "/v1/products", { method: "POST", body: { title: "x", extra: 1 } });
    expect(loose.body.data.extra).toBe(1);
  });
  it("persists changes to storage and restores them", async () => {
    const mem = new Map<string, string>();
    const storage: StorageLike = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
    const a = mk({ persist: { storage } });
    await get(a, "/v1/products", { method: "POST", body: { title: "ذخیره‌شده" } });
    await get(a, "/v1/products/2", { method: "DELETE" });
    expect(mem.size).toBe(1);
    const b = mk({ persist: { storage } });
    expect((await get(b, "/v1/products")).body.data[0].title).toBe("ذخیره‌شده");
    expect((await get(b, "/v1/products/2")).status).toBe(404);
    b.reset();
    expect(mem.size).toBe(0);
    // a changed spec/count invalidates the saved copy
    await get(a, "/v1/products", { method: "POST", body: { title: "x" } });
    expect((await get(mk({ persist: { storage }, count: 5 }), "/v1/products")).body.meta.total).toBe(5);
  });
  it("keeps the store across re-creation with the same id (HMR) and forks a fresh one", async () => {
    const a = mk({ id: "hmr-test" });
    await get(a, "/v1/products", { method: "POST", body: { title: "hmr" } });
    const b = mk({ id: "hmr-test" });
    expect((await get(b, "/v1/products")).body.data[0].title).toBe("hmr");
    const c = b.fork();
    expect((await get(c, "/v1/products")).body.meta.total).toBe(30);
    expect((await get(mk(), "/v1/products")).body.meta.total).toBe(30);
  });
  it("simulates errors (query, header, rules, rate) with the spec's error body", async () => {
    const api = mk({ errors: { "GET /orders": 503, "POST /products": { status: 422, body: { custom: true } } } });
    const e = await get(api, "/v1/products/1?__status=404");
    expect(e.status).toBe(404);
    expect(e.body).toMatchObject({ isSuccess: false, statusCode: 404, errors: [{ message: expect.any(String) }] });
    expect((await get(api, "/v1/products", { headers: { "x-mock-status": "500" } })).status).toBe(500);
    const o = await get(api, "/v1/orders");
    expect(o.status).toBe(503);
    expect(o.body).toMatchObject({ isSuccess: false, statusCode: 503, message: "سرویس موقتاً در دسترس نیست" });
    expect((await get(api, "/v1/products", { method: "POST", body: {} })).body).toEqual({ custom: true });
    const flaky = mk({ errorRate: 1 });
    expect((await get(flaky, "/v1/users")).status).toBe(500);
    expect((await get(flaky, "/v1/users")).body).toMatchObject({ message: "خطای داخلی سرور" });
  });
  it("adds latency", async () => {
    const t0 = Date.now();
    await get(mk({ delay: 40 }), "/v1/users");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
    const t1 = Date.now();
    await get(mk(), "/v1/users?__delay=40");
    expect(Date.now() - t1).toBeGreaterThanOrEqual(35);
  });
  it("custom handlers run first and get params, query, headers and the store", async () => {
    const api = mk({
      handlers: {
        "GET /me": ({ headers, f }) => ({ data: { role: headers.authorization?.includes("admin") ? "admin" : "customer", firstName: f.person().firstName } }),
        "POST /auth/login": ({ body, reply }) => ((body as Any)?.password === "ok" ? { accessToken: "mock-token" } : reply(401, { message: "رمز اشتباه است" })),
        "GET /products/:id/related": ({ params, rows }) => rows("Product").filter((p) => p.id !== Number(params.id)).slice(0, 3),
      },
    });
    expect((await get(api, "/v1/me", { headers: { Authorization: "Bearer admin" } })).body.data.role).toBe("admin");
    expect((await get(api, "/v1/auth/login", { method: "POST", body: { password: "ok" } })).body).toEqual({ accessToken: "mock-token" });
    expect((await get(api, "/v1/auth/login", { method: "POST", body: { password: "no" } })).status).toBe(401);
    expect((await get(api, "/v1/products/5/related")).body).toHaveLength(3);
    expect(api.routes()).toContain("GET /me");
  });
  it("api.fetch returns real Responses; api.request is typed and throws MockHttpError", async () => {
    interface Endpoints {
      "GET /products/{productId}": { response: { data: { id: number; title: string } }; params: { productId: number } };
      "GET /products": { response: { data: { id: number }[]; meta: { total: number } }; query: { page?: number } };
    }
    const api = createMockApi<Endpoints>({ spec: doc, seed: 7, referenceDate: REF });
    const r = await api.fetch("https://api.example.com/v1/products/4");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(((await r.json()) as Any).data.id).toBe(4);
    expect((await api.fetch("/v1/nope")).status).toBe(404);
    const one = await api.request("GET /products/{productId}", { params: { productId: 4 } });
    expectTypeOf(one).toEqualTypeOf<{ data: { id: number; title: string } }>();
    expect(one.data.id).toBe(4);
    const page = await api.request("GET /products", { query: { page: 2 } });
    expect(page.meta.total).toBe(30);
    await expect(createMockApi({ spec: doc, notFound: "404" }).request("GET /products/{productId}", { params: { productId: 777 } })).rejects.toBeInstanceOf(MockHttpError);
  });
  it("loads a spec from JSON text, a URL, or a promise", async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify(doc), { headers: { "content-type": "application/json" } }));
    const viaUrl = createMockApi({ spec: "https://api.example.com/swagger.json", specFetch: fake as Any, seed: 7, referenceDate: REF });
    expect(viaUrl.matches("GET", "/v1/products")).toBe(false); // not loaded yet
    expect((await get(viaUrl, "/v1/products/2")).body.data.id).toBe(2);
    expect(fake).toHaveBeenCalledOnce();
    expect((await get(createMockApi({ spec: JSON.stringify(doc) }), "/v1/products/2")).body.data.id).toBe(2);
    expect((await get(createMockApi({ spec: Promise.resolve(doc) }), "/v1/products/2")).body.data.id).toBe(2);
    const snap = createMockRuntime(JSON.parse(JSON.stringify(compileOpenAPI(doc))) as MockSpec, { seed: 7, referenceDate: REF });
    expect((await get(snap, "/v1/products?page=2")).body).toEqual((await get(mk(), "/v1/products?page=2")).body);
  });
});

describe("defineMockSpec (no OpenAPI)", () => {
  const resources = {
    Product: { fields: { id: "id.index", title: "product.name", price: "product.price", city: "address.city" }, count: 25 },
    Customer: { fields: { _id: "id.objectId", fullName: "person.fullName", mobile: "contact.mobile" }, count: 8 },
  };
  it("envelope presets", async () => {
    const r = createMockApi({ resources, envelope: "result", crud: true, basePath: "/api", seed: 1, referenceDate: REF });
    const l = await get(r, "/api/products?pageNumber=2&pageSize=10");
    expect(l.body).toMatchObject({ isSuccess: true, message: expect.any(String), result: { totalCount: 25, pageNumber: 2, pageSize: 10, totalPages: 3, hasNextPage: true, hasPreviousPage: true } });
    expect((await get(r, "/api/products/3")).body).toMatchObject({ isSuccess: true, result: { id: 3 } });
    expect((await get(r, "/api/products/3?__status=404")).body).toMatchObject({ isSuccess: false, errors: ["مورد درخواستی پیدا نشد"] });
    const c = await get(r, "/api/customers");
    expect(c.body.result.items[0]._id).toMatch(/^[0-9a-f]{24}$/);
    const created = await get(r, "/api/customers", { method: "POST", body: { fullName: "x" } });
    expect(created.body.result._id).toMatch(/^[0-9a-f]{24}$/);
    const spring = createMockApi({ resources, envelope: "spring", crud: true });
    expect((await get(spring, "/products?page=0&size=10")).body).toMatchObject({ number: 0, size: 10, totalElements: 25, totalPages: 3, first: true, last: false, numberOfElements: 10, empty: false });
    expect((await get(spring, "/products?page=2&size=10")).body).toMatchObject({ number: 2, last: true, numberOfElements: 5 });
    const raw = createMockApi({ resources, crud: { Product: "/items" } });
    expect((await get(raw, "/items")).body).toHaveLength(10);
    expect(await raw.handle({ url: "/customers" })).toBeUndefined();
  });
  it("custom routes, templates and generators", async () => {
    const api = createMockApi({
      resources,
      routes: {
        "GET /shop/products": { list: "Product", envelope: { ok: true, rows: "$items", paging: { at: "$page", of: "$pages", n: "$total", next: "$next" } }, query: { pageSize: "take" } },
        "GET /shop/products/:slug": { detail: "Product", params: { slug: "id" }, envelope: { item: "$record", at: "$now" } },
        "GET /banner": { body: { title: "gen:product.name", tag: "ویژه", count: { $int: [1, 3] } } },
      },
    });
    const l = (await get(api, "/shop/products?take=5&page=2")).body;
    expect(l).toMatchObject({ ok: true, paging: { at: 2, of: 5, n: 25, next: 3 } });
    expect(l.rows).toHaveLength(5);
    const d = (await get(api, "/shop/products/4")).body;
    expect(d.item.id).toBe(4);
    expect(new Date(d.at).getFullYear()).toBeGreaterThan(2000);
    const b = (await get(api, "/banner")).body;
    expect(b.tag).toBe("ویژه");
    expect(typeof b.title).toBe("string");
    expect(b.count).toBeGreaterThanOrEqual(1);
    expect(() => defineMockSpec({ resources, routes: { "GET /x": { list: "Nope" } } })).toThrow(/unknown resource/);
  });
});

describe("adapters", () => {
  const api = mk();
  it("apiMode / isMockMode / isEmptyPayload", () => {
    expect(apiMode("mock")).toBe("mock");
    expect(apiMode(" MOCK ")).toBe("mock");
    expect(apiMode("hybrid")).toBe("hybrid");
    expect(apiMode("api")).toBe("api");
    expect(apiMode(undefined, "api")).toBe(process.env.NEXT_PUBLIC_API_MODE || process.env.VITE_API_MODE || process.env.API_MODE ? apiMode() : "api");
    expect(apiMode("nonsense", "hybrid")).toBe("hybrid");
    expect(isMockMode("mock")).toBe(true);
    expect(isEmptyPayload({ data: [], meta: { total: 0 } })).toBe(true);
    expect(isEmptyPayload({ isSuccess: true, result: { items: [], totalCount: 0 } })).toBe(true);
    expect(isEmptyPayload({ isSuccess: true, result: { items: [1] } })).toBe(false);
    expect(isEmptyPayload({ data: null })).toBe(true);
    expect(isEmptyPayload([])).toBe(true);
    expect(isEmptyPayload({ id: 1 })).toBe(false);
  });
  it("createMockFetch answers known routes and passes others through", async () => {
    const real = vi.fn(async () => new Response("real"));
    const api = mk();
    const f = createMockFetch(api, { fetch: real as Any });
    const r = await f("https://api.example.com/v1/products?page=1");
    expect(((await r.json()) as Any).meta.total).toBe(30);
    expect(await (await f("https://cdn.example.com/logo.png")).text()).toBe("real");
    expect(real).toHaveBeenCalledOnce();
    const r2 = await f(new Request("https://api.example.com/v1/products", { method: "POST", body: JSON.stringify({ title: "از Request" }), headers: { "content-type": "application/json" } }));
    expect(r2.status).toBe(201);
    expect(((await r2.json()) as Any).data.title).toBe("از Request");
    const strict = createMockFetch(api, { fetch: real as Any, onUnhandled: "error" });
    expect((await strict("/elsewhere")).status).toBe(404);
  });
  it("createApiFetch: api mode never loads the mock; mock mode lazy-loads it", async () => {
    const real = vi.fn(async () => new Response(JSON.stringify({ real: true }), { headers: { "content-type": "application/json" } }));
    const loader = vi.fn(async () => ({ api }));
    const prod = createApiFetch({ mode: "api", mock: loader, fetch: real as Any });
    expect((await (await prod("/v1/products")).json()) as Any).toEqual({ real: true });
    expect(loader).not.toHaveBeenCalled();
    const dev = createApiFetch({ mode: "mock", mock: loader, fetch: real as Any });
    expect(((await (await dev("/v1/products")).json()) as Any).meta.total).toBe(30);
    await dev("/v1/users");
    expect(loader).toHaveBeenCalledOnce();
  });
  it("hybrid mode: real data when there is some, mock when the backend is empty or down", async () => {
    let backend: () => Promise<Response> = async () => new Response(JSON.stringify({ data: [{ id: 1, title: "real" }], meta: { total: 1 } }), { headers: { "content-type": "application/json" } });
    const f = createApiFetch({ mode: "hybrid", mock: api, fetch: (() => backend()) as Any });
    expect(((await (await f("/v1/products")).json()) as Any).data[0].title).toBe("real");
    backend = async () => new Response(JSON.stringify({ data: [], meta: { total: 0 } }), { headers: { "content-type": "application/json" } });
    expect(((await (await f("/v1/products")).json()) as Any).meta.total).toBe(30);
    backend = async () => { throw new TypeError("fetch failed"); };
    expect(((await (await f("/v1/users")).json()) as Any).length).toBeGreaterThan(0);
    backend = async () => new Response(JSON.stringify({ data: [] }), { headers: { "content-type": "application/json" } });
    expect((await (await f("/v1/auth/login", { method: "POST" })).json()) as Any).toEqual({ data: [] }); // non-GET stays real
    await expect(f("/somewhere/else")).resolves.toBeInstanceOf(Response);
  });
  it("installMockFetch patches and restores globalThis.fetch", async () => {
    const original = globalThis.fetch;
    const uninstall = installMockFetch(api);
    expect(globalThis.fetch).not.toBe(original);
    expect(((await (await fetch("http://localhost:3000/v1/users")).json()) as Any).length).toBeGreaterThan(0);
    uninstall();
    expect(globalThis.fetch).toBe(original);
  });
  it("axios adapter: resolves like axios, rejects with an AxiosError-shaped error, and supports hybrid", async () => {
    const api = mk();
    const adapter = createAxiosAdapter(api);
    const headers = { toJSON: () => ({ Accept: "application/json", "x-mock-status": undefined }) };
    const res = await adapter({ baseURL: "https://api.example.com/v1/", url: "/products", method: "get", params: { page: 2, perPage: 5 }, headers });
    expect(res.status).toBe(200);
    expect((res.data as Any).meta).toEqual({ page: 2, perPage: 5, total: 30, totalPages: 6 });
    const post = await adapter({ baseURL: "https://api.example.com/v1", url: "products", method: "post", data: JSON.stringify({ title: "axios" }) });
    expect(post.status).toBe(201);
    const err = await adapter({ url: "/v1/products/1", method: "get", params: { __status: 404 } }).catch((e) => e);
    expect(err).toMatchObject({ isAxiosError: true, code: "ERR_BAD_REQUEST", status: 404, response: { status: 404, data: { statusCode: 404 } } });
    const ok404 = await adapter({ url: "/v1/products/1?__status=404", validateStatus: () => true });
    expect(ok404.status).toBe(404);
    const realAdapter = vi.fn(async (c: Any) => ({ data: { data: [] }, status: 200, statusText: "OK", headers: {}, config: c, request: {} }));
    const hybrid = createAxiosAdapter(api, { mode: "hybrid", fallback: realAdapter });
    expect(((await hybrid({ url: "/v1/products" })).data as Any).meta.total).toBe(31); // includes the record POSTed above
    const fb = await createAxiosAdapter(api, { fallback: realAdapter })({ url: "/not/mocked" });
    expect(fb.data).toEqual({ data: [] });
  });
  it("MSW handlers (msw passed in, not imported)", async () => {
    const registered: { method: string; path: string; resolver: (i: { request: Request }) => Promise<Response | undefined> }[] = [];
    const reg = (method: string) => (path: string, resolver: Any) => { registered.push({ method, path, resolver }); return { method, path }; };
    const http = { all: reg("all"), get: reg("get"), post: reg("post"), put: reg("put"), patch: reg("patch"), delete: reg("delete") };
    const handlers = createMswHandlers(api, { http });
    expect(handlers.length).toBe(api.routes().length);
    expect(registered.find((h) => h.method === "get" && h.path === "*/v1/products/:productId")).toBeTruthy();
    const h = registered.find((x) => x.path === "*/v1/products/:productId")!;
    const res = await h.resolver({ request: new Request("http://localhost/v1/products/6") });
    expect(((await res!.json()) as Any).data.id).toBe(6);
    const all = createMswHandlers(api, { http, catchAll: true });
    expect(all).toHaveLength(1);
    expect(await registered[registered.length - 1].resolver({ request: new Request("http://localhost/unknown") })).toBeUndefined();
  });
  it("Next.js route handlers (mount, per-session stores) and middleware", async () => {
    const { GET, POST } = createNextRouteHandlers(() => Promise.resolve({ default: mk() }), { mount: "/api/mock", session: true });
    const first = await GET(new Request("http://localhost:3000/api/mock/products?perPage=2"));
    expect(((await first.json()) as Any).data).toHaveLength(2);
    const cookie = first.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^farsi_mock_session=[\w-]+; Path=\/; HttpOnly/);
    const jar = cookie.split(";")[0];
    await POST(new Request("http://localhost:3000/api/mock/products", { method: "POST", body: JSON.stringify({ title: "جلسه" }), headers: { cookie: jar } }));
    const mine: Any = await (await GET(new Request("http://localhost:3000/api/mock/products", { headers: { cookie: jar } }))).json();
    expect(mine.data[0].title).toBe("جلسه");
    const other: Any = await (await GET(new Request("http://localhost:3000/api/mock/products"))).json();
    expect(other.data[0].title).not.toBe("جلسه");
    expect((await GET(new Request("http://localhost:3000/api/mock/nothing"))).status).toBe(404);
    const mw = createMockMiddleware(api, { prefix: "/v1" });
    expect((await mw(new Request("http://localhost/v1/users")))!.status).toBe(200);
    expect(await mw(new Request("http://localhost/about"))).toBeUndefined();
  });
  it("combineMockApis serves several backends", async () => {
    const other = createMockApi({ resources: { Ticket: { fields: { id: "id.index", subject: "text.sentence" }, count: 4 } }, crud: true, basePath: "/support" });
    const both = combineMockApis(api, other);
    expect((await get(both, "/support/tickets")).body).toHaveLength(4);
    expect((await get(both, "/v1/products/1")).body.data.id).toBe(1);
    expect(both.matches("GET", "/support/tickets/1")).toBe(true);
    expect(both.rows("Ticket")).toHaveLength(4);
    expect(both.routes().length).toBe(api.routes().length + other.routes().length);
  });
});
