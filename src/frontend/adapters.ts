// Adapters that put a MockApi behind the HTTP client the app already uses. None of them import the client:
// fetch is global, axios/MSW/Next.js objects are passed in or matched structurally. Zero dependencies.
import type { MockApi } from "./runtime.js";
import type { MockResponse } from "./types.js";

/** "api": real backend only. "mock": mock only. "hybrid": real backend, mock when it returns nothing (empty list / network error). */
export type ApiMode = "mock" | "api" | "hybrid";

/**
 * Read an API_MODE flag. Pass the value explicitly in browser code, because bundlers only inline env vars
 * that are written out literally: apiMode(process.env.NEXT_PUBLIC_API_MODE) or apiMode(import.meta.env.VITE_API_MODE).
 * Without an argument it reads NEXT_PUBLIC_API_MODE, VITE_API_MODE or API_MODE from process.env (server/tests).
 */
export function apiMode(value?: string | null, fallback: ApiMode = "api"): ApiMode {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const v = (value ?? env?.NEXT_PUBLIC_API_MODE ?? env?.VITE_API_MODE ?? env?.API_MODE ?? "").trim().toLowerCase();
  if (/^(mock|mocks|mocked|fake|demo)$/.test(v)) return "mock";
  if (/^(hybrid|fallback|mixed)$/.test(v)) return "hybrid";
  if (/^(api|real|live|backend|prod|production)$/.test(v)) return "api";
  return fallback;
}
export const isMockMode = (value?: string | null): boolean => apiMode(value) === "mock";

const LIST_KEYS = ["items", "results", "data", "records", "content", "rows", "list", "docs", "entries"];
const WRAPPERS = ["data", "result", "payload", "value", "response"];
/**
 * true when an API payload has nothing to show: null, [], {}, or an envelope whose lists are all empty
 * ({ data: [] }, { isSuccess: true, result: { items: [], totalCount: 0 } }, ...). Used by hybrid mode.
 */
export function isEmptyPayload(body: unknown, depth = 0): boolean {
  if (body === null || body === undefined || body === "") return true;
  if (Array.isArray(body)) return body.length === 0;
  if (typeof body !== "object" || depth > 3) return false;
  const o = body as Record<string, unknown>;
  const lists = LIST_KEYS.filter((k) => Array.isArray(o[k]));
  if (lists.length) return lists.every((k) => (o[k] as unknown[]).length === 0);
  for (const w of WRAPPERS) if (w in o && (o[w] === null || typeof o[w] === "object")) return isEmptyPayload(o[w], depth + 1);
  return Object.keys(o).length === 0;
}

export interface HybridInfo { method: string; url: string; status?: number; body?: unknown; error?: unknown }
/** Default hybrid rule: GET requests (not under /auth) that failed on the network or returned an empty payload. */
export const defaultHybridFallback = (i: HybridInfo): boolean =>
  i.method === "GET" && !/\/(auth|login|logout|token|otp)(\/|$|\?)/i.test(i.url) && (i.error !== undefined || (i.status !== undefined && i.status < 300 && isEmptyPayload(i.body)));

/** A mock API, a promise of one, or a lazy loader such as () => import("./mocks") (module with `api` or default export). */
export type MockSource = MockApi<any> | Promise<MockApi<any>> | (() => MockApi<any> | Promise<MockApi<any> | { api?: MockApi<any>; default?: MockApi<any> | { api?: MockApi<any> } }>);

function resolver(source: MockSource): () => Promise<MockApi<any>> {
  let p: Promise<MockApi<any>> | undefined;
  const pick = (m: unknown): MockApi<any> => {
    const o = m as { api?: MockApi<any>; default?: unknown; handle?: unknown };
    if (o && typeof o.handle === "function") return o as unknown as MockApi<any>;
    if (o?.api) return o.api;
    if (o?.default) return pick(o.default);
    throw new Error("farsi-mock: the mock loader must resolve to a MockApi (export const api = createMockApi(...))");
  };
  return () => (p ??= Promise.resolve(typeof source === "function" ? source() : source).then(pick).then((api) => api.ready));
}

