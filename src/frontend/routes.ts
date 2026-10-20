// Hand-written mock specs (no OpenAPI): resources + routes + envelope templates.
import type { JsonGen } from "../infer/mapper.js";
import { comparePaths } from "./paths.js";
import type { HttpMethod, MetaRole, MockResource, MockRoute, MockSpec, QueryRoles, RouteKind, Shape } from "./types.js";

/**
 * Envelope template. Strings starting with "$" are placeholders:
 * $items, $record, $total, $page, $pageSize, $pages, $count, $offset, $hasNext, $hasPrev, $next, $prev, $first, $last, $empty,
 * $status, $statusText, $message, $now. Objects with a "$" key ({ $int: [1, 5] }, { $pick: [...] }) and "gen:<path>" strings are generators.
 * Anything else is a literal.
 */
export type EnvelopeTemplate = string | number | boolean | null | EnvelopeTemplate[] | { [k: string]: EnvelopeTemplate | JsonGen };

/** Ready-made envelopes. */
export const ENVELOPES = {
  /** Bare array / bare object. */
  raw: { list: "$items", record: "$record" },
  /** { data: [...], meta: { page, pageSize, total, totalPages } } and { data: {...} } */
  data: { list: { data: "$items", meta: { page: "$page", pageSize: "$pageSize", total: "$total", totalPages: "$pages" } }, record: { data: "$record" } },
  /** { items, total, page, pageSize } and the bare record */
  items: { list: { items: "$items", total: "$total", page: "$page", pageSize: "$pageSize" }, record: "$record" },
  /** .NET style: { isSuccess, message, result: { items, totalCount, pageNumber, pageSize, totalPages, hasNextPage, hasPreviousPage } } */
  result: {
    list: { isSuccess: "$ok", message: "$message", result: { items: "$items", totalCount: "$total", pageNumber: "$page", pageSize: "$pageSize", totalPages: "$pages", hasNextPage: "$hasNext", hasPreviousPage: "$hasPrev" } },
    record: { isSuccess: "$ok", message: "$message", result: "$record" },
    error: { isSuccess: "$ok", message: "$message", errors: ["$message"] },
  },
  /** Spring Data Page: { content, totalElements, totalPages, size, number, first, last, numberOfElements, empty } (pages from 0). */
  spring: {
    list: { content: "$items", totalElements: "$total", totalPages: "$pages", size: "$pageSize", number: "$page", first: "$first", last: "$last", numberOfElements: "$count", empty: "$empty" },
    record: "$record", pageBase: 0 as const,
  },
} satisfies Record<string, EnvelopePreset>;

export interface EnvelopePreset { list: EnvelopeTemplate; record: EnvelopeTemplate; error?: EnvelopeTemplate; pageBase?: 0 | 1 }

export interface ResourceDef {
  /** Field generators (JSON generator format: "person.fullName", { $int: [1, 9] }, nested objects, ...). */
  fields: Record<string, JsonGen>;
  /** Primary key field (default "id", or "_id" when present). */
  id?: string;
  count?: number;
}

export interface RouteDef {
  list?: string; detail?: string; create?: string; update?: string; delete?: string;
  /** Envelope for this route: a preset name or a template. */
  envelope?: keyof typeof ENVELOPES | EnvelopeTemplate;
  /** Fixed body for plain endpoints (template; "$" placeholders and generators allowed). */
  body?: EnvelopeTemplate;
  status?: number;
  /** Path param -> field ("{slug}" -> "slug"). Default: the last param selects by id, earlier ones filter by a same-named field. */
  params?: Record<string, string>;
  query?: QueryRoles;
  /** Only these top-level fields (a "view" of the resource). */
  pick?: string[];
  /** Error body template. */
  error?: EnvelopeTemplate;
}

export interface RoutesSpecInput {
  /** Path prefix, e.g. "/api". */
  basePath?: string;
  title?: string;
  resources: Record<string, ResourceDef>;
  /** "GET /products": { list: "Product" }, "GET /products/:id": { detail: "Product" }, "GET /me": { body: {...} } */
  routes?: Record<string, RouteDef>;
  /** Default envelope (preset name or { list, record, error }). Default "raw". */
  envelope?: keyof typeof ENVELOPES | EnvelopePreset;
  /**
   * Generate CRUD routes for every resource: "/products", "/products/{id}" (GET, POST, PUT, PATCH, DELETE).
   * true = lower-case plural of the resource name; or a map resource -> path.
   */
  crud?: boolean | Record<string, string>;
}

