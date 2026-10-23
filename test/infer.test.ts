import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { z as z3 } from "zod/v3";
import { createIran } from "../src/index.js";
import { matchAlias, detectSource, parseSample, detectFormat } from "../src/infer/index.js";
import { validateNationalId, validateCardNumber, validateSheba, normalizeMobile } from "./parsi/validators.js";
import { validatePostalCode } from "./parsi/phone.js";

const f = createIran({ seed: 11, referenceDate: "2026-10-20T00:00:00Z" });

describe("alias dictionary", () => {
  // [field name as found in real-world code, expected generator]
  const cases: [string, string][] = [
    ["nationalCode", "person.nationalId"], ["national_code", "person.nationalId"], ["NationalId", "person.nationalId"], ["code-melli", "person.nationalId"],
    ["codeMelli", "person.nationalId"], ["nid", "person.nationalId"], ["kodMelli", "person.nationalId"], ["user_national_id", "person.nationalId"], ["customerNationalCode", "person.nationalId"],
    ["mobile", "contact.mobile"], ["phone", "contact.mobile"], ["phoneNumber", "contact.mobile"], ["tel", "contact.mobile"], ["mobile_number", "contact.mobile"], ["CustomerMobile", "contact.mobile"], ["cellPhone", "contact.mobile"], ["shomare_tamas", "contact.mobile"],
    ["homePhone", "contact.landline"], ["landline", "contact.landline"], ["tel_sabet", "contact.landline"],
    ["sheba", "bank.sheba"], ["iban", "bank.sheba"], ["shabaNumber", "bank.sheba"], ["IBAN", "bank.sheba"], ["shomare_sheba", "bank.sheba"],
    ["card", "bank.cardNumber"], ["pan", "bank.cardNumber"], ["cardNumber", "bank.cardNumber"], ["card_no", "bank.cardNumber"], ["shomareKart", "bank.cardNumber"],
    ["postalCode", "address.postalCode"], ["zip", "address.postalCode"], ["zip_code", "address.postalCode"], ["PostCode", "address.postalCode"], ["codePosti", "address.postalCode"],
    ["province", "address.province"], ["ostan", "address.province"], ["city", "address.city"], ["shahr", "address.city"], ["city_name", "address.city"],
    ["birthDate", "person.birthDate"], ["tavalod", "person.birthDate"], ["date_of_birth", "person.birthDate"], ["dob", "person.birthDate"], ["tarikh_tavalod", "person.birthDate"],
    ["firstName", "person.firstName"], ["first_name", "person.firstName"], ["FirstName", "person.firstName"], ["nam", "person.firstName"], ["fname", "person.firstName"],
    ["lastName", "person.lastName"], ["family", "person.lastName"], ["surname", "person.lastName"], ["nam_khanevadegi", "person.lastName"],
    ["fullName", "person.fullName"], ["full-name", "person.fullName"], ["email", "contact.email"], ["emailAddress", "contact.email"], ["user_email", "contact.email"],
    ["address", "address.formatted"], ["neshani", "address.formatted"], ["shipping_address", "address.formatted"], ["fatherName", "person.fatherName"], ["name_pedar", "person.fatherName"],
    ["gender", "person.gender"], ["jensiat", "person.gender"], ["age", "person.age"], ["companyName", "company.name"], ["shenaseMelli", "company.legalNationalId"],
    ["economicCode", "company.economicCode"], ["accountNumber", "bank.accountNumber"], ["bankName", "bank.bankName"], ["lat", "address.latitude"], ["lng", "address.longitude"],
    ["orderNumber", "commerce.orderNumber"], ["tracking_code", "commerce.orderNumber"], ["createdAt", "date.past"], ["updated_at", "date.recent"], ["plateNumber", "vehicle.plate"],
    ["madrak", "person.education"], ["adress", "address.formatted"],
  ];
  it("maps real-world names across cases and languages (>= 95% accuracy)", () => {
    const misses = cases.filter(([name, want]) => matchAlias(name)?.alias.gen !== want);
    expect(misses.length / cases.length, JSON.stringify(misses)).toBeLessThanOrEqual(0.05);
  });
  it("model context disambiguates generic names", () => {
    expect(matchAlias("name", "product", "string")?.alias.gen).toBe("product.name");
    expect(matchAlias("name", "company", "string")?.alias.gen).toBe("company.name");
    expect(matchAlias("name", "person", "string")?.alias.gen).toBe("person.fullName");
    expect(matchAlias("title", "product", "string")?.alias.gen).toBe("product.name");
    expect(matchAlias("price", "any", "boolean")).toBeUndefined();
    expect(matchAlias("emailVerified")).toBeUndefined();
    expect(matchAlias("user_id")).toBeUndefined();
    expect(matchAlias("phoneCount")).toBeUndefined();
  });
});

