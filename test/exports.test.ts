import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
    for (const sub of ["index", "infer", "output", "seed", "server", "validate", "jalali", "ai", "frontend", "frontend-runtime", "frontend-client"]) {
      const m = await import(join(root, "dist", `${sub}.js`));
      expect(Object.keys(m).length, sub).toBeGreaterThan(0);
    }
  });
  it("frontend subpaths work from CJS and ESM and share one runtime", async () => {
    const req = createRequire(join(root, "package.json"));
    const cjs = req(join(root, "dist", "frontend.cjs"));
    const api = cjs.createMockApi({ resources: { Item: { fields: { id: "id.index", name: "product.name" }, count: 3 } }, crud: true });
    const r = await api.handle({ url: "/items" });
    expect(r.body).toHaveLength(3);
    const esm = await import(join(root, "dist", "frontend.js"));
    const rt = await import(join(root, "dist", "frontend-runtime.js"));
    expect(esm.createMockRuntime).toBe(rt.createMockRuntime);
    expect(typeof rt.createMockFetch).toBe("function");
    expect(rt.compileOpenAPI).toBeUndefined(); // the runtime entry has no OpenAPI compiler
    const client = await import(join(root, "dist", "frontend-client.js"));
    expect(client.createApiFetch).toBe(rt.createApiFetch);
    expect(client.createMockRuntime).toBeUndefined();
  });
  it("frontend code has no node: imports (works in browsers, edge and workers)", () => {
    for (const f of ["frontend.js", "frontend-runtime.js", "frontend-client.js"]) {
      const seen = new Set<string>();
      const walk = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        const code = readFileSync(join(root, "dist", file), "utf8");
        expect(code, file).not.toMatch(/from ?["']node:|require\(["']node:/);
        for (const m of code.matchAll(/from ?["']\.\/([\w.-]+\.js)["']/g)) walk(m[1]);
      };
      walk(f);
    }
  });
  it("tree-shaking: the API-mode switch costs ~1 KB; the mock code stays behind a lazy import", async () => {
    let esbuild: typeof import("esbuild");
    try { esbuild = await import("esbuild"); } catch { return; }
    const bundle = async (code: string) => {
      const r = await esbuild.build({ stdin: { contents: code, resolveDir: root, loader: "js" }, bundle: true, minify: true, format: "esm", write: false, platform: "browser", logLevel: "silent" });
      return r.outputFiles[0].text.length;
    };
    const switchOnly = await bundle(`import { createApiFetch } from "./dist/frontend-runtime.js"; export const f = createApiFetch({ mode: "api", mock: () => ({}) });`);
    expect(switchOnly).toBeLessThan(6_000);
    const runtime = await bundle(`import { createMockRuntime } from "./dist/frontend-runtime.js"; export const r = createMockRuntime;`);
    const full = await bundle(`import { createMockApi } from "./dist/frontend.js"; export const r = createMockApi;`);
    expect(runtime).toBeLessThan(full);
  });
  it("code splitting: with frontend/client the runtime lands in the lazy mocks chunk, not the main chunk", async () => {
    let esbuild: typeof import("esbuild");
    try { esbuild = await import("esbuild"); } catch { return; }
    const dir = mkdtempSync(join(tmpdir(), "fm-split-"));
    writeFileSync(join(dir, "mocks.js"), `import { createMockRuntime } from ${JSON.stringify(join(root, "dist", "frontend-runtime.js"))}; export const api = createMockRuntime({ farsiMockSpec: 1, basePath: "", resources: {}, routes: [] });`);
    writeFileSync(join(dir, "main.js"), `import { createApiFetch } from ${JSON.stringify(join(root, "dist", "frontend-client.js"))}; export const f = createApiFetch({ mode: "mock", mock: () => import("./mocks.js") });`);
    const r = await esbuild.build({ entryPoints: [join(dir, "main.js")], bundle: true, splitting: true, format: "esm", minify: true, write: false, outdir: join(dir, "out"), platform: "browser", logLevel: "silent" });
    const main = r.outputFiles.find((o) => o.path.endsWith("main.js"))!;
    const rest = r.outputFiles.filter((o) => o !== main).reduce((n, o) => n + o.text.length, 0);
    expect(main.text.length).toBeLessThan(8_000);
    expect(rest).toBeGreaterThan(50_000);
  });
  it("browser bundle has no node: imports", () => {
    const code = readFileSync(join(root, "dist", "farsi-mock.global.js"), "utf8");
    expect(code).not.toMatch(/require\(["']node:|from ?["']node:/);
    expect(code.startsWith('"use strict";var FarsiMock') || code.includes("var FarsiMock")).toBe(true);
  });
});
