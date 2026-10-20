// farsi-mock/frontend: mock your backend inside the frontend, in exactly the shape of the real API.
import { compileOpenAPI, isOpenAPI, type CompileOptions } from "./compile.js";
import { defineMockSpec, type RoutesSpecInput } from "./routes.js";
import { createMockRuntime, type MockApi, type MockApiOptions } from "./runtime.js";
import type { EndpointMap, MockSpec } from "./types.js";

export * from "./runtime-entry.js";
export { compileOpenAPI, isOpenAPI } from "./compile.js";
export type { CompileOptions } from "./compile.js";
export { openApiToTs, schemaToTs } from "./typegen.js";

export interface CreateMockApiOptions extends MockApiOptions, Omit<CompileOptions, "count" | "basePath"> {
  /**
   * The API description: an OpenAPI 3.x / Swagger 2 document (object or JSON text), its URL ("/swagger/v1/swagger.json"),
   * a compiled MockSpec (from `farsi-mock frontend` or compileOpenAPI), or a promise of any of these.
   */
  spec?: unknown;
  /** Or describe the API by hand (no OpenAPI): resources, routes, envelope, crud. */
  resources?: RoutesSpecInput["resources"];
  routes?: RoutesSpecInput["routes"];
  envelope?: RoutesSpecInput["envelope"];
  crud?: RoutesSpecInput["crud"];
  basePath?: string;
  /** fetch used to download a spec URL (default globalThis.fetch). */
  specFetch?: typeof fetch;
}

const isSpec = (x: unknown): x is MockSpec => !!x && typeof x === "object" && (x as MockSpec).farsiMockSpec === 1;

/** Turn any supported input into a compiled MockSpec. */
export async function loadMockSpec(input: unknown, opts: Omit<CreateMockApiOptions, "spec"> = {}): Promise<MockSpec> {
  let v = await input;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("{")) v = JSON.parse(t);
    else {
      const f = opts.specFetch ?? globalThis.fetch;
      const r = await f(t);
      if (!r.ok) throw new Error(`farsi-mock: could not load spec ${t} (HTTP ${r.status})`);
      const text = await r.text();
      if (!text.trim().startsWith("{")) throw new Error("farsi-mock: the spec must be JSON (convert YAML first, e.g. with `npx js-yaml spec.yaml > spec.json`)");
      v = JSON.parse(text);
    }
  }
  return toSpec(v, opts);
}
function toSpec(v: unknown, opts: Omit<CreateMockApiOptions, "spec">): MockSpec {
  if (isSpec(v)) return v;
  if (isOpenAPI(v)) return compileOpenAPI(v, { overrides: opts.overrides, count: opts.count, basePath: opts.basePath, nullRate: opts.nullRate, images: opts.images });
  throw new Error("farsi-mock: `spec` must be an OpenAPI/Swagger document, its URL, or a compiled mock spec");
}

/**
 * Create a mock API.
 *   createMockApi({ spec: openapiDoc })                       // from OpenAPI / Swagger (object, JSON text or URL)
 *   createMockApi({ spec: snapshot })                         // from `farsi-mock frontend` output
 *   createMockApi({ resources, routes, envelope: "result" })  // by hand
 * Then: api.fetch(...), createMockFetch(api), createAxiosAdapter(api), createMswHandlers(api, { http }), ...
 */
export function createMockApi<E = EndpointMap>(opts: CreateMockApiOptions): MockApi<E> {
  const { spec, resources, routes, envelope, crud, basePath, title } = opts as CreateMockApiOptions & { title?: string };
  let s: MockSpec | Promise<MockSpec>;
  if (spec !== undefined) {
    const sync = typeof spec === "object" && spec !== null && !(spec instanceof Promise);
    s = sync ? toSpec(spec, opts) : loadMockSpec(spec, opts);
  } else if (resources) s = defineMockSpec({ resources, routes, envelope, crud, basePath, title });
  else throw new Error("farsi-mock: createMockApi needs `spec` (OpenAPI or snapshot) or `resources` + `routes`");
  return createMockRuntime<E>(s, opts);
}