describe("Prisma", () => {
  const r = f.fromPrisma(readFileSync(new URL("./fixtures/shop.prisma", import.meta.url), "utf8"));
  it("parses models, enums, relations, attributes", () => {
    expect(r.modelNames).toEqual(["User", "Product", "Order"]);
    const byField = Object.fromEntries(r.report.map((x) => [`${x.model}.${x.field}`, x]));
    expect(byField["User.codeMelli"].generator).toMatchObject({ $unique: {} });
    expect(byField["User.role"].generator).toEqual({ $pick: ["ADMIN", "CUSTOMER", "SELLER"] });
    expect(byField["Order.userId"].generator).toBe("ref:User.id");
    expect(byField["Order.productId"].generator).toBe("ref:Product.id");
    expect(byField["Product.id"].generator).toBe("id.index");
    expect(r.confidence).toBeGreaterThan(0.85);
  });
  it("dataset has valid, linked data", () => {
    const d = r.dataset({ User: 20, Product: 10, Order: 40 });
    const users = new Set(d.User.map((u) => u.id));
    for (const u of d.User) {
      expect(validateNationalId(u.codeMelli as string)).toBe(true);
      expect((u.codeMelli as string).startsWith("000")).toBe(true);
      expect(normalizeMobile(u.mobile as string)).toBeTruthy();
      expect(String(u.email)).toMatch(/@example\./);
      expect(validatePostalCode(u.zipCode as string).valid).toBe(true);
      expect(u.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    }
    expect(new Set(d.User.map((u) => u.mobile)).size).toBe(20);
    for (const o of d.Order) { expect(users.has(o.userId)).toBe(true); expect(validateSheba(o.shebaNumber as string)).toBe(true); }
    expect(r.toJSON()).toHaveProperty("entities.Order.fields.userId", "ref:User.id");
    expect(r.explain()).toMatch(/average confidence/);
  });
  it("useDbNames and model filter", () => {
    const u = f.fromPrisma(readFileSync(new URL("./fixtures/shop.prisma", import.meta.url), "utf8"), { model: "User", useDbNames: true });
    expect(u.modelNames).toEqual(["User"]);
    expect(Object.keys(u.fields())).toContain("zip_code");
    expect(() => f.fromPrisma("enum A { X }")).toThrow(/model/);
  });
});

describe("Zod (v3 and v4 shapes, no runtime dependency)", () => {
  for (const [label, Z] of [["v4", z], ["v3", z3]] as const) {
    it(`zod ${label}`, () => {
      const zz = Z as typeof z3;
      const User = zz.object({
        id: zz.string().uuid(), national_code: zz.string().length(10), mobile: zz.string(), email: zz.string().email(),
        age: zz.number().int().min(18).max(30), status: zz.enum(["active", "banned"]), nickname: zz.string().max(5).optional(),
        tags: zz.array(zz.string()).min(1).max(2), address: zz.object({ city: zz.string(), postalCode: zz.string() }), joined: zz.date(),
        code: zz.string().regex(/^[A-Z]{3}-\d{4}$/), score: zz.number().nullable(), website: zz.string().url(),
      });
      const r = f.fromZod(User, { name: "User" });
      for (const u of r.schema().many(100)) {
        expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(validateNationalId(u.national_code as string)).toBe(true);
        expect(u.age).toBeGreaterThanOrEqual(18); expect(u.age).toBeLessThanOrEqual(30);
        expect(["active", "banned"]).toContain(u.status);
        expect(String(u.nickname).length).toBeLessThanOrEqual(5);
        expect((u.tags as unknown[]).length).toBeGreaterThanOrEqual(1); expect((u.tags as unknown[]).length).toBeLessThanOrEqual(2);
        expect(validatePostalCode((u.address as Record<string, string>).postalCode).valid).toBe(true);
        expect(u.code).toMatch(/^[A-Z]{3}-\d{4}$/);
        expect(String(u.website)).toMatch(/^https:\/\/.*example\.com$/);
        expect(User.safeParse({ ...u, joined: new Date(u.joined as string) }).success).toBe(true);
      }
    });
  }
});

describe("JSON Schema and OpenAPI", () => {
  it("JSON Schema with $defs, $ref, nullable types, formats", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema", title: "Customer", type: "object", required: ["id", "phone"],
      properties: {
        id: { type: "integer", minimum: 1 }, phone: { type: "string" }, sheba: { type: "string" }, contact_email: { type: "string", format: "email" },
        createdAt: { type: "string", format: "date-time" }, birthday: { type: "string", format: "date" }, level: { enum: ["gold", "silver"] },
        home: { $ref: "#/$defs/Address" }, credit: { type: ["number", "null"], minimum: 0, maximum: 100 }, ref: { type: "string", format: "uuid" },
      },
      $defs: { Address: { type: "object", properties: { ostan: { type: "string" }, zip: { type: "string" } } } },
    };
    const r = f.fromJsonSchema(schema);
    expect(detectSource(schema)).toBe("jsonschema");
    for (const c of r.schema().many(50)) {
      expect(normalizeMobile(c.phone as string)).toBeTruthy();
      expect(validateSheba(c.sheba as string)).toBe(true);
      expect(c.birthday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(c.createdAt as string).toISOString()).toBe(c.createdAt);
      expect(validatePostalCode((c.home as Record<string, string>).zip).valid).toBe(true);
      expect(c.credit as number).toBeGreaterThanOrEqual(0); expect(c.credit as number).toBeLessThanOrEqual(100);
    }
  });
  it("OpenAPI 3 and Swagger 2", () => {
    const oas = {
      openapi: "3.0.3", info: { title: "x", version: "1" }, paths: {},
      components: { schemas: {
        Seller: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, shenase_melli: { type: "string" }, card_number: { type: "string" } } },
        Item: { allOf: [{ $ref: "#/components/schemas/Base" }, { type: "object", properties: { title: { type: "string" }, price: { type: "integer", minimum: 1000, maximum: 5000 } } }] },
        Base: { type: "object", properties: { id: { type: "integer", readOnly: true } } },
      } },
    };
    expect(detectSource(oas)).toBe("openapi");
    const r = f.fromOpenAPI(oas);
    const d = r.dataset(20);
    for (const s of d.Seller) expect(validateCardNumber(s.card_number as string)).toBe(true);
    for (const i of d.Item) { expect(i.price as number).toBeGreaterThanOrEqual(1000); expect(i.price as number).toBeLessThanOrEqual(5000); expect(typeof i.title).toBe("string"); }
    expect(r.report.find((x) => x.model === "Seller" && x.field === "name")?.generator).toBe("company.name");
    const sw = f.fromOpenAPI({ swagger: "2.0", definitions: { Pet: { type: "object", properties: { id: { type: "integer" }, tel: { type: "string" } } } } });
    expect(normalizeMobile(sw.many(1)[0].tel as string)).toBeTruthy();
    expect(() => f.fromOpenAPI({ openapi: "3.0.0", components: { schemas: {} } })).toThrow(/no object schemas/);
    expect(() => f.fromOpenAPI(oas, { model: "Nope" })).toThrow(/not found/);
  });
});

