import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateNationalId, validateSheba } from "./parsi/validators.js";
import { spawn } from "node:child_process";
import initSqlJs from "sql.js";

const cli = join(__dirname, "..", "dist", "cli.js");
const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const runErr = (...args: string[]) => { try { run(...args); return ""; } catch (e) { return String((e as { stderr: string }).stderr); } };
const fx = (name: string) => join(__dirname, "fixtures", name);

describe.runIf(existsSync(cli))("cli (needs npm run build)", () => {
  let dir = "";
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "farsi-mock-")); });

  it("person --csv", () => {
    const out = run("person", "-n", "5", "--csv", "--seed", "1");
    const lines = out.trim().split(/\r\n/);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("nationalId");
    expect(run("person", "-n", "5", "--csv", "--seed", "1")).toBe(out);
  });
  it("user json with province, snake case", () => {
    const rows = JSON.parse(run("user", "-n", "20", "--seed", "9", "--province", "اصفهان", "--case", "snake"));
    expect(rows).toHaveLength(20);
    for (const r of rows) { expect(r.province).toBe("اصفهان"); expect(validateNationalId(r.national_id)).toBe(true); expect(r.national_id.startsWith("000")).toBe(true); }
    const realRows = JSON.parse(run("user", "-n", "20", "--seed", "9", "--province", "Fars", "--realistic-ids"));
    for (const r of realRows) { expect(validateNationalId(r.nationalId)).toBe(true); expect(r.nationalId.startsWith("000")).toBe(false); }
  });
  it("schema file, single and multi-entity", () => {
    const single = join(dir, "s.json");
    writeFileSync(single, JSON.stringify({ code_melli: "person.nationalId", phone: "contact.mobile" }));
    const csv = run("schema", single, "-n", "4", "--format", "csv", "--seed", "3");
    expect(csv.split("\r\n")[0]).toBe("code_melli,phone");
    const multi = join(dir, "m.json");
    writeFileSync(multi, JSON.stringify({ entities: { users: { count: 3, fields: { id: "id.uuid" } }, orders: { count: 5, fields: { userId: "ref:users.id" } } } }));
    const ds = JSON.parse(run("schema", multi, "--seed", "3"));
    expect(ds.users).toHaveLength(3);
    expect(ds.users.map((u: { id: string }) => u.id)).toContain(ds.orders[0].userId);
    run("schema", multi, "--csv", "-o", join(dir, "out"));
    expect(readFileSync(join(dir, "out.orders.csv"), "utf8").startsWith("userId")).toBe(true);
  });
  it("jsonl and errors", () => {
    expect(run("product", "-n", "3", "--jsonl").trim().split("\n")).toHaveLength(3);
    expect(() => run("nope")).toThrow();
  });

  it("v2 commands: plate, categories, holidays, digits", () => {
    expect(JSON.parse(run("plate", "-n", "3", "--seed", "1"))).toHaveLength(3);
    expect(run("categories")).toContain("wood");
    expect(run("holidays", "1405")).toContain("1405/01/01\t2026-03-21");
    const lat = JSON.parse(run("address", "-n", "2", "--digits", "latin", "--seed", "2"));
    expect(lat[0].addressLine).not.toMatch(/[۰-۹]/);
  });
  it("sql / mongo / ts formats", async () => {
    const sql = run("user", "-n", "5", "--seed", "3", "--sql", "--dialect", "sqlite", "--create-table");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(sql);
    expect(db.exec("SELECT count(*) FROM user")[0].values[0][0]).toBe(5);
    const mongo = JSON.parse(run("schema", fx("../../examples/shop.json"), "--mongo", "-n", "2", "--seed", "1"));
    expect(Object.keys(mongo)).toEqual(["users", "products", "orders"]);
    expect(run("person", "-n", "2", "--ts")).toContain("export interface Person");
    expect(run("schema", fx("../../examples/shop.json"), "--ts", "--seed", "1")).toContain("export const orders: Order[]");
  });
  it("infer prisma: schema, explain, generate", async () => {
    const schema = JSON.parse(run("infer", fx("shop.prisma")));
    expect(schema.entities.Order.fields.userId).toBe("ref:User.id");
    const err = execFileSync(process.execPath, [cli, "infer", fx("shop.prisma"), "--explain", "--write", join(dir, "inf.json")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(err).toBe("");
    expect(JSON.parse(readFileSync(join(dir, "inf.json"), "utf8")).entities.User.fields.codeMelli).toBeDefined();
    const sql = run("infer", fx("shop.prisma"), "--generate", "-n", "5", "--sql", "--dialect", "sqlite", "--create-table", "--seed", "1");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(sql);
    expect(db.exec('SELECT count(*) FROM "Order"')[0].values[0][0]).toBe(5);
    const generated = JSON.parse(run("schema", join(dir, "inf.json"), "-n", "3", "--seed", "1"));
    expect(generated.User).toHaveLength(3);
    const ov = JSON.parse(run("infer", fx("shop.prisma"), "--model", "Product", "--override", "Product.tags[]=text.word", "--override", 'stock={"$int":[1,2]}'));
    expect(ov.fields.tags).toEqual({ $array: [1, 3], of: "text.word" });
    expect(ov.fields.stock).toEqual({ $int: [1, 2] });
  });
  it("infer explain goes to stderr", () => {
    const r = execFileSync(process.execPath, [cli, "infer", fx("orders.sample.json"), "--explain"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(JSON.parse(r).fields.customer_mobile).toBe("contact.mobile");
  });
  it("infer sample and zod module", () => {
    const rows = JSON.parse(run("infer", fx("orders.sample.json"), "--generate", "-n", "4", "--seed", "5"));
    expect(rows).toHaveLength(4);
    for (const r of rows) { expect(validateSheba(r.sheba)).toBe(true); expect(r.customer_mobile).not.toMatch(/^0912000000/); }
    const users = JSON.parse(run("infer", fx("user.zod.mjs"), "--generate", "-n", "5", "--seed", "1"));
    for (const u of users) { expect(validateNationalId(u.codeMelli)).toBe(true); expect(u.age).toBeGreaterThanOrEqual(20); }
    expect(runErr("infer", fx("nope.yaml"))).toMatch(/YAML/);
    expect(runErr("infer", fx("shop.prisma"), "--from", "xml")).toMatch(/unknown --from/);
  });
  it("serve", async () => {
    const p = spawn(process.execPath, [cli, "serve", fx("../../examples/shop.json"), "--port", "0", "--seed", "1", "-n", "7", "--base", "/api"], { stdio: ["ignore", "ignore", "pipe"] });
    try {
      const url = await new Promise<string>((res, rej) => {
        let buf = "";
        p.stderr.on("data", (d) => { buf += d; const m = /mock API on (http:\/\/\S+)/.exec(buf); if (m) res(m[1]); });
        p.on("exit", () => rej(new Error(buf)));
      });
      const body = (await (await fetch(`${url}/users?limit=3`)).json()) as { data: unknown[]; meta: { total: number } };
      expect(body.data).toHaveLength(3);
      expect(body.meta.total).toBe(7);
    } finally { p.kill(); }
  });
});