/** MockResponse -> fetch Response. */
export function toFetchResponse(r: MockResponse): Response {
  return new Response(r.body === undefined || r.status === 204 || r.status === 304 ? null : JSON.stringify(r.body), { status: r.status, statusText: r.statusText, headers: r.headers });
}

export interface MockFetchOptions {
  /** Hybrid mode only: when to answer from the mock after a real request (default: defaultHybridFallback). */
  hybridFallback?: (info: HybridInfo) => boolean;
  /** Real fetch for routes the mock does not know (default: globalThis.fetch). */
  fetch?: typeof fetch;
  /** Unknown routes: "passthrough" to the real fetch (default), "error" (404 JSON response) or "warn" (console.warn + passthrough). */
  onUnhandled?: "passthrough" | "error" | "warn";
  /** Only mock URLs for which this returns true. */
  include?: (url: string, method: string) => boolean;
}

/** A fetch() that answers from the mock API (and falls back to the network for unknown routes). */
export function createMockFetch(source: MockSource, opts: MockFetchOptions = {}): typeof fetch {
  const get = resolver(source);
  const real = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const mf = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const isReq = typeof input === "object" && !(input instanceof URL) && typeof (input as Request).url === "string";
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method ?? (isReq ? (input as Request).method : "GET")).toUpperCase();
    if (opts.include && !opts.include(url, method)) return real(input, init);
    const api = await get();
    const r = isReq && !init ? await api.handle((input as Request).clone()) : await api.handle({ url, method, headers: (init?.headers ?? (isReq ? (input as Request).headers : undefined)) as never, body: init?.body ?? undefined });
    if (r) return toFetchResponse(r);
    if (opts.onUnhandled === "error") return new Response(JSON.stringify({ message: `No mock for ${method} ${url}` }), { status: 404, headers: { "content-type": "application/json", "x-mock": "farsi-mock" } });
    if (opts.onUnhandled === "warn") console.warn(`[farsi-mock] no mock for ${method} ${url}; using the network`);
    return real(input, init);
  };
  return mf as typeof fetch;
}

/**
 * fetch for the current API mode: the real fetch in "api" mode (the mock module is never loaded),
 * the mock in "mock" mode. Use with a lazy loader so production bundles do not include the mocks:
 *   export const apiFetch = createApiFetch({ mode: process.env.NEXT_PUBLIC_API_MODE, mock: () => import("./mocks") });
 */
export function createApiFetch(opts: MockFetchOptions & { mode?: string | null; mock: MockSource }): typeof fetch {
  const mode = apiMode(opts.mode);
  const real = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  if (mode === "api") return real;
  const mocked = createMockFetch(opts.mock, opts);
  if (mode === "mock") return mocked;
  const get = resolver(opts.mock);
  const rule = opts.hybridFallback ?? defaultHybridFallback;
  const hybrid = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const isReq = typeof input === "object" && !(input instanceof URL) && typeof (input as Request).url === "string";
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method ?? (isReq ? (input as Request).method : "GET")).toUpperCase();
    const retry = isReq ? (input as Request).clone() : input;
    let res: Response | undefined, error: unknown;
    try { res = await real(input, init); } catch (e) { error = e; }
    const api = await get();
    if (!api.matches(method, url)) { if (res) return res; throw error; }
    let body: unknown;
    if (res && /json/i.test(res.headers.get("content-type") ?? "")) body = await res.clone().json().catch(() => undefined);
    if (rule({ method, url, status: res?.status, body, error })) return mocked(retry, init);
    if (res) return res;
    throw error;
  };
  return hybrid as typeof fetch;
}

/** Replace globalThis.fetch (so every fetch, TanStack Query, SWR, ky, ofetch... hits the mock). Returns an uninstall function. */
export function installMockFetch(source: MockSource, opts: MockFetchOptions = {}): () => void {
  const g = globalThis as { fetch: typeof fetch };
  const original = g.fetch;
  g.fetch = createMockFetch(source, { ...opts, fetch: opts.fetch ?? original?.bind(globalThis) });
  return () => { g.fetch = original; };
}