describe("Mongoose (definition objects, no dependency)", () => {
  function ObjectId() {}
  it("types, refs, enums, timestamps", () => {
    const userDef = { name: { type: String, required: true }, mobile: String, nationalCode: { type: String, unique: true }, role: { type: String, enum: ["user", "admin"] }, age: { type: Number, min: 18, max: 25 }, addresses: [{ city: String, postalCode: String }] };
    const fakeSchema = (obj: object, options: object) => ({ obj, options, path: () => undefined });
    const users = f.fromMongoose(fakeSchema(userDef, { timestamps: true }), { name: "users" });
    const fields = users.fields();
    expect(Object.keys(fields)).toEqual(["_id", "name", "mobile", "nationalCode", "role", "age", "addresses", "createdAt", "updatedAt"]);
    expect(fields._id).toBe("id.objectId");
    const orderDef = { user: { type: ObjectId, ref: "users" }, items: [{ title: String, price: Number }], total: Number };
    const r = f.infer(fakeSchema(orderDef, {}), { name: "orders", models: ["users"] });
    expect(r.fields().user).toBe("ref:users._id");
    for (const u of users.many(30)) {
      expect(validateNationalId(u.nationalCode as string)).toBe(true);
      expect(u._id).toMatch(/^[0-9a-f]{24}$/);
      expect(u.age as number).toBeLessThanOrEqual(25);
    }
  });
});

