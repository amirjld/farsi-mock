import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const built = existsSync(join(root, "dist", "index.js"));

describe.runIf(built)("package exports (needs npm run build)", () => {
  it("every export target exists", () => {
    for (const [key, v] of Object.entries(pkg.exports as Record<string, unknown>)) {
      const targets = typeof v === "string" ? [v] : Object.values(v as Record<string, Record<string, string>>).flatMap((c) => Object.values(c));
      for (const t of targets) expect(existsSync(join(root, t)), `${key} -> ${t}`).toBe(true);
    }
    expect(existsSync(join(root, pkg.bin["farsi-mock"]))).toBe(true);
  });
  it("CJS subpaths share one Schema class", () => {
    const req = createRequire(join(root, "package.json"));
    const fm = req(join(root, "dist", "index.cjs"));
    const { createMockServer } = req(join(root, "dist", "server.cjs"));
    const f = fm.createIran({ seed: 1 });
    const s = createMockServer({ iran: f, resources: { u: f.schema({ id: "id.uuid", n: "person.fullName" }) }, count: 2 });
    expect(Object.keys(s.data.u[0])).toEqual(["id", "n"]);
  });
  it("ESM subpaths load", async () => {
    for (const sub of ["index", "infer", "output", "seed", "server", "validate", "jalali", "ai"]) {
      const m = await import(join(root, "dist", `${sub}.js`));
      expect(Object.keys(m).length, sub).toBeGreaterThan(0);
    }
  });
  it("browser bundle has no node: imports", () => {
    const code = readFileSync(join(root, "dist", "farsi-mock.global.js"), "utf8");
    expect(code).not.toMatch(/require\(["']node:|from ?["']node:/);
    expect(code.startsWith('"use strict";var FarsiMock') || code.includes("var FarsiMock")).toBe(true);
  });
});
