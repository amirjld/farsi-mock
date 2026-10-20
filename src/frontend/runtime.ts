// In-memory mock API that answers requests in exactly the shape of a compiled MockSpec.
// Pure JS (no Node or DOM APIs required): works in browsers, Next.js (node + edge), Vite, MSW, tests.
import { Iran, type IranOptions } from "../iran.js";
import { Schema, fromJson, type SchemaDef } from "../schema.js";
import type { JsonGen } from "../infer/mapper.js";
import type { EndpointMap, MockRequest, MockResource, MockResponse, MockRoute, MockSpec, QueryRoles, Shape } from "./types.js";

type Rec = Record<string, unknown>;

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export interface MockContext {
  /** Seeded generator for this request (same URL => same values). */
  f: Iran;
  /** Path params, e.g. { id: "12" }. */
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  method: string;
  url: URL;
  /** Request headers (lower-case names), e.g. ctx.headers.authorization. */
  headers: Record<string, string>;
  /** Current records of a resource (created/updated/deleted ones included). */
  rows(resource: string): Rec[];
  /** Build a response with a status and headers. */
  reply<B>(status: number, body?: B, headers?: Record<string, string>): MockReply<B>;
}
export interface MockReply<B = unknown> { __mockReply: true; status: number; body: B; headers?: Record<string, string> }
export type MockHandler = (ctx: MockContext) => unknown | Promise<unknown>;

export interface ErrorRule { status: number; rate?: number; body?: unknown }

export interface MockApiOptions {
  /**
   * Stable id for this mock API. With an id, the in-memory store lives on globalThis, so hot reloads (HMR) and
   * re-imports keep created/updated/deleted records. Also used in the localStorage key.
   */
  id?: string;
  /** Seed: same seed => same data on every load. Default 1. */
  seed?: number | string;
  /** "Now" for generated dates. Default: today 00:00 (stable during a day). */
  referenceDate?: Date | string;
  /** Records per resource (number, or per resource name). Overrides the spec. */
  count?: number | Record<string, number>;
  /**
   * Where the API lives, as the frontend calls it: "/api", "https://api.example.com/v1", ...
   * Default: the spec's basePath. Requests whose path ends with a route path still match (so any prefix works).
   */
  baseUrl?: string;
  /** Default page size when the request has none. Default: the API's declared default, else 10. */
  pageSize?: number;
  /** Max page size. Default 100. */
  maxPageSize?: number;
  /** Latency in ms: fixed or [min, max]. Default 0. */
  delay?: number | [number, number];
  /** Probability (0..1) that any request fails with a 500. Default 0. */
  errorRate?: number;
  /** Forced errors: "GET /products" | "/products/{id}" | "*" -> status or { status, rate, body }. */
  errors?: Record<string, number | ErrorRule>;
  /** Keep created/updated/deleted records across reloads (browser localStorage by default). */
  persist?: boolean | "localStorage" | "sessionStorage" | { storage: StorageLike; key?: string };
  /** Drop body fields that are not in the resource (like a real API that only returns its own fields). Default true. */
  strict?: boolean;
  /** GET /items/{unknown id}: "generate" (default) makes a record for that id; "404" returns not found. */
  notFound?: "generate" | "404";
  /** Custom handlers that run before the spec routes: "GET /me" or "POST /auth/login" (params as {id} or :id). */
  handlers?: Record<string, MockHandler>;
  /** Extra generator options (digits, weekend). IDs stay safe (000 prefix) regardless. */
  iran?: Omit<IranOptions, "seed" | "referenceDate" | "realisticIds">;
  /** Called after every handled request. */
  onRequest?: (info: { method: string; url: string; status: number; route?: string; ms: number }) => void;
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
  405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};