// ---------------------------------------------------------------- axios (structural types, axios is not imported)
export interface AxiosLikeConfig {
  url?: string; baseURL?: string; method?: string; params?: unknown; data?: unknown;
  headers?: unknown; validateStatus?: ((status: number) => boolean) | null; paramsSerializer?: unknown;
  [k: string]: unknown;
}
export interface AxiosLikeResponse<T = unknown> { data: T; status: number; statusText: string; headers: Record<string, string>; config: AxiosLikeConfig; request: unknown }
export type AxiosLikeAdapter = (config: AxiosLikeConfig) => Promise<AxiosLikeResponse>;

function axiosUrl(c: AxiosLikeConfig): string {
  const u = c.url ?? "";
  let full = /^[a-z]+:\/\//i.test(u) || !c.baseURL ? u : `${c.baseURL.replace(/\/+$/, "")}/${u.replace(/^\/+/, "")}`;
  let qs = "";
  if (typeof c.paramsSerializer === "function") qs = String((c.paramsSerializer as (p: unknown) => string)(c.params ?? {}));
  else if (c.params instanceof URLSearchParams) qs = c.params.toString();
  else if (c.params && typeof c.params === "object") {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(c.params as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      for (const x of Array.isArray(v) ? v : [v]) sp.append(k, x instanceof Date ? x.toISOString() : typeof x === "object" ? JSON.stringify(x) : String(x));
    }
    qs = sp.toString();
  }
  if (qs) full += (full.includes("?") ? "&" : "?") + qs;
  return full;
}
const plainHeaders = (h: unknown): Record<string, string> => {
  if (!h || typeof h !== "object") return {};
  const o = typeof (h as { toJSON?: () => unknown }).toJSON === "function" ? (h as { toJSON: () => Record<string, unknown> }).toJSON() : (h as Record<string, unknown>);
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)]));
};

/**
 * axios adapter: axios.create({ adapter: createAxiosAdapter(() => import("./mocks")) }).
 * `fallback` handles routes the mock does not know (e.g. axios.getAdapter(["xhr", "http", "fetch"])).
 * Errors (>= 400) reject with an AxiosError-shaped object (isAxiosError, response, code), so interceptors keep working.
 */
export function createAxiosAdapter(source: MockSource, opts: { fallback?: AxiosLikeAdapter; mode?: "mock" | "hybrid"; hybridFallback?: (info: HybridInfo) => boolean } = {}): AxiosLikeAdapter {
  const get = resolver(source);
  return async (config) => {
    const api = await get();
    const url = axiosUrl(config);
    if (opts.mode === "hybrid" && opts.fallback) {
      const method = (config.method ?? "get").toUpperCase();
      let real: AxiosLikeResponse | undefined, error: unknown;
      try { real = await opts.fallback(config); } catch (e) { error = e; }
      const status = real?.status ?? (error as { response?: { status?: number } })?.response?.status;
      const networkError = error !== undefined && status === undefined ? error : undefined;
      if (!api.matches(method, url) || !(opts.hybridFallback ?? defaultHybridFallback)({ method, url, status, body: real?.data, error: networkError })) {
        if (real) return real;
        throw error;
      }
    }
    const r = await api.handle({ url, method: (config.method ?? "get").toUpperCase(), headers: plainHeaders(config.headers), body: config.data });
    if (!r && opts.fallback) return opts.fallback(config);
    const status = r?.status ?? 404;
    const response: AxiosLikeResponse = { data: r ? r.body ?? "" : { message: `No mock for ${url}` }, status, statusText: r?.statusText ?? "Not Found", headers: r?.headers ?? {}, config, request: { mock: true, responseURL: url } };
    const ok = config.validateStatus === null ? true : (config.validateStatus ?? ((s: number) => s >= 200 && s < 300))(status);
    if (ok) return response;
    const msg = `Request failed with status code ${status}`;
    const code = status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST";
    const err = Object.assign(new Error(msg), {
      name: "AxiosError", isAxiosError: true, code, status, config, request: response.request, response,
      toJSON: (): Record<string, unknown> => ({ message: msg, name: "AxiosError", code, status }),
    });
    throw err;
  };
}

