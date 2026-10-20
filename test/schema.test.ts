import { describe, it, expect } from "vitest";
import { createIran, literal, toCsv, toJsonl, fromJson, Schema, type SchemaDef } from "../src/index.js";
import { validateNationalId, validateSheba } from "./parsi/validators.js";
import { landlineProvince } from "./parsi/phone.js";
import { MALE_NAMES, UNISEX_NAMES } from "../src/data/names.js";

const REF = "2026-10-20T00:00:00Z";
const make = (seed = 42) => createIran({ seed, referenceDate: REF });

describe("determinism", () => {
  it("same seed, same output", () => {
    const a = make(7), b = make(7);
    expect(a.presets.order.many(20)).toEqual(b.presets.order.many(20));
    expect(a.many(() => a.person(), 50)).toEqual(b.many(() => b.person(), 50));
  });
  it("seed() resets the stream; different seeds differ", () => {
    const f = make(1);
    const x = f.presets.user.many(5);
    f.seed(1);
    expect(f.presets.user.many(5)).toEqual(x);
    expect(make(2).presets.user.many(5)).not.toEqual(x);
  });
  it("string seeds work", () => { expect(make("abc" as unknown as number).uuid()).toBe(make("abc" as unknown as number).uuid()); });
});

describe("schema consistency", () => {
  const f = make();
  const User = f.schema({
    nid: "person.nationalId",
    name: "person.fullName",
    first: "person.firstName",
    sex: "person.gender",
    phone_number: (x, c) => c.contact.mobile,
    tel: "contact.landline",
    zip: "contact.postalCode",
    addr: { prov: "address.province", city: "address.city", zip: "address.postalCode" },
    province: "province.name",
    status: literal("active"),
    score: 10,
    verified: true,
  });
  const rows = User.many(500);

  it("fields of a record describe the same person and place", () => {
    for (const r of rows) {
      const addr = r.addr as Record<string, string>;
      expect(r.name).toMatch(new RegExp(`^${r.first} `));
      expect(addr.prov).toBe(r.province);
      expect(addr.zip).toBe(r.zip);
      expect(landlineProvince(r.tel as string).province?.fa).toBe(r.province);
      expect(validateNationalId(r.nid as string)).toBe(true);
      if (!UNISEX_NAMES.some((n) => n[0] === r.first)) expect(MALE_NAMES.some((n) => n[0] === r.first)).toBe(r.sex === "male");
      expect(r.status).toBe("active");
      expect(r.score).toBe(10);
      expect(r.verified).toBe(true);
    }
  });
  it("context option pins province and gender", () => {
    const rs = User.many(100, { province: "اصفهان", gender: "female" });
    for (const r of rs) { expect(r.province).toBe("اصفهان"); expect(r.sex).toBe("female"); expect((r.tel as string).startsWith("031")).toBe(true); expect((r.nid as string).startsWith("000")).toBe(true); }
    for (const r of User.many(100, { province: "Tehran", city: "تهران", realisticIds: true })) expect((r.nid as string).slice(0, 2)).toBe("00");
    for (const r of User.many(50, { province: "Fars", city: "شیراز", realisticIds: true })) expect(["228", "229", "230"]).toContain((r.nid as string).slice(0, 3));
  });
  it("arrays: fresh item entities, same person", () => {
    const S = f.schema({
      owner: "person.fullName",
      items: f.array(3, { name: "product.name", price: "product.price", buyer: "person.fullName" }),
      phones: (x) => x.array([2, 4], "phone.mobile"),
    });
    for (const r of S.many(50)) {
      const items = r.items as { name: string; buyer: string }[];
      expect(items).toHaveLength(3);
      for (const it of items) expect(it.buyer).toBe(r.owner);
      expect(new Set(items.map((i) => i.name)).size).toBeGreaterThan(1);
      expect((r.phones as string[]).length).toBeGreaterThanOrEqual(2);
    }
  });
  it("refs between schemas and datasets", () => {
    const Users = f.schema({ id: "id.uuid", name: "person.fullName" });
    const users = Users.many(10);
    const Orders = f.schema({ id: "id.uuid", userId: f.ref(Users), buyer: f.ref(users, "name") });
    const ids = new Set(users.map((u) => u.id));
    const names = new Set(users.map((u) => u.name));
    for (const o of Orders.many(100)) { expect(ids.has(o.userId as string)).toBe(true); expect(names.has(o.buyer as string)).toBe(true); }

    const ds = f.dataset({ users: [Users, 5], orders: { schema: { id: "id.index", userId: "ref:users.id" }, count: 20 } });
    const dsIds = new Set(ds.users.map((u) => u.id));
    expect(ds.orders).toHaveLength(20);
    for (const o of ds.orders) expect(dsIds.has(o.userId as string)).toBe(true);
  });
  it("ctx.record exposes earlier fields", () => {
    const S = f.schema({ a: (x) => x.int(1, 9), b: (_x, c) => Number(c.record!.a) * 2 });
    for (const r of S.many(20)) expect(r.b).toBe((r.a as number) * 2);
  });
  it("rename / omit / extend / case", () => {
    const U = f.presets.user.rename({ mobile: "phone_number" }).omit("email").extend({ sheba: "bank.sheba" }).withCase("snake");
    const r = U.one();
    expect(r).toHaveProperty("phone_number");
    expect(r).toHaveProperty("national_id");
    expect(r).toHaveProperty("first_name");
    expect(r).not.toHaveProperty("email");
    expect(validateSheba(r.sheba as string)).toBe(true);
    expect(Object.keys(f.presets.user.withCase("pascal").one())).toContain("NationalId");
  });
  it("unknown paths fail early with a hint", () => {
    expect(() => f.schema({ x: "person.nationalCode" })).toThrow(/unknown path "person.nationalCode".*person.nationalId/);
  });
});