describe("samples", () => {
  const sample = [
    { _id: { $oid: "65a000000000000000000001" }, nam: "x", tel: "09120000000", code: "0010350829", iban: "IR820540102680020817909002", kart: "6037991234567893", when: "1405/07/01", status: "open", n: 3, ok: true, created: { $date: "2026-01-01T00:00:00Z" } },
    { _id: { $oid: "65a000000000000000000002" }, nam: "y", tel: "09350000000", code: "0010350829", iban: "IR820540102680020817909002", kart: "6037991234567893", when: "1405/07/02", status: "closed", n: 9, ok: false, created: { $date: "2026-01-02T00:00:00Z" } },
  ];
  it("detects formats without copying values", () => {
    expect(detectFormat("۰۹۱۲۰۰۰۰۰۰۰")).toBe("ir-mobile");
    expect(detectFormat("0010350829")).toBe("ir-national-id");
    const specs = parseSample(sample);
    expect(specs[0].fields.find((x) => x.name === "_id")?.type).toBe("objectId");
    const r = f.fromSample(sample);
    const recs = r.schema().many(20);
    for (const x of recs) {
      expect(validateNationalId(x.code as string)).toBe(true);
      expect(x.code).not.toBe("0010350829");
      expect(validateSheba(x.iban as string)).toBe(true);
      expect(validateCardNumber(x.kart as string)).toBe(true);
      expect(x.when).toMatch(/^14\d\d\/\d\d\/\d\d$/);
      expect(x.n as number).toBeGreaterThanOrEqual(3); expect(x.n as number).toBeLessThanOrEqual(9);
      expect(typeof x.ok).toBe("boolean");
    }
    const flat = JSON.stringify(recs);
    expect(flat).not.toContain("09120000000");
    expect(flat).not.toContain("IR820540102680020817909002");
  });
  it("overrides and low-confidence report", () => {
    const r = f.fromSample({ foo: "bar", tel: "09121111111" }, { overrides: { foo: "person.fullName" } });
    expect(r.report.find((x) => x.field === "foo")).toMatchObject({ confidence: 1, generator: "person.fullName" });
    const r2 = f.fromSample({ foo: "bar" });
    expect(r2.lowConfidence().map((x) => x.field)).toEqual(["foo"]);
    expect(f.fromSample({ x: [{ a: 1 }] }).toJSON()).toHaveProperty("fields");
  });
  it("null and optional rates", () => {
    const r = f.fromJsonSchema({ type: "object", properties: { a: { type: ["string", "null"] }, b: { type: "string" } } }, { nullRate: 0.5, optionalRate: 0.5 });
    const rs = r.schema().many(400);
    expect(rs.filter((x) => x.a === null).length).toBeGreaterThan(120);
    expect(rs.filter((x) => !("b" in x)).length).toBeGreaterThan(120);
  });
  it("inference is deterministic", () => {
    const run = () => createIran({ seed: 3, referenceDate: "2026-01-01T00:00:00Z" }).fromPrisma(readFileSync(new URL("./fixtures/shop.prisma", import.meta.url), "utf8")).dataset(5);
    expect(run()).toEqual(run());
  });
});

describe("id-formatted foreign keys (2.0.1)", () => {
  const fieldLine = (explain: string, field: string) => explain.split("\n").find((l) => l.trimStart().startsWith(field + " ")) ?? "";

  it("OpenAPI: a uuid userId links to User.id instead of a random uuid", () => {
    const doc = JSON.parse(readFileSync(new URL("./fixtures/shop.openapi.json", import.meta.url), "utf8"));
    const r = f.fromOpenAPI(doc);
    expect(fieldLine(r.explain(), "Order.userId")).toContain("ref:User.id");
    const d = r.dataset(10);
    const ids = new Set(d.User.map((u) => u.id));
    for (const o of d.Order) expect(ids.has(o.userId)).toBe(true);
  });

  it("zod: z.string().uuid() userId links to User.id", () => {
    // Post is declared before User: dataset() still generates User first so the refs resolve
    const r = f.fromZod({ Post: z.object({ id: z.string().uuid(), userId: z.string().uuid() }), User: z.object({ id: z.string().uuid(), name: z.string() }) });
    expect(fieldLine(r.explain(), "Post.userId")).toContain("ref:User.id");
    const d = r.dataset({ User: 4, Post: 12 });
    const ids = new Set(d.User.map((u) => u.id));
    for (const p of d.Post) { expect(p.userId).toMatch(/^[0-9a-f-]{36}$/); expect(ids.has(p.userId)).toBe(true); }
  });

  it("a uuid *Id with no matching model stays a random uuid", () => {
    const r = f.fromZod({ User: z.object({ id: z.string().uuid() }), Post: z.object({ id: z.string().uuid(), sessionId: z.string().uuid() }) });
    expect(fieldLine(r.explain(), "Post.sessionId")).toContain("id.uuid");
  });
});
