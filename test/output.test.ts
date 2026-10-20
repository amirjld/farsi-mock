import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import ts from "typescript";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIran } from "../src/index.js";
import { toSql, toMongoJson, toExtendedJson, toTs, format } from "../src/output.js";
import { seedBatches, seedPrisma, seedDrizzle, seedMongoose, seedMongo, seedDataset, reviveDates } from "../src/seed.js";

const f = createIran({ seed: 8, referenceDate: "2026-10-20T00:00:00Z" });
const data = f.dataset({
  users: [{ id: "id.uuid", name: "person.fullName", age: "person.age", active: "helpers.bool", createdAt: "date.past", address: { city: "address.city" }, note: () => "it's \"quoted\" \\ back" }, 7],
  orders: { schema: { id: "id.index", userId: "parent.id", total: "order.total", rating: "number.rating" }, count: { per: "users", count: 2 } },
});

describe("SQL", () => {
  it("sqlite: executes and round-trips", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(toSql(data, { dialect: "sqlite", createTable: true, batchSize: 3 }));
    const [{ values }] = db.exec("SELECT count(*) FROM users");
    expect(values[0][0]).toBe(7);
    expect(db.exec("SELECT count(*) FROM orders")[0].values[0][0]).toBe(14);
    const row = db.exec("SELECT name, note, address FROM users LIMIT 1")[0].values[0];
    expect(row[0]).toBe(data.users[0].name);
    expect(row[1]).toBe(`it's "quoted" \\ back`);
    expect(JSON.parse(String(row[2]))).toEqual(data.users[0].address);
    // ignoreConflicts keeps the first rows when run twice
    db.run(toSql({ users: data.users }, { dialect: "sqlite", ignoreConflicts: true }));
    expect(db.exec("SELECT count(*) FROM users")[0].values[0][0]).toBe(7);
    const flat = new SQL.Database();
    flat.run(toSql(data.users, { dialect: "sqlite", table: "u", createTable: true, nested: "flatten" }));
    expect(flat.exec("SELECT address_city FROM u LIMIT 1")[0].values[0][0]).toBe(data.users[0].address.city);
  });
  it("postgres and mysql syntax", () => {
    const pg = toSql(data.users, { table: "users", createTable: true, ignoreConflicts: true });
    expect(pg).toMatch(/^BEGIN;\nCREATE TABLE IF NOT EXISTS "users" \(/);
    expect(pg).toContain('"id" TEXT PRIMARY KEY');
    expect(pg).toContain('"createdAt" TIMESTAMPTZ');
    expect(pg).toContain('"address" JSONB');
    expect(pg).toMatch(/"active" BOOLEAN/);
    expect(pg).toMatch(/ON CONFLICT DO NOTHING;\nCOMMIT;\n$/);
    expect(pg).toContain("'it''s \"quoted\" \\ back'");
    const my = toSql(data.users, { dialect: "mysql", table: "users", createTable: true, ignoreConflicts: true });
    expect(my).toMatch(/^START TRANSACTION;/);
    expect(my).toContain("INSERT IGNORE INTO `users`");
    expect(my).toContain("'it''s \"quoted\" \\\\ back'");
    expect(my).toMatch(/'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}'/);
    expect(my).toContain("`id` VARCHAR(255) PRIMARY KEY");
    expect(toSql([], { table: "x", transaction: false })).toBe("\n");
    expect(() => toSql(data.users, { dialect: "oracle" as never })).toThrow(/dialect/);
  });
});

describe("MongoDB extended JSON", () => {
  const docs = createIran({ seed: 2, referenceDate: "2026-10-20T00:00:00Z" }).schema({ _id: "id.objectId", userId: "id.objectId", name: "person.fullName", createdAt: "date.past", n: () => 5, x: () => 1.5, big: () => 2 ** 40 }).many(3);
  it("relaxed", () => {
    const out = JSON.parse(toMongoJson(docs));
    expect(out[0]._id).toEqual({ $oid: docs[0]._id });
    expect(out[0].userId).toHaveProperty("$oid");
    expect(out[0].createdAt).toEqual({ $date: docs[0].createdAt });
    expect(out[0].n).toBe(5);
    expect(out[0].name).toBe(docs[0].name);
  });
  it("canonical and lines", () => {
    const c = toExtendedJson(docs[0], { mode: "canonical" }) as Record<string, unknown>;
    expect(c.n).toEqual({ $numberInt: "5" });
    expect(c.x).toEqual({ $numberDouble: "1.5" });
    expect(c.big).toEqual({ $numberLong: String(2 ** 40) });
    expect(c.createdAt).toEqual({ $date: { $numberLong: String(new Date(docs[0].createdAt).getTime()) } });
    const lines = toMongoJson(docs, { layout: "lines" }).trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(toExtendedJson({ name: "aaaaaaaaaaaaaaaaaaaaaaaa" })).toEqual({ name: "aaaaaaaaaaaaaaaaaaaaaaaa" });
  });
});