describe("JSON schema files", () => {
  it("supports $array, $pick, $int, $template, $gen, $literal and refs", () => {
    const f = make();
    const def = fromJson(f, {
      id: "id.index",
      code: { $template: "U-{id.index}-{person.lastNameEn}" },
      role: { $pick: ["admin", "user"] },
      age: { $int: [18, 30] },
      tag: { $literal: "person.fullName" },
      mobile: { $gen: "mobile", args: { operator: "Rightel" } },
      tags: { $array: 2, of: "text.word" },
    }) as SchemaDef;
    for (const r of new Schema(f, def).many(30)) {
      expect(r.code).toMatch(/^U-\d+-[A-Za-z]+$/);
      expect(["admin", "user"]).toContain(r.role);
      expect(r.age as number).toBeGreaterThanOrEqual(18);
      expect(r.tag).toBe("person.fullName");
      expect(r.mobile).toMatch(/^092[0-2]/);
      expect(r.tags).toHaveLength(2);
    }
    expect(() => fromJson(f, { x: { $gen: "constructor" } })).toThrow(/not allowed/);
  });
});

describe("output", () => {
  it("CSV escaping (RFC 4180)", () => {
    const csv = toCsv([{ a: 'he said "hi"', b: "x,y", c: "line1\nline2", d: null, e: { f: 1 }, g: [1, 2], h: " pad" }]);
    expect(csv).toBe('a,b,c,d,e.f,g,h\r\n"he said ""hi""","x,y","line1\nline2",,1,"[1,2]"," pad"\r\n');
    expect(toCsv([{ a: 1 }], { bom: true }).startsWith("\uFEFF")).toBe(true);
    expect(toCsv([{ a: "x;y" }, { b: 2 }], { delimiter: ";", eol: "\n" })).toBe('a;b\n"x;y";\n;2\n');
  });
  it("CSV round-trips Persian text and keeps leading zeros", () => {
    const f = make();
    const rows = f.presets.user.many(3);
    const csv = toCsv(rows);
    for (const r of rows) { expect(csv).toContain(r.mobile as string); expect(csv).toContain(r.fullName as string); }
  });
  it("JSONL", () => {
    const out = toJsonl([{ a: 1 }, { b: "ب" }]);
    expect(out).toBe('{"a":1}\n{"b":"ب"}\n');
  });
});