// ---------------------------------------------------------------- MSW (msw is not imported; pass its `http` and `HttpResponse`)
type MswResolver = (info: { request: Request }) => Promise<Response | undefined>;
export interface MswHttpLike { all: (path: string, r: MswResolver) => unknown; [method: string]: ((path: string, r: MswResolver) => unknown) | unknown }

/**
 * MSW request handlers for every mocked route:
 *   import { http } from "msw"; setupWorker(...createMswHandlers(api, { http })).start()
 * Paths become "*\/v1/products/:id" (any origin) unless `baseUrl` is given. Unknown requests fall through (MSW passthrough).
 */
export function createMswHandlers(api: MockApi<any>, opts: { http: MswHttpLike; baseUrl?: string; catchAll?: boolean }): unknown[] {
  const resolve: MswResolver = async ({ request }) => {
    const r = await api.handle(request);
    return r ? toFetchResponse(r) : undefined;
  };
  if (opts.catchAll) return [opts.http.all("*", resolve)];
  const prefix = (opts.baseUrl ?? `*${api.spec.basePath}`).replace(/\/+$/, "");
  return api.routes().map((key) => {
    const m = /^([A-Z]+)\s+(.+)$/i.exec(key);
    const method = m ? m[1].toLowerCase() : "all";
    const path = (m ? m[2] : key).replace(/\{([^}]+)\}/g, ":$1");
    const fn = (opts.http[method] ?? opts.http.all) as (p: string, r: MswResolver) => unknown;
    return fn.call(opts.http, `${prefix}${path}`, resolve);
  });
}