const PLACEHOLDER: Record<string, MetaRole> = {
  total: "total", page: "page", pageSize: "pageSize", pages: "pages", count: "count", offset: "offset", hasNext: "hasNext", hasPrev: "hasPrev",
  next: "next", prev: "prev", first: "first", last: "last", empty: "empty", status: "status", statusText: "statusText", message: "message",
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Template -> Shape. */
export function templateShape(t: unknown, resource: string | undefined, pick?: string[]): Shape {
  if (typeof t === "string" && t.startsWith("$")) {
    const k = t.slice(1);
    if (k === "items" || k === "record") {
      if (!resource) throw new Error(`farsi-mock: "${t}" needs a resource on this route`);
      return { t: k, resource, ...(pick ? { pick } : {}) };
    }
    if (k === "now") return { t: "now" };
    if (k === "ok") return { t: "meta", role: "ok" as MetaRole, as: "boolean" };
    const role = PLACEHOLDER[k];
    if (role) return { t: "meta", role, as: role === "message" || role === "statusText" ? "string" : /^(has|first|last|empty)/.test(role) ? "boolean" : "number" };
    return { t: "const", value: t };
  }
  if (typeof t === "string" && t.startsWith("gen:")) return { t: "gen", gen: t.slice(4) };
  if (Array.isArray(t)) return t.length === 1 ? { t: "array", of: templateShape(t[0], resource, pick), min: 1, max: 1 } : { t: "const", value: t };
  if (isObj(t)) {
    if (Object.keys(t).some((k) => k.startsWith("$"))) return { t: "gen", gen: t as JsonGen };
    return { t: "object", props: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, templateShape(v, resource, pick)])) };
  }
  return { t: "const", value: t };
}

const plural = (s: string) => { const l = s.toLowerCase(); return /(s|x|ch|sh)$/.test(l) ? l + "es" : /[^aeiou]y$/.test(l) ? l.slice(0, -1) + "ies" : l + "s"; };
const toBrace = (p: string) => p.replace(/:(\w+)/g, "{$1}");

/** Build a MockSpec from hand-written resources and routes. */
export function defineMockSpec(input: RoutesSpecInput): MockSpec {
  const preset: EnvelopePreset = typeof input.envelope === "string" ? ENVELOPES[input.envelope] : input.envelope ?? ENVELOPES.raw;
  const resources: Record<string, MockResource> = {};
  for (const [name, r] of Object.entries(input.resources)) {
    const idField = r.id ?? ("id" in r.fields ? "id" : "_id" in r.fields ? "_id" : "id");
    const fields = { ...r.fields };
    if (!(idField in fields)) fields[idField] = "id.index";
    const g = fields[idField];
    const idType = g === "id.index" || (isObj(g) && "$int" in g) ? "int" : g === "id.objectId" ? "objectId" : g === "id.uuid" ? "uuid" : "string";
    if (idType === "int") fields[idField] = "id.index";
    resources[name] = { fields, idField, idType, count: r.count ?? 30 };
  }
  const defs: [string, RouteDef][] = Object.entries(input.routes ?? {});
  if (input.crud) {
    for (const name of Object.keys(input.resources)) {
      const base = typeof input.crud === "object" ? input.crud[name] : `/${plural(name)}`;
      if (!base) continue;
      const crud: [string, RouteDef][] = [
        [`GET ${base}`, { list: name }], [`POST ${base}`, { create: name }], [`GET ${base}/{id}`, { detail: name }],
        [`PUT ${base}/{id}`, { update: name }], [`PATCH ${base}/{id}`, { update: name }], [`DELETE ${base}/{id}`, { delete: name, status: 204 }],
      ];
      for (const [k, v] of crud) if (!defs.some(([x]) => toBrace(x) === k)) defs.push([k, v]);
    }
  }
  const routes: MockRoute[] = defs.map(([key, d]) => {
    const m = /^([A-Z]+)\s+(\S+)$/i.exec(key.trim());
    if (!m) throw new Error(`farsi-mock: route key "${key}" must look like "GET /path"`);
    const method = m[1].toUpperCase() as HttpMethod;
    const path = toBrace(m[2]);
    const kind: RouteKind = d.list ? "list" : d.detail ? "detail" : d.create ? "create" : d.update ? "update" : d.delete ? "delete" : "other";
    const resource = d.list ?? d.detail ?? d.create ?? d.update ?? d.delete;
    if (resource && !resources[resource]) throw new Error(`farsi-mock: route "${key}" uses unknown resource "${resource}"`);
    const env: EnvelopePreset | undefined = typeof d.envelope === "string" && d.envelope in ENVELOPES ? ENVELOPES[d.envelope as keyof typeof ENVELOPES] : undefined;
    const tpl = d.body ?? (env ? (kind === "list" ? env.list : env.record) : d.envelope !== undefined ? d.envelope : kind === "list" ? preset.list : kind === "other" ? undefined : preset.record);
    const status = d.status ?? (kind === "create" ? 201 : 200);
    const route: MockRoute = { method, path, kind, status };
    if (resource) route.resource = resource;
    if (tpl !== undefined && status !== 204) route.response = templateShape(tpl, resource, d.pick);
    const names = [...path.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
    if (resource && names.length) {
      const r = resources[resource];
      route.params = {};
      names.forEach((n, i) => {
        const last = i === names.length - 1 && /\}$/.test(path) && kind !== "list" && kind !== "create";
        route.params![n] = d.params?.[n] ?? (last ? (n in r.fields ? n : r.idField) : n in r.fields ? n : "~");
      });
    }
    const pageBase = (env ?? preset).pageBase;
    if (kind === "list" && (d.query || pageBase !== undefined)) route.query = { ...(pageBase !== undefined ? { pageBase } : {}), ...d.query };
    const errTpl = d.error ?? env?.error ?? preset.error;
    if (errTpl) route.errors = { default: templateShape(errTpl, undefined) };
    return route;
  });
  routes.sort((a, b) => comparePaths(a.path, b.path));
  return { farsiMockSpec: 1, title: input.title, basePath: (input.basePath ?? "").replace(/\/+$/, ""), resources, routes };
}
