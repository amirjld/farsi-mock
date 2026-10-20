import { describe, it, expect, expectTypeOf } from "vitest";
import { createIran, literal } from "../src/index.js";
import { fromJson } from "../src/schema.js";

const f = createIran({ seed: 31, referenceDate: "2026-10-20T00:00:00Z" });

describe("constraint markers", () => {
  it("unique() within a run, reset per many()", () => {
    const S = f.schema({ n: f.unique((x) => x.int(1, 50)), email: f.unique("contact.email") });
    const rs = S.many(50);
    expect(new Set(rs.map((r) => r.n)).size).toBe(50);
    expect(new Set(rs.map((r) => r.email)).size).toBe(50);
    expect(S.many(50)).toHaveLength(50);
    expect(() => f.schema({ n: f.unique((x) => x.int(1, 5), { maxRetries: 30 }) }).many(10)).toThrow(/unique/);
  });
  it("nullable / optional rates", () => {
    const S = f.schema({ a: f.nullable("person.firstName", 0.3), b: f.optional("contact.mobile", 0.5), c: f.nullable("id.uuid", 0) });
    const rs = S.many(2000);
    const nulls = rs.filter((r) => r.a === null).length, missing = rs.filter((r) => !("b" in r)).length;
    expect(nulls).toBeGreaterThan(450); expect(nulls).toBeLessThan(750);
    expect(missing).toBeGreaterThan(850); expect(missing).toBeLessThan(1150);
    expect(rs.every((r) => typeof r.c === "string")).toBe(true);
    expect(rs.every((r) => r.b === undefined || /^09\d{9}$/.test(r.b))).toBe(true);
    expect(() => f.nullable("id.uuid", 2)).toThrow(/rate/);
  });
  it("weighted & oneOf", () => {
    const S = f.schema({ status: f.weighted([["active", 8], ["banned", 1], ["pending", 1]] as const), who: f.oneOf("person.fullName", literal("guest")) });
    const rs = S.many(2000);
    const active = rs.filter((r) => r.status === "active").length;
    expect(active).toBeGreaterThan(1450); expect(active).toBeLessThan(1750);
    expect(rs.some((r) => r.who === "guest")).toBe(true);
    expect(rs.some((r) => r.who !== "guest")).toBe(true);
  });
  it("uniqueBy (single and compound)", () => {
    const S = f.schema({ city: "city.name", day: (x) => x.int(1, 3), code: (x) => x.int(1, 40) }, { uniqueBy: ["code", ["city", "day"]] });
    const rs = S.many(40);
    expect(new Set(rs.map((r) => r.code)).size).toBe(40);
    expect(new Set(rs.map((r) => `${r.city}|${r.day}`)).size).toBe(40);
    expect(() => f.schema({ x: (g) => g.int(1, 3) }, { uniqueBy: "x" }).many(5)).toThrow(/uniqueBy/);
  });
  it("digits option", () => {
    const fa = f.schema({ addr: "address.formatted", email: "contact.email", mobile: "contact.mobile", t: literal("سال 1405") }, { digits: "fa" }).one();
    expect(fa.t).toBe("سال ۱۴۰۵");
    expect(fa.email).toMatch(/@example\./);
    expect(fa.mobile).toMatch(/^09\d+$/);
    const all = f.schema({ mobile: "contact.mobile" }, { digits: "fa", digitsAll: true }).one();
    expect(all.mobile).toMatch(/^۰۹[۰-۹]+$/);
    const lat = f.schema({ addr: "address.formatted" }, { digits: "latin" }).one();
    expect(lat.addr).not.toMatch(/[۰-۹]/);
  });
});

