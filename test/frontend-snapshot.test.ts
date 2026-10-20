import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { snapshotFiles, describeSpec } from "../src/frontend/snapshot.js";
import { openApiToTs } from "../src/frontend/typegen.js";
import { createMockRuntime, compileOpenAPI } from "../src/frontend/index.js";

const root = join(__dirname, "..");
const doc = JSON.parse(readFileSync(join(__dirname, "fixtures", "shop.openapi.json"), "utf8"));

function typecheck(dir: string, files: string[]) {
  const program = ts.createProgram(files.map((f) => join(dir, f)), {
    strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [], lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"], skipLibCheck: true,
    baseUrl: root, paths: { "farsi-mock/frontend/runtime": ["src/frontend/runtime-entry.ts"] },
  });
  return ts.getPreEmitDiagnostics(program).map((d) => `${d.file?.fileName.split("/").pop()}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
}

describe("snapshot (farsi-mock frontend)", () => {
  it("types follow the spec", () => {
    const t = openApiToTs(doc);
    expect(t).toContain("export interface Product {");
    expect(t).toContain("  id: number;");
    expect(t).toContain("  discountPercent?: number;");
    expect(t).toContain("export type ProductDetail = Product & {");
    expect(t).toContain('  status?: "pending" | "paid" | "shipped" | "delivered" | "cancelled";');
    expect(t).toContain("  avatarUrl?: string | null;");
    expect(t).toContain('"GET /products/{productId}": {');
    expect(t).toContain("params: { productId: number }");
    expect(t).toContain("query: { page?: number; perPage?: number; q?: string;");
    expect(t).toMatch(/"DELETE \/products\/\{productId\}": \{\n\s+response: undefined;/);
  });
  it("ts output compiles under strict tsc and is typed end to end", () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-front-"));
    const { files, editable } = snapshotFiles(doc, { seed: 3, baseUrl: "/api" });
    expect(Object.keys(files).sort()).toEqual(["index.ts", "spec.ts", "types.ts"]);
    expect(editable).toEqual(["index.ts"]);
    for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c);
    writeFileSync(join(dir, "use.ts"), `
import { api, type Product, type ResponseOf } from "./index";
export async function demo(): Promise<string | undefined> {
  const r = await api.request("GET /products/{productId}", { params: { productId: 1 } });
  const title: string | undefined = r.data?.title;
  const list: ResponseOf<"GET /products"> = await api.request("GET /products", { query: { page: 2 } });
  const first: Product | undefined = list.data[0];
  // @ts-expect-error unknown endpoint
  await api.request("GET /nope");
  // @ts-expect-error wrong body type
  await api.request("POST /products", { body: { price: "free" } });
  return title ?? first?.title;
}
`);
    expect(typecheck(dir, ["index.ts", "use.ts"])).toEqual([]);
    expect(files["index.ts"]).toContain('baseUrl: "/api"');
    expect(files["index.ts"]).toContain('id: "bazaarche-shop-api"');
  });
  it("js output runs and equals the runtime compile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-front-js-"));
    const { files } = snapshotFiles(doc, { lang: "js" });
    expect(Object.keys(files).sort()).toEqual(["index.js", "spec.js"]);
    writeFileSync(join(dir, "spec.mjs"), files["spec.js"]);
    const { spec } = await import(pathToFileURL(join(dir, "spec.mjs")).href);
    expect(spec).toEqual(compileOpenAPI(doc));
    const a = createMockRuntime(spec, { seed: 1, referenceDate: "2026-01-01" });
    const b = createMockRuntime(compileOpenAPI(doc), { seed: 1, referenceDate: "2026-01-01" });
    expect((await a.handle({ url: "/v1/orders?pageNumber=2" }))!.body).toEqual((await b.handle({ url: "/v1/orders?pageNumber=2" }))!.body);
    expect(Object.keys(snapshotFiles(doc, { lang: "json" }).files)).toEqual(["mock-spec.json"]);
  });
  it("describeSpec explains every route", () => {
    const text = describeSpec(compileOpenAPI(doc));
    expect(text).toContain("GET /v1/products");
    expect(text).toContain("list Product");
    expect(text).toContain("{ data: Product[], meta: { page: $page, perPage: $pageSize, total: $total, totalPages: $pages } }");
    expect(text).toContain("Order: 8 fields, id id (uuid), 30 records");
  });
});

const cli = join(root, "dist", "cli.js");
describe.runIf(existsSync(cli))("cli frontend (needs npm run build)", () => {
  const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const runAll = (...args: string[]) => { try { execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); return ""; } catch (e) { return String((e as { stderr: string }).stderr); } };
  it("writes spec, types and index; keeps an edited index unless --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-cli-front-"));
    const fx = join(__dirname, "fixtures", "shop.openapi.json");
    run("frontend", fx, "-o", dir, "--base-url", "/api", "--seed", "5");
    for (const f of ["spec.ts", "types.ts", "index.ts"]) expect(existsSync(join(dir, f))).toBe(true);
    expect(readFileSync(join(dir, "index.ts"), "utf8")).toContain("seed: 5,");
    writeFileSync(join(dir, "index.ts"), "// mine\n");
    const err = execFileSync(process.execPath, [cli, "frontend", "--spec", fx, "-o", dir, "--explain"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(err).toBe("");
    expect(readFileSync(join(dir, "index.ts"), "utf8")).toBe("// mine\n");
    run("frontend", fx, "-o", dir, "--force");
    expect(readFileSync(join(dir, "index.ts"), "utf8")).toContain("createMockRuntime<Endpoints>");
    run("frontend", fx, "-o", dir, "--lang", "json", "--override", "Product.title=commerce.category", "--images", "url");
    const spec = JSON.parse(readFileSync(join(dir, "mock-spec.json"), "utf8"));
    expect(spec.resources.Product.fields.title).toBe("commerce.category");
    expect(spec.resources.Product.fields.thumbnail).toBe("internet.url");
  });
  it("explains, and rejects YAML / bad input", () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-cli-front2-"));
    const yaml = join(dir, "api.yaml");
    writeFileSync(yaml, "openapi: 3.0.0\n");
    expect(runAll("frontend", yaml, "-o", dir)).toMatch(/must be JSON/);
    expect(runAll("frontend", "-o", dir)).toMatch(/needs an OpenAPI/);
    expect(runAll("frontend", join(__dirname, "fixtures", "shop.openapi.json"), "-o", dir, "--lang", "py")).toMatch(/--lang/);
  });
});