// ---------------------------------------------------------------- per-browser sessions (server-side mocks)
export interface SessionOptions {
  /** Cookie name (default "farsi_mock_session"). */
  cookie?: string;
  /** Max sessions kept in memory (oldest dropped). Default 200. */
  maxSessions?: number;
  /** Idle time before a session is dropped (ms). Default 24h. */
  ttlMs?: number;
}
/** Each browser (cookie) gets its own fork of the mock API, so one tester's changes do not leak into another's. */
export function sessionStore(o: SessionOptions = {}): (req: Request, root: MockApi<any>) => { api: MockApi<any>; setCookie?: string } {
  const name = o.cookie ?? "farsi_mock_session";
  const max = o.maxSessions ?? 200, ttl = o.ttlMs ?? 86_400_000;
  const g = globalThis as unknown as Record<symbol, Map<string, { api: MockApi<any>; touched: number }> | undefined>;
  const key = Symbol.for(`farsi-mock.sessions.${name}`);
  const map = (g[key] ??= new Map());
  return (req, root) => {
    const now = Date.now();
    for (const [k, v] of map) if (now - v.touched > ttl) map.delete(k);
    const cookie = req.headers.get("cookie") ?? "";
    const id = new RegExp(`(?:^|;\\s*)${name}=([\\w-]+)`).exec(cookie)?.[1];
    const hit = id ? map.get(id) : undefined;
    if (hit) { hit.touched = now; return { api: hit.api }; }
    const fresh = (globalThis.crypto?.randomUUID?.() ?? `${now.toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, "");
    if (map.size >= max) map.delete(map.keys().next().value as string);
    const api = root.fork();
    map.set(fresh, { api, touched: now });
    return { api, setCookie: `${name}=${fresh}; Path=/; HttpOnly; SameSite=Lax` };
  };
}

// ---------------------------------------------------------------- Next.js (App Router)
type NextHandler = (req: Request) => Promise<Response>;
/**
 * Route handlers for app/api/[...path]/route.ts (or any catch-all), so the browser and server components can call
 * a mock backend on the Next.js server itself:
 *   export const { GET, POST, PUT, PATCH, DELETE } = createNextRouteHandlers(() => import("@/mocks"), { mount: "/api" });
 * `mount` is the URL prefix of the catch-all route; it is replaced by the spec's basePath.
 */
export function createNextRouteHandlers(source: MockSource, opts: { mount?: string; session?: boolean | SessionOptions } = {}): Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS", NextHandler> {
  const get = resolver(source);
  const sessions = opts.session ? sessionStore(opts.session === true ? {} : opts.session) : undefined;
  const h: NextHandler = async (req) => {
    const root = await get();
    const s = sessions?.(req, root);
    const api = s?.api ?? root;
    let target: Request = req;
    if (opts.mount) {
      const u = new URL(req.url);
      const mount = opts.mount.replace(/\/+$/, "");
      if (u.pathname === mount || u.pathname.startsWith(mount + "/")) {
        u.pathname = api.spec.basePath + (u.pathname.slice(mount.length) || "/");
        target = new Request(u, req);
      }
    }
    const r = await api.handle(target);
    const res = r ? toFetchResponse(r) : new Response(JSON.stringify({ message: "No mock route" }), { status: 404, headers: { "content-type": "application/json" } });
    res.headers.set("cache-control", "private, no-store");
    if (s?.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  };
  return { GET: h, POST: h, PUT: h, PATCH: h, DELETE: h, HEAD: h, OPTIONS: h };
}

/**
 * Next.js middleware helper: answers matching API requests from the mock, returns undefined otherwise.
 *   const mock = createMockMiddleware(() => import("./mocks"));
 *   export async function middleware(req) { if (isMockMode(process.env.NEXT_PUBLIC_API_MODE)) { const r = await mock(req); if (r) return r; } }
 */
export function createMockMiddleware(source: MockSource, opts: { prefix?: string } = {}): (req: Request) => Promise<Response | undefined> {
  const get = resolver(source);
  return async (req) => {
    if (opts.prefix && !new URL(req.url).pathname.startsWith(opts.prefix)) return undefined;
    const api = await get();
    const r = await api.handle(req);
    return r ? toFetchResponse(r) : undefined;
  };
}

// ---------------------------------------------------------------- several backends
/** One MockApi over several (e.g. one per backend service). The first API whose route matches answers. */
export function combineMockApis(...apis: MockApi<any>[]): MockApi<any> {
  if (!apis.length) throw new Error("farsi-mock: combineMockApis needs at least one api");
  const ready = Promise.all(apis.map((a) => a.ready));
  const combined: MockApi<any> = {
    get spec() { return apis[0].spec; },
    ready: ready.then(() => combined),
    async handle(req) {
      await ready;
      for (const a of apis) {
        const r = await a.handle(typeof (req as Request).clone === "function" ? (req as Request).clone() : req);
        if (r) return r;
      }
      return undefined;
    },
    async fetch(input, init) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      const method = (init?.method ?? (typeof input === "object" && !(input instanceof URL) ? (input as Request).method : "GET")).toUpperCase();
      await ready;
      return (apis.find((a) => a.matches(method, url)) ?? apis[0]).fetch(input, init);
    },
    async request(key, o) {
      await ready;
      const m = /^([A-Z]+)\s+(.+)$/i.exec(key);
      const target = apis.find((a) => a.routes().some((r) => r === key || (m && r === `${m[1].toUpperCase()} ${m[2]}`))) ?? apis[0];
      return target.request(key, o);
    },
    matches: (method, url) => apis.some((a) => a.matches(method, url)),
    rows(resource) { for (const a of apis) if (a.spec.resources[resource]) return a.rows(resource); return apis[0].rows(resource); },
    reset() { apis.forEach((a) => a.reset()); },
    routes: () => apis.flatMap((a) => a.routes()),
    fork: () => combineMockApis(...apis.map((a) => a.fork())),
  };
  return combined;
}
