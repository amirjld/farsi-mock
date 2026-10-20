import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateNationalId } from "./parsi/validators.js";

const cli = join(__dirname, "..", "dist", "cli.js");
const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

describe.runIf(existsSync(cli))("cli (needs npm run build)", () => {
  let dir = "";
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "mock-iran-")); });

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
    for (const r of rows) { expect(r.province).toBe("اصفهان"); expect(validateNationalId(r.national_id)).toBe(true); }
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
});