describe("datasets with stable references", () => {
  it("per-parent counts and parent paths", () => {
    const d = f.dataset({
      users: { schema: { id: "id.uuid", name: "person.fullName" }, count: 20 },
      orders: { schema: { id: f.unique("commerce.orderNumber"), userId: "parent.id", buyer: "parent.name" }, count: { per: "users", min: 1, max: 3 } },
      reviews: { schema: { orderId: "ref:orders.id", rating: "number.rating" }, count: 30 },
      profiles: { schema: { userId: f.ref("users", { unique: true }) }, count: 20 },
    });
    expect(d.orders.length).toBeGreaterThanOrEqual(20); expect(d.orders.length).toBeLessThanOrEqual(60);
    const byId = new Map(d.users.map((u) => [u.id, u]));
    for (const o of d.orders) expect(byId.get(o.userId as string)?.name).toBe(o.buyer);
    for (const u of d.users) { const n = d.orders.filter((o) => o.userId === u.id).length; expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(3); }
    expect(new Set(d.orders.map((o) => o.id)).size).toBe(d.orders.length);
    const orderIds = new Set(d.orders.map((o) => o.id));
    for (const r of d.reviews) expect(orderIds.has(r.orderId as string)).toBe(true);
    expect(new Set(d.profiles.map((p) => p.userId)).size).toBe(20);
    expect(() => f.dataset({ a: { schema: { x: f.ref("users", { unique: true }) }, count: 1 } })).toThrow(/users/);
    expect(() => f.dataset({ u: [{ id: "id.uuid" }, 2], p: { schema: { x: f.ref("u", { unique: true }) }, count: 3 } })).toThrow(/exhausted/);
    expect(() => f.schema({ x: "parent.id" }).one()).toThrow(/per/);
  });
  it("datasets are deterministic", () => {
    const run = () => createIran({ seed: "ds", referenceDate: "2026-01-01T00:00:00Z" }).dataset({
      users: [{ id: "id.uuid", n: "person.fullName" }, 5], orders: { schema: { u: "parent.id", p: "commerce.price" }, count: { per: "users", count: 2 } },
    });
    expect(run()).toEqual(run());
    expect(run().orders).toHaveLength(10);
  });
  it("JSON schema files support the new markers", () => {
    const g = createIran({ seed: 4 });
    const def = fromJson(g, {
      id: { $unique: { $int: [1, 30] } }, nick: { $nullable: "person.firstName", rate: 1 }, extra: { $optional: "text.word", rate: 1 },
      kind: { $weighted: [["a", 1], ["b", 0]] }, any: { $oneOf: [{ $literal: "x" }] }, code: { $regex: "^[A-Z]{2}\\d{3}$" },
    });
    const rs = g.schema(def as Record<string, never>).many(30);
    expect(new Set(rs.map((r) => (r as Record<string, unknown>).id)).size).toBe(30);
    for (const r of rs as Record<string, unknown>[]) {
      expect(r.nick).toBeNull(); expect("extra" in r).toBe(false); expect(r.kind).toBe("a"); expect(r.any).toBe("x");
      expect(r.code).toMatch(/^[A-Z]{2}\d{3}$/);
    }
  });
});

describe("type inference", () => {
  it("schema() infers output types", () => {
    const User = f.schema({
      id: "id.uuid", age: "person.age", person: "person", tags: f.array(2, "text.word"),
      nick: f.nullable("person.firstName"), bio: f.optional("text.sentence"), role: f.weighted([["admin", 1], ["user", 9]] as const),
      lit: literal("x"), n: 5, fn: (x) => x.int(1, 2), when: (x) => x.recentDate(), nested: { city: "city.name" },
    });
    const u = User.one();
    expectTypeOf(u.id).toEqualTypeOf<string>();
    expectTypeOf(u.age).toEqualTypeOf<number>();
    expectTypeOf(u.person.nationalId).toEqualTypeOf<string>();
    expectTypeOf(u.tags).toEqualTypeOf<string[]>();
    expectTypeOf(u.nick).toEqualTypeOf<string | null>();
    expectTypeOf(u.bio).toEqualTypeOf<string | undefined>();
    expectTypeOf(u.role).toEqualTypeOf<"admin" | "user">();
    expectTypeOf(u.lit).toEqualTypeOf<"x">();
    expectTypeOf(u.fn).toEqualTypeOf<number>();
    expectTypeOf(u.when).toEqualTypeOf<string>();
    expectTypeOf(u.nested.city).toEqualTypeOf<string>();
    const Small = User.pick("id", "age").extend({ mobile: "contact.mobile" }).rename({ age: "years" });
    expectTypeOf(Small.one()).toEqualTypeOf<{ id: string; years: number; mobile: string }>();
    const d = f.dataset({ users: [User, 2], orders: { schema: { total: "order.total" }, count: 1 } });
    expectTypeOf(d.users[0].id).toEqualTypeOf<string>();
    expectTypeOf(d.orders[0].total).toEqualTypeOf<number>();
    expect(typeof u.when).toBe("string");
    expect(Object.keys(Small.one()).sort()).toEqual(["id", "mobile", "years"]);
  });
});