describe("TypeScript fixtures", () => {
  it("emits interfaces that type-check the data", () => {
    const ts = toTs(data);
    expect(ts).toContain("export interface User {");
    expect(ts).toContain("export const users: User[] = [");
    expect(ts).toContain("export interface Order {");
    expect(ts).toMatch(/address: \{\n\s+city: string;\n\s+\};/);
    expect(ts).toContain("active: boolean;");
    const single = toTs([{ a: 1, "b-c": null }, { a: 2 }], { name: "my-items" });
    expect(single).toContain('"b-c"?: null;');
    expect(single).toContain("export const myItems: MyItem[]");
    expect(toTs([{ a: 1 }], { asConst: true })).toContain("as const;");
    expect(format(data.users, "ts")).toContain("export const records");
  });
  it("generated module compiles under strict tsc", () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-ts-"));
    const file = join(dir, "fixtures.ts");
    writeFileSync(file, toTs(data) + toTs(f.schema({ p: "person", b: "bank", tags: f.array([0, 2], "text.word"), n: f.nullable("person.age", 0.5) }).many(5), { name: "mixed" }).replace(/^\/\/.*$/m, ""));
    const program = ts.createProgram([file], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, types: [], lib: ["lib.es2022.d.ts"] });
    const diags = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(diags).toEqual([]);
  });
});

describe("seed adapters (fake clients)", () => {
  const rows = data.users;
  it("seedBatches", async () => {
    const seen: number[] = [];
    const r = await seedBatches(rows, (b) => { seen.push(b.length); }, { batchSize: 3, onBatch: () => undefined });
    expect(seen).toEqual([3, 3, 1]);
    expect(r).toEqual({ inserted: 7, batches: 3 });
  });
  it("prisma createMany with fallback", async () => {
    const calls: unknown[] = [];
    const prisma = { user: { createMany: async (a: { data: unknown[] }) => { calls.push(a); }, create: async () => undefined } };
    await seedPrisma(prisma, "User", rows, { batchSize: 5, skipDuplicates: true });
    expect(calls).toHaveLength(2);
    expect((calls[0] as { data: Record<string, unknown>[] }).data[0].createdAt).toBeInstanceOf(Date);
    expect(calls[0]).toHaveProperty("skipDuplicates", true);
    let creates = 0;
    const old = { user: { createMany: async () => { throw new Error("createMany is not supported for SQLite"); }, create: async () => { creates++; } } };
    await seedPrisma(old, "user", rows);
    expect(creates).toBe(7);
    await expect(seedPrisma({}, "user", rows)).rejects.toThrow(/prisma.user/);
    const bad = { user: { createMany: async () => { throw new Error("Unique constraint failed"); }, create: async () => undefined } };
    await expect(seedPrisma(bad, "user", rows)).rejects.toThrow(/Unique/);
  });
  it("drizzle, mongoose, mongo", async () => {
    const inserted: unknown[][] = [];
    let conflicts = 0;
    const db = { insert: (_t: unknown) => ({ values: (v: unknown[]) => { inserted.push(v); const p = Promise.resolve(); return Object.assign(p, { onConflictDoNothing: () => { conflicts++; return p; } }); } }) };
    await seedDrizzle(db, {}, rows, { batchSize: 4, onConflictDoNothing: true });
    expect(inserted.map((b) => b.length)).toEqual([4, 3]);
    expect(conflicts).toBe(2);
    const opts: unknown[] = [];
    await seedMongoose({ insertMany: async (_d: unknown[], o: unknown) => { opts.push(o); } }, rows);
    expect(opts[0]).toEqual({ ordered: false });
    class OID { constructor(readonly hex: string) {} }
    const got: Record<string, unknown>[] = [];
    const docs = f.schema({ _id: "id.objectId", ownerId: "id.objectId", tags: f.array(2, "id.objectId"), when: "date.past" }).many(2);
    await seedMongo({ insertMany: async (d: Record<string, unknown>[]) => { got.push(...d); } }, docs, { objectId: (h) => new OID(h) });
    expect(got[0]._id).toBeInstanceOf(OID);
    expect(got[0].ownerId).toBeInstanceOf(OID);
    expect(got[0].tags).toEqual(docs[0].tags);
    expect(got[0].when).toBeInstanceOf(Date);
    await expect(seedMongoose({}, rows)).rejects.toThrow(/Model/);
  });
  it("seedDataset keeps order; reviveDates", async () => {
    const order: string[] = [];
    const counts = await seedDataset(data, async (e) => { order.push(e); });
    expect(order).toEqual(["users", "orders"]);
    expect(counts).toEqual({ users: 7, orders: 14 });
    expect(reviveDates({ a: "2026-01-01T00:00:00.000Z", b: "2026-01-01" })).toEqual({ a: new Date("2026-01-01T00:00:00.000Z"), b: "2026-01-01" });
  });
});