const STATUS_CODE: Record<number, string> = { 200: "OK", 201: "CREATED", 204: "NO_CONTENT", 400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR", 429: "TOO_MANY_REQUESTS", 500: "INTERNAL_ERROR", 503: "SERVICE_UNAVAILABLE" };
const MESSAGE_FA: Record<number, string> = {
  200: "عملیات با موفقیت انجام شد", 201: "با موفقیت ثبت شد", 400: "درخواست نامعتبر است", 401: "ابتدا وارد حساب کاربری شوید", 403: "دسترسی به این بخش مجاز نیست",
  404: "مورد درخواستی پیدا نشد", 409: "این مورد قبلاً ثبت شده است", 422: "اطلاعات ارسال‌شده معتبر نیست", 429: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید",
  500: "خطای داخلی سرور", 502: "سرویس موقتاً در دسترس نیست", 503: "سرویس موقتاً در دسترس نیست", 504: "پاسخی از سرور دریافت نشد",
};
const message = (s: number) => MESSAGE_FA[s] ?? (s < 400 ? MESSAGE_FA[200] : s < 500 ? MESSAGE_FA[400] : MESSAGE_FA[500]);

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const getPath = (o: unknown, p: string) => p.split(".").reduce<unknown>((a, k) => (a == null ? undefined : (a as Rec)[k]), o);
const normFa = (s: string) => s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const todayRef = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const isPlain = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
/** Keep only keys that exist in a resource's field definition (deep: nested objects and arrays of objects). */
export function projectToFields(value: Rec, fields: Record<string, JsonGen>): Rec {
  const out: Rec = {};
  for (const [k, v] of Object.entries(value)) {
    if (!(k in fields)) continue;
    const g = fields[k] as unknown;
    if (isPlain(g) && !Object.keys(g).some((x) => x.startsWith("$")) && isPlain(v)) out[k] = projectToFields(v, g as Record<string, JsonGen>);
    else if (isPlain(g) && "$array" in g && isPlain(g.of) && !Object.keys(g.of).some((x) => x.startsWith("$")) && Array.isArray(v)) out[k] = v.map((x) => (isPlain(x) ? projectToFields(x, g.of as Record<string, JsonGen>) : x));
    else out[k] = v;
  }
  return out;
}

/** Compile "/products/{id}" or "/products/:id" to a regex; `suffix` lets any prefix precede it. */
function pathRegex(path: string, suffix: boolean): { re: RegExp; names: string[] } {
  const names: string[] = [];
  const body = path.replace(/\/+$/, "").split("/").map((seg) => {
    const m = /^\{([^}]+)\}$/.exec(seg) ?? /^:(\w+)$/.exec(seg);
    if (m) { names.push(m[1]); return "([^/]+)"; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  return { re: new RegExp(`${suffix ? "(?:^|/)" : "^"}${body.replace(/^\//, suffix ? "" : "/")}/?$`), names };
}

const LIST_PAGE = ["page", "pageNumber", "pageIndex", "pageNo", "currentPage", "_page"];
const LIST_SIZE = ["limit", "pageSize", "perPage", "per_page", "page_size", "size", "take", "_limit"];
const LIST_OFFSET = ["offset", "skip", "_start"];
const LIST_SEARCH = ["q", "search", "query", "keyword", "term", "searchTerm"];
const LIST_SORT = ["sort", "sortBy", "orderBy", "ordering", "_sort"];
const LIST_ORDER = ["order", "sortOrder", "direction", "sortDir", "_order"];
const firstOf = (q: URLSearchParams, names: string[]) => { for (const n of names) if (q.has(n)) return n; return undefined; };

interface Matched { route: MockRoute; params: Record<string, string> }

type BodyOf<T> = T extends { body?: infer B } ? B : unknown;
type ResOf<T> = T extends { response: infer R } ? R : unknown;
type QueryOf<T> = T extends { query?: infer Q } ? Q : Record<string, unknown>;

export interface MockApi<E = EndpointMap> {
  /** The compiled spec (after it loaded). */
  readonly spec: MockSpec;
  /** Resolves when the spec is loaded (instant for an inline spec). */
  readonly ready: Promise<MockApi<E>>;
  /** Handle a request. Resolves to undefined when no route matches (so adapters can fall through to the network). */
  handle(req: MockRequest | Request): Promise<MockResponse | undefined>;
  /** fetch()-compatible: always resolves to a Response (404 JSON when no route matches). */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Typed call by endpoint key, e.g. api.request("GET /products/{id}", { params: { id: 1 } }). Throws MockHttpError for >= 400. */
  request<K extends keyof E & string>(key: K, opts?: { params?: Record<string, string | number>; query?: QueryOf<E[K]> | Record<string, unknown>; body?: BodyOf<E[K]>; headers?: Record<string, string> }): Promise<ResOf<E[K]>>;
  /** Does this method + URL hit a mocked route? */
  matches(method: string, url: string): boolean;
  /** Current records of a resource. */
  rows(resource: string): Rec[];
  /** Forget all changes (and the persisted copy). */
  reset(): void;
  /** "METHOD /path" of every route. */
  routes(): string[];
  /** A new mock API with the same spec and options but its own, fresh store (e.g. one per user session). */
  fork(): MockApi<E>;
}

export class MockHttpError extends Error {
  constructor(readonly status: number, readonly body: unknown, readonly response: MockResponse) { super(`farsi-mock: ${status} ${STATUS_TEXT[status] ?? ""}`.trim()); this.name = "MockHttpError"; }
}

/** Create a mock API from a compiled spec (or a promise of one). See `createMockApi` in "farsi-mock/frontend" for OpenAPI input. */
export function createMockRuntime<E = EndpointMap>(specIn: MockSpec | Promise<MockSpec>, opts: MockApiOptions = {}): MockApi<E> {
  let spec!: MockSpec;
  const seed = String(opts.seed ?? 1);
  const ref = opts.referenceDate ? new Date(opts.referenceDate) : todayRef();
  const mkIran = (s: string) => new Iran({ ...opts.iran, seed: s, referenceDate: ref });
  const strict = opts.strict !== false;

  // ---------------- store (kept on globalThis under opts.id, so HMR / module reloads keep created records)
  interface Store { rows: Map<string, Rec[]>; extra: Map<string, Map<string, Rec>>; deleted: Map<string, Set<string>>; touched: Set<string>; counter: number; loaded: boolean }
  const newStore = (): Store => ({ rows: new Map(), extra: new Map(), deleted: new Map(), touched: new Set(), counter: 0, loaded: false });
  let store: Store = newStore();
  const registry = (): Map<string, Store> => {
    const g = globalThis as unknown as Record<symbol, Map<string, Store> | undefined>;
    const k = Symbol.for("farsi-mock.stores");
    return (g[k] ??= new Map());
  };
  const generating = new Set<string>();
  const storage = (): StorageLike | undefined => {
    const p = opts.persist;
    if (!p) return undefined;
    if (typeof p === "object") return p.storage;
    const g = globalThis as unknown as Record<string, StorageLike | undefined>;
    try { return g[p === "sessionStorage" ? "sessionStorage" : "localStorage"]; } catch { return undefined; }
  };
  let sig = "";
  const storageKey = () => (typeof opts.persist === "object" && opts.persist.key) || `farsi-mock:${opts.id ?? spec.title ?? "api"}:${seed}`;
  const load = () => {
    if (store.loaded) return;
    store.loaded = true;
    const st = storage();
    if (!st) return;
    try {
      const raw = st.getItem(storageKey());
      if (!raw) return;
      const s = JSON.parse(raw) as { sig: string; rows: Record<string, Rec[]>; extra: Record<string, Record<string, Rec>>; deleted: Record<string, string[]>; counter: number };
      if (s.sig !== sig) return;
      for (const [k, v] of Object.entries(s.rows)) { store.rows.set(k, v); store.touched.add(k); }
      for (const [k, v] of Object.entries(s.extra ?? {})) store.extra.set(k, new Map(Object.entries(v)));
      for (const [k, v] of Object.entries(s.deleted ?? {})) store.deleted.set(k, new Set(v));
      store.counter = s.counter ?? 0;
    } catch { /* corrupt storage: start fresh */ }
  };
  const save = () => {
    const st = storage();
    if (!st) return;
    const pick = <T>(m: Map<string, T>) => Object.fromEntries([...m].filter(([k]) => store.touched.has(k)));
    try {
      st.setItem(storageKey(), JSON.stringify({
        sig, counter: store.counter, rows: pick(store.rows),
        extra: Object.fromEntries([...store.extra].filter(([k]) => store.touched.has(k)).map(([k, m]) => [k, Object.fromEntries(m)])),
        deleted: Object.fromEntries([...store.deleted].filter(([k]) => store.touched.has(k)).map(([k, v]) => [k, [...v]])),
      }));
    } catch { /* quota: ignore */ }
  };

  const resource = (name: string): MockResource => {
    const r = spec.resources[name];
    if (!r) throw new Error(`farsi-mock: unknown resource "${name}". Known: ${Object.keys(spec.resources).join(", ")}`);
    return r;
  };
  const countOf = (name: string) => (typeof opts.count === "number" ? opts.count : opts.count?.[name]) ?? resource(name).count ?? 30;
  const depsOf = (fields: unknown): string[] => [...new Set([...JSON.stringify(fields).matchAll(/"ref:([A-Za-z_$][\w$]*)\./g)].map((m) => m[1]))];
  const schemaFor = (f: Iran, fields: Record<string, JsonGen>) => new Schema(f, fromJson(f, fields) as SchemaDef);
  const refsFor = (name: string): Record<string, Rec[]> => {
    const out: Record<string, Rec[]> = {};
    for (const d of depsOf(resource(name).fields)) if (d !== name && spec.resources[d] && !generating.has(d)) out[d] = list(d);
    return out;
  };
  const safeFields = (name: string): Record<string, JsonGen> => {
    // refs to resources that cannot be generated here (cycles / unknown) fall back to a plain id
    const fields = resource(name).fields;
    const bad = depsOf(fields).filter((d) => d === name || !spec.resources[d] || generating.has(d));
    if (!bad.length) return fields;
    const fix = (g: unknown): unknown => {
      if (typeof g === "string" && g.startsWith("ref:") && bad.includes(g.slice(4).split(".")[0])) {
        const target = spec.resources[g.slice(4).split(".")[0]];
        return target?.idType === "uuid" ? "id.uuid" : target?.idType === "objectId" ? "id.objectId" : { $int: [1, target?.count ?? 30] };
      }
      if (Array.isArray(g)) return g.map(fix);
      if (g && typeof g === "object") return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, fix(v)]));
      return g;
    };
    return fix(fields) as Record<string, JsonGen>;
  };
  function list(name: string): Rec[] {
    load();
    let r = store.rows.get(name);
    if (!r) {
      generating.add(name);
      try {
        const refs = refsFor(name);
        const f = mkIran(`${seed}:${name}`);
        r = schemaFor(f, safeFields(name)).many(countOf(name), {}, refs) as Rec[];
      } finally { generating.delete(name); }
      store.rows.set(name, r);
    }
    return r;
  }
  const idStr = (r: Rec, field: string) => String(getPath(r, field));
  const coerceId = (name: string, v: string): unknown => (resource(name).idType === "int" && /^-?\d+$/.test(v) ? Number(v) : v);
  const oneRecord = (name: string, seedKey: string): Rec => {
    const f = mkIran(`${seed}:${name}:${seedKey}`);
    return schemaFor(f, safeFields(name)).one({}, refsFor(name)) as Rec;
  };
  const find = (name: string, field: string, value: string, generate: boolean): Rec | undefined => {
    const r = list(name).find((x) => idStr(x, field) === value);
    if (r) return r;
    const ex = store.extra.get(name)?.get(`${field}=${value}`);
    if (ex) return ex;
    if (store.deleted.get(name)?.has(`${field}=${value}`) || !generate) return undefined;
    const rec = oneRecord(name, `${field}=${value}`);
    rec[field] = field === resource(name).idField ? coerceId(name, value) : value;
    let m = store.extra.get(name);
    if (!m) store.extra.set(name, (m = new Map()));
    m.set(`${field}=${value}`, rec);
    return rec;
  };
  const allRows = (name: string) => [...list(name), ...(store.extra.get(name)?.values() ?? [])];

  // ---------------- routing
  type Compiled = { route: MockRoute; exact: RegExp; loose: RegExp; names: string[] };
  let compiled: Compiled[] = [];
  let handlers: { method: string; exact: RegExp; loose: RegExp; names: string[]; fn: MockHandler; key: string }[] = [];
  let base = "";
  const init = (s: MockSpec) => {
    spec = s;
    if (s.farsiMockSpec !== 1) throw new Error("farsi-mock: not a compiled mock spec (farsiMockSpec: 1)");
    base = (opts.baseUrl ?? s.basePath ?? "").replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/\/+$/, "");
    sig = String(hash(JSON.stringify(s.resources) + JSON.stringify(opts.count ?? "")));
    if (opts.id) {
      const key = `${opts.id}:${seed}:${sig}`;
      const reg = registry();
      const existing = reg.get(key);
      if (existing) store = existing; else reg.set(key, store);
    }
    compiled = s.routes.map((route) => { const a = pathRegex(route.path, false), b = pathRegex(route.path, true); return { route, exact: a.re, loose: b.re, names: a.names }; });
    handlers = Object.entries(opts.handlers ?? {}).map(([key, fn]) => {
      const m = /^([A-Z]+)\s+(.+)$/i.exec(key.trim());
      const method = m ? m[1].toUpperCase() : "*";
      const path = m ? m[2] : key.trim();
      const a = pathRegex(path, false), b = pathRegex(path, true);
      return { method, exact: a.re, loose: b.re, names: a.names, fn, key };
    });
  };
  const stripBase = (path: string) => (base && (path === base || path.startsWith(base + "/")) ? path.slice(base.length) || "/" : undefined);
  function match(method: string, path: string): Matched | undefined {
    const stripped = stripBase(path);
    const tryWith = (p: string, loose: boolean) => {
      for (const c of compiled) {
        if (c.route.method !== method && !(method === "HEAD" && c.route.method === "GET")) continue;
        const m = (loose ? c.loose : c.exact).exec(p);
        if (m) return { route: c.route, params: Object.fromEntries(c.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
      }
      return undefined;
    };
    if (stripped !== undefined) return tryWith(stripped, false);
    if (!base) return tryWith(path, false) ?? tryWith(path, true);
    return tryWith(path, true);
  }
  const matchHandler = (method: string, path: string) => {
    const stripped = stripBase(path);
    for (const h of handlers) {
      if (h.method !== "*" && h.method !== method) continue;
      const m = (stripped !== undefined ? h.exact.exec(stripped) : null) ?? h.loose.exec(path);
      if (m) return { h, params: Object.fromEntries(h.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
    }
    return undefined;
  };

  // ---------------- shapes
  interface BuildCtx { f: Iran; status: number; items?: Rec[]; record?: Rec | null; meta: Record<string, unknown>; route: MockRoute; url: URL }
  const schemaCache = new WeakMap<object, Map<Iran, Schema>>();
  const genValue = (shape: object, gen: JsonGen, f: Iran): unknown => {
    let m = schemaCache.get(shape);
    if (!m) schemaCache.set(shape, (m = new Map()));
    let s = m.get(f);
    if (!s) { s = new Schema(f, { v: fromJson(f, gen) } as SchemaDef); m.set(f, s); }
    return (s.one() as Rec).v;
  };
  const project = (r: Rec, s: Extract<Shape, { t: "items" | "record" }>, ctx: BuildCtx): Rec => {
    let out: Rec = r;
    if (s.view) {
      const id = idStr(r, resource(s.resource).idField);
      const f = mkIran(`${seed}:${s.resource}:${id}:${ctx.route.path}`);
      out = { ...r, ...(schemaFor(f, s.view).one() as Rec) };
    }
    if (s.pick) { const o: Rec = {}; for (const k of s.pick) if (k in out) o[k] = out[k]; out = o; }
    return clone(out);
  };
  const build = (s: Shape, ctx: BuildCtx): unknown => {
    switch (s.t) {
      case "object": { const o: Rec = {}; for (const [k, v] of Object.entries(s.props)) { const x = build(v, ctx); if (x !== undefined) o[k] = x; } return o; }
      case "array": { const n = s.min !== undefined || s.max !== undefined ? ctx.f.int(s.min ?? 0, s.max ?? s.min ?? 0) : ctx.f.int(1, 3); return Array.from({ length: n }, () => build(s.of, ctx)); }
      case "items": return (ctx.items ?? []).map((r) => project(r, s, ctx));
      case "record": return ctx.record ? project(ctx.record, s, ctx) : null;
      case "const": return clone(s.value);
      case "now": return new Date().toISOString();
      case "gen": return genValue(s, s.gen, ctx.f);
      case "nullable": return build(s.of, ctx);
      case "meta": {
        let v: unknown;
        switch (s.role) {
          case "status": v = ctx.status; break;
          case "statusText": v = STATUS_CODE[ctx.status] ?? (ctx.status < 400 ? "OK" : "ERROR"); break;
          case "message": v = message(ctx.status); break;
          case "epoch": v = Date.now(); break;
          case "ok": v = ctx.status < 400; break;
          default: v = ctx.meta[s.role];
        }
        if (v === undefined) v = s.as === "boolean" ? false : s.as === "string" ? (s.role === "next" || s.role === "prev" ? null : "") : s.role === "next" || s.role === "prev" ? null : 0;
        if (s.as === "string" && typeof v === "number") v = String(v);
        if (s.as === "number" && typeof v === "string" && /^\d+$/.test(v)) v = Number(v);
        return v;
      }
    }
  };

  // ---------------- request helpers
  const parseBody = async (b: unknown): Promise<unknown> => {
    if (b == null) return undefined;
    if (typeof b === "string") { try { return JSON.parse(b); } catch { return b; } }
    const FD = (globalThis as Record<string, unknown>).FormData as (new () => unknown) | undefined;
    if (b instanceof URLSearchParams || (FD && b instanceof FD)) return Object.fromEntries((b as URLSearchParams).entries());
    if (typeof (b as Blob).text === "function" && typeof (b as Blob).size === "number") return parseBody(await (b as Blob).text());
    if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return parseBody(new TextDecoder().decode(b as ArrayBuffer));
    return b;
  };
  const plain = (h: MockRequest["headers"] | Headers | undefined): Record<string, string> => {
    if (!h) return {};
    const entries: [string, string][] = typeof (h as Headers).forEach === "function" && !Array.isArray(h) ? (() => { const a: [string, string][] = []; (h as Headers).forEach((v, k) => a.push([k, v])); return a; })() : Array.isArray(h) ? h : Object.entries(h as Record<string, string>);
    return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), String(v)]));
  };
  const headerOf = (h: MockRequest["headers"] | Headers | undefined, name: string): string | undefined => {
    if (!h) return undefined;
    if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
    const entries = Array.isArray(h) ? h : Object.entries(h as Record<string, string>);
    return entries.find(([k]) => k.toLowerCase() === name)?.[1];
  };
  const toMockRequest = async (req: MockRequest | Request): Promise<{ method: string; url: URL; headers: MockRequest["headers"] | Headers; body: unknown }> => {
    const R = (globalThis as Record<string, unknown>).Request as (new (...a: unknown[]) => Request) | undefined;
    if (R && req instanceof R) {
      const r = req as Request;
      const text = r.method === "GET" || r.method === "HEAD" ? "" : await r.clone().text();
      return { method: r.method.toUpperCase(), url: new URL(r.url, "http://mock.local"), headers: r.headers, body: await parseBody(text || undefined) };
    }
    const m = req as MockRequest;
    return { method: (m.method ?? "GET").toUpperCase(), url: new URL(m.url, "http://mock.local"), headers: m.headers, body: await parseBody(m.body) };
  };
  const errorFor = (method: string, route: MockRoute | undefined, q: URLSearchParams, headers: MockRequest["headers"] | Headers): ErrorRule | undefined => {
    const forced = headerOf(headers, "x-mock-status") ?? q.get("__status");
    if (forced && /^\d{3}$/.test(forced) && Number(forced) >= 400) return { status: Number(forced) };
    for (const [key, v] of Object.entries(opts.errors ?? {})) {
      const rule = typeof v === "number" ? { status: v } : v;
      const m = /^([A-Z]+)\s+(.+)$/i.exec(key.trim());
      const kMethod = m ? m[1].toUpperCase() : undefined, kPath = m ? m[2] : key.trim();
      if (kMethod && kMethod !== method) continue;
      if (kPath !== "*" && (!route || kPath.replace(/:(\w+)/g, "{$1}") !== route.path)) continue;
      if (rule.rate === undefined || Math.random() < rule.rate) return rule;
    }
    if (opts.errorRate && Math.random() < opts.errorRate) return { status: 500 };
    return undefined;
  };
  const errorBody = (route: MockRoute | undefined, status: number, f: Iran, url: URL): unknown => {
    const e = route?.errors;
    const shape = e?.[String(status)] ?? e?.[`${String(status)[0]}XX`] ?? e?.[`${String(status)[0]}xx`] ?? e?.default ?? (e ? Object.values(e)[0] : undefined);
    if (!shape) return { message: message(status), status };
    return build(shape, { f, status, meta: {}, route: route!, url });
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const stripBody = (name: string, body: unknown): Rec => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return strict ? projectToFields(body as Rec, resource(name).fields) : { ...(body as Rec) };
  };
  const touchTimes = (r: Rec, created: boolean) => {
    const now = new Date().toISOString();
    for (const k of Object.keys(r)) {
      if (/^(updated|modified|lastModified|changed)(At|_at|Date|On|Time)?$/i.test(k) && typeof r[k] === "string") r[k] = now;
      if (created && /^(created|createdOn|createdDate|creationDate|created_at|createdAt|insertedAt|registeredAt)$/i.test(k) && typeof r[k] === "string") r[k] = now;
    }
  };

  // ---------------- list query
  const applyQuery = (route: MockRoute, input: Rec[], q: URLSearchParams, currentUrl: URL) => {
    const roles: QueryRoles = route.query ?? {};
    const res = resource(route.resource!);
    let out = input;
    const reserved = new Set(["__status", "__delay"]);
    const pageKey = roles.page ?? firstOf(q, LIST_PAGE);
    const sizeKey = roles.pageSize ?? firstOf(q, LIST_SIZE);
    const offKey = roles.offset ?? firstOf(q, LIST_OFFSET);
    const searchKey = roles.search ?? firstOf(q, LIST_SEARCH);
    const sortKey = roles.sort ?? firstOf(q, LIST_SORT);
    const orderKey = roles.order ?? firstOf(q, LIST_ORDER);
    for (const k of [pageKey, sizeKey, offKey, searchKey, sortKey, orderKey]) if (k) reserved.add(k);
    const fieldByNorm = new Map(Object.keys(res.fields).map((k) => [norm(k), k]));
    const matches = (val: unknown, v: string): boolean => {
      if (Array.isArray(val)) return val.some((x) => matches(x, v));
      if (val && typeof val === "object") return Object.values(val).some((x) => typeof x !== "object" && matches(x, v));
      return v.split(",").some((one) => normFa(String(val)) === normFa(one));
    };
    for (const k of new Set(q.keys())) {
      if (reserved.has(k)) continue;
      const vals = q.getAll(k).filter((v) => v !== "");
      if (!vals.length) continue;
      const rule = roles.filters?.[k] ?? (fieldByNorm.has(norm(k)) ? { field: fieldByNorm.get(norm(k))!, op: "eq" as const } : undefined);
      const opM = /^(.*?)(?:_(gte|lte|ne|like)|\[(gte|lte|ne|like)\])$/.exec(k);
      const r = rule ?? (opM && fieldByNorm.has(norm(opM[1])) ? { field: fieldByNorm.get(norm(opM[1]))!, op: (opM[2] ?? opM[3]) as "gte" } : undefined);
      if (!r) continue;
      const v = vals.join(",");
      out = out.filter((row) => {
        const val = getPath(row, r.field);
        switch (r.op) {
          case "gte": return typeof val === "number" ? val >= Number(v) : String(val) >= v;
          case "lte": return typeof val === "number" ? val <= Number(v) : String(val) <= v;
          case "like": return normFa(String(val ?? "")).includes(normFa(v));
          case "ne": return !matches(val, v);
          default: return matches(val, v);
        }
      });
    }
    const term = searchKey ? q.get(searchKey) : null;
    if (term) { const t = normFa(term); out = out.filter((r) => normFa(Object.values(r).filter((x) => typeof x === "string" || typeof x === "number").join(" ")).includes(t)); }
    const sortRaw = sortKey ? q.get(sortKey) : null;
    if (sortRaw) {
      const globalDesc = orderKey ? /^desc/i.test(q.get(orderKey) ?? "") : false;
      const keys = sortRaw.split(/[,;](?!\s*(asc|desc)\b)/i).filter((x) => x && !/^(asc|desc)$/i.test(x)).map((part) => {
        let s = part.trim(), dir = globalDesc ? -1 : 1;
        if (s.startsWith("-")) { dir = -1; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
        const m = /^(.+?)[\s:,]+(asc|desc)$/i.exec(s) ?? /^(.+?)_(asc|desc)$/i.exec(s);
        if (m) { s = m[1]; dir = m[2].toLowerCase() === "desc" ? -1 : 1; }
        return [fieldByNorm.get(norm(s)) ?? s, dir] as const;
      });
      out = [...out].sort((a, b) => {
        for (const [k, dir] of keys) {
          const x = getPath(a, k), y = getPath(b, k);
          if (x === y) continue;
          if (x == null) return 1;
          if (y == null) return -1;
          return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fa")) * dir;
        }
        return 0;
      });
    }
    const total = out.length;
    const pageBase = roles.pageBase ?? (pageKey === "pageIndex" ? 0 : 1);
    const size = Math.min(opts.maxPageSize ?? 100, Math.max(1, Number(sizeKey ? q.get(sizeKey) : NaN) || opts.pageSize || roles.defaultPageSize || 10));
    let offset: number, page: number;
    if (offKey && q.has(offKey)) { offset = Math.max(0, Number(q.get(offKey)) || 0); page = Math.floor(offset / size) + pageBase; }
    else { const p = Number(pageKey ? q.get(pageKey) : NaN); page = Number.isFinite(p) ? Math.max(pageBase, Math.floor(p)) : pageBase; offset = (page - pageBase) * size; }
    const items = out.slice(offset, offset + size);
    const pages = Math.max(1, Math.ceil(total / size));
    const idx = page - pageBase;
    const link = (p: number) => { const u = new URL(currentUrl.href); u.searchParams.set(pageKey ?? "page", String(p)); return `${u.pathname}${u.search}`; };
    const hasNext = offset + size < total, hasPrev = offset > 0;
    const meta: Record<string, unknown> = {
      total, page, pageSize: size, pages, count: items.length, offset, hasNext, hasPrev,
      next: hasNext ? page + 1 : null, prev: hasPrev ? page - 1 : null, first: idx === 0, last: !hasNext, empty: items.length === 0,
    };
    const urlMeta = { next: hasNext ? link(page + 1) : null, prev: hasPrev ? link(page - 1) : null };
    return { items, meta, urlMeta };
  };

  // ---------------- dispatch
  const dispatch = async (method: string, url: URL, headers: MockRequest["headers"] | Headers, body: unknown): Promise<MockResponse | undefined> => {
    const path = decodeURIComponent(url.pathname);
    const q = url.searchParams;
    const h = matchHandler(method, path);
    const m = h ? undefined : match(method, path);
    if (!h && !m) return undefined;
    const route = m?.route;
    const reqF = mkIran(`${seed}:${method}:${path}`);
    const err = errorFor(method, route, q, headers);
    const d = opts.delay, qd = Number(q.get("__delay") ?? headerOf(headers, "x-mock-delay"));
    const wait = Number.isFinite(qd) && qd > 0 ? qd : d === undefined ? 0 : typeof d === "number" ? d : d[0] + Math.random() * (d[1] - d[0]);
    if (wait > 0) await sleep(wait);
    const reply = (status: number, b: unknown, extraHeaders: Record<string, string> = {}): MockResponse => ({
      status, statusText: STATUS_TEXT[status] ?? "", body: status === 204 ? undefined : b, route,
      headers: { ...(status === 204 || b === undefined ? {} : { "content-type": "application/json; charset=utf-8" }), "x-mock": "farsi-mock", ...extraHeaders },
    });
    if (err) return reply(err.status, err.body !== undefined ? err.body : errorBody(route, err.status, reqF, url));

    if (h) {
      const ctx: MockContext = {
        f: reqF, params: h.params, query: q, body, method, url, rows: (n) => allRows(n), headers: plain(headers),
        reply: (status, b, hd) => ({ __mockReply: true, status, body: b as never, headers: hd }),
      };
      const out = await h.h.fn(ctx);
      if (out && typeof out === "object" && (out as MockReply).__mockReply) { const r = out as MockReply; return reply(r.status, r.body, r.headers); }
      if (out instanceof Object && typeof (out as Response).status === "number" && typeof (out as Response).headers?.get === "function") {
        const r = out as Response;
        const text = await r.text();
        return { ...reply(r.status, text ? JSON.parse(text) : undefined), headers: Object.fromEntries(r.headers as unknown as Iterable<[string, string]>) };
      }
      return reply(method === "POST" ? 201 : 200, out);
    }
    const rt = route!;
    const ctx: BuildCtx = { f: reqF, status: rt.status, meta: {}, route: rt, url };
    const name = rt.resource;
    const params = m!.params;
    const notFound = () => reply(404, errorBody(rt, 404, reqF, url));
    if (!name) return reply(rt.status, rt.response ? build(rt.response, ctx) : undefined);
    const res = resource(name);
    const pnames = Object.keys(rt.params ?? {});
    const selector = rt.kind === "list" || rt.kind === "create" ? undefined : pnames[pnames.length - 1];
    const parentParams = pnames.filter((p) => p !== selector);

    // nested: /users/{userId}/orders
    const scoped = (): Rec[] => {
      let all = allRows(name);
      for (const p of parentParams) {
        const field = rt.params![p], v = params[p];
        if (field === "~") {
          const k = 3 + (hash(`${p}=${v}`) % 8);
          all = [...all].sort((a, b) => hash(`${v}:${idStr(a, res.idField)}`) - hash(`${v}:${idStr(b, res.idField)}`)).slice(0, k);
          continue;
        }
        let sub = all.filter((r) => String(getPath(r, field)) === v);
        if (!sub.length && rt.kind === "list") {
          // first visit of this parent: make a few records that belong to it
          const k = 2 + (hash(`${name}:${p}=${v}`) % 6);
          const made = Array.from({ length: k }, (_, i) => {
            const r = oneRecord(name, `${p}=${v}#${i}`);
            r[field] = typeof getPath(list(name)[0] ?? {}, field) === "number" && /^\d+$/.test(v) ? Number(v) : v;
            r[res.idField] = nextId(name, reqF);
            return r;
          });
          list(name).push(...made);
          sub = made;
        }
        all = sub;
      }
      return all;
    };
    const nextId = (n: string, f: Iran): unknown => {
      const r = resource(n);
      if (r.idType === "int") return Math.max(0, ...allRows(n).map((x) => Number(getPath(x, r.idField)) || 0)) + 1;
      if (r.idType === "objectId") return f.objectId();
      return f.uuid();
    };
    const selectRecord = (generate: boolean): Rec | undefined => {
      if (!selector) return undefined;
      return find(name, rt.params![selector], params[selector], generate);
    };

    switch (rt.kind) {
      case "list": {
        const { items, meta, urlMeta } = applyQuery(rt, scoped(), q, url);
        ctx.items = items; ctx.meta = meta;
        // string-typed next/prev get URLs
        const fix = (s: Shape): Shape => (s.t === "meta" && (s.role === "next" || s.role === "prev") && s.as === "string" ? { t: "const", value: urlMeta[s.role] } : s.t === "object" ? { ...s, props: Object.fromEntries(Object.entries(s.props).map(([k, v]) => [k, fix(v)])) } : s);
        const body = rt.response ? build(fix(rt.response), ctx) : items;
        return reply(rt.status, body, { "x-total-count": String(meta.total) });
      }
      case "detail": {
        const rec = selector ? selectRecord(opts.notFound !== "404") : list(name)[0];
        if (!rec) return notFound();
        ctx.record = rec;
        return reply(rt.status, rt.response ? build(rt.response, ctx) : rec);
      }
      case "create": {
        store.counter++;
        const rec = { ...oneRecord(name, `new#${store.counter}`), ...stripBody(name, body) };
        for (const p of parentParams) if (rt.params![p] !== "~") rec[rt.params![p]] = params[p];
        if (!(res.idField in (body as Rec ?? {})) || rec[res.idField] == null) rec[res.idField] = nextId(name, reqF);
        touchTimes(rec, true);
        list(name).unshift(rec);
        store.touched.add(name); save();
        ctx.record = rec; ctx.status = rt.status;
        return reply(rt.status, rt.response ? build(rt.response, ctx) : rec, { location: `${url.pathname.replace(/\/$/, "")}/${String(rec[res.idField])}` });
      }
      case "update": {
        const rec = selectRecord(opts.notFound !== "404");
        if (!rec) return notFound();
        const patch = stripBody(name, body);
        delete patch[res.idField];
        if (method === "PUT") for (const k of Object.keys(patch)) rec[k] = patch[k];
        else Object.assign(rec, patch);
        touchTimes(rec, false);
        store.touched.add(name); save();
        ctx.record = rec;
        return reply(rt.status, rt.response ? build(rt.response, ctx) : rec);
      }
      case "delete": {
        const rec = selectRecord(false);
        if (!rec) return notFound();
        const field = rt.params![selector!], v = params[selector!];
        const arr = list(name);
        const i = arr.indexOf(rec);
        if (i >= 0) arr.splice(i, 1);
        store.extra.get(name)?.delete(`${field}=${v}`);
        let ds = store.deleted.get(name);
        if (!ds) store.deleted.set(name, (ds = new Set()));
        ds.add(`${field}=${v}`);
        ds.add(`${res.idField}=${idStr(rec, res.idField)}`);
        store.touched.add(name); save();
        ctx.record = rec;
        return reply(rt.status, rt.response ? build(rt.response, ctx) : undefined);
      }
      default:
        return reply(rt.status, rt.response ? build(rt.response, ctx) : undefined);
    }
  };

  // ---------------- public API
  const readyP: Promise<MockApi<E>> = Promise.resolve(specIn).then((s) => { init(s); return api; });
  let isReady = false;
  readyP.then(() => (isReady = true), () => undefined);
  if (!(specIn instanceof Promise)) { init(specIn); isReady = true; }

  const handle = async (req: MockRequest | Request): Promise<MockResponse | undefined> => {
    if (!isReady) await readyP;
    const t0 = Date.now();
    const r = await toMockRequest(req);
    const out = await dispatch(r.method, r.url, r.headers, r.body);
    if (out) opts.onRequest?.({ method: r.method, url: r.url.pathname + r.url.search, status: out.status, route: out.route ? `${out.route.method} ${out.route.path}` : undefined, ms: Date.now() - t0 });
    return out;
  };
  const toResponse = (r: MockResponse | undefined): Response => {
    if (!r) return new Response(JSON.stringify({ message: "No mock route" }), { status: 404, headers: { "content-type": "application/json", "x-mock": "farsi-mock" } });
    return new Response(r.body === undefined || r.status === 204 ? null : JSON.stringify(r.body), { status: r.status, statusText: r.statusText, headers: r.headers });
  };
  const api: MockApi<E> = {
    get spec() { return spec; },
    ready: readyP,
    handle,
    async fetch(input, init) {
      const R = (globalThis as Record<string, unknown>).Request as (new (...a: unknown[]) => Request) | undefined;
      if (R && input instanceof R && !init) return toResponse(await handle(input as Request));
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      const method = init?.method ?? (typeof input === "object" && !(input instanceof URL) ? (input as Request).method : "GET");
      return toResponse(await handle({ url, method, headers: init?.headers as MockRequest["headers"], body: init?.body ?? undefined }));
    },
    async request(key, o = {}) {
      const m = /^([A-Z]+)\s+(.+)$/i.exec(key);
      const method = m ? m[1].toUpperCase() : "GET";
      let path = (m ? m[2] : key).replace(/\{(\w+)\}|:(\w+)/g, (_s, a, b) => encodeURIComponent(String(o.params?.[a ?? b] ?? "")));
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries((o.query ?? {}) as Record<string, unknown>)) if (v !== undefined && v !== null) (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, String(x)));
      path = `${base}${path}${[...qs].length ? `?${qs}` : ""}`;
      const r = await handle({ method, url: path, headers: o.headers, body: o.body });
      if (!r) throw new Error(`farsi-mock: no mock route for ${method} ${path}`);
      if (r.status >= 400) throw new MockHttpError(r.status, r.body, r);
      return r.body as never;
    },
    matches(method, url) {
      if (!isReady) return false;
      const u = new URL(url, "http://mock.local");
      const p = decodeURIComponent(u.pathname);
      return !!(matchHandler(method.toUpperCase(), p) ?? match(method.toUpperCase(), p));
    },
    rows: (n) => allRows(n),
    reset() {
      store.rows.clear(); store.extra.clear(); store.deleted.clear(); store.touched.clear(); store.counter = 0;
      const st = storage();
      try { st?.removeItem(storageKey()); } catch { /* ignore */ }
    },
    routes: () => [...handlers.map((x) => x.key), ...spec.routes.map((r) => `${r.method} ${r.path}`)],
    fork: () => createMockRuntime<E>(isReady ? spec : readyP.then((a) => a.spec), { ...opts, id: undefined }),
  };
  return api;
}
