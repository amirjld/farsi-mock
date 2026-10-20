// OpenAPI 3.x / Swagger 2 -> MockSpec. Finds envelopes ({ data, meta }, { items, total, page }, { isSuccess, result }, ...),
// links list/detail/create/update/delete routes of the same resource, and maps record fields with farsi-mock's alias inference.
import { jsonField, resolveRef, singular } from "../infer/parsers.js";
import { mapModels, type JsonGen } from "../infer/mapper.js";
import { tokenize } from "../infer/aliases.js";
import type { FieldSpec, ModelSpec } from "../infer/spec.js";
import { comparePaths } from "./paths.js";
import type { HttpMethod, MetaRole, MockResource, MockRoute, MockSpec, QueryRoles, RouteKind, Shape } from "./types.js";

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface CompileOptions {
  /** Field overrides: "Product.price", "price" (any resource) -> generator. Route overrides: "GET /me" -> Shape-free JSON generator for the whole body. */
  overrides?: Record<string, JsonGen>;
  /** Records per resource (number or per resource name). Default 30. */
  count?: number | Record<string, number>;
  /** Path prefix override (default: servers[0].url path / basePath). */
  basePath?: string;
  /** Share of nullable fields that come back null (default 0.1, so empty states show up). */
  nullRate?: number;
  /** Image-like fields (avatar, image, thumbnail, logo, ...): "svg" offline placeholder data URIs (default) or "url" (https://*.example.com). */
  images?: "svg" | "url";
}

// ---------------------------------------------------------------- envelope vocabulary
const META: Record<string, MetaRole> = {};
const addMeta = (role: MetaRole, keys: string) => keys.split(" ").forEach((k) => (META[k] = role));
addMeta("total", "total totalrow totalrows rowcount totalcount count totalitems totalelements totalrecords totalresults recordstotal recordsfiltered totalrows totalsize totalentries itemscount totalitemcount");
addMeta("page", "page currentpage pagenumber pageindex pageno pagenum number curpage");
addMeta("pageSize", "pagesize limit perpage size take itemsperpage pagelength rowsperpage maxresults");
addMeta("pages", "totalpages pages pagecount lastpage numpages totalpage pagestotal");
addMeta("count", "numberofelements itemcount currentitemcount pageitems countonpage");
addMeta("offset", "offset skip start from");
addMeta("hasNext", "hasnext hasnextpage hasmore more nextpageexists");
addMeta("hasPrev", "hasprev hasprevious haspreviouspage hasprevpage");
addMeta("next", "next nextpage nextpageurl nextlink nexturl nextcursor nextpagenumber");
addMeta("prev", "prev previous prevpage previouspage previouspageurl prevlink prevurl prevcursor");
addMeta("first", "first isfirst isfirstpage firstpage");
addMeta("last", "last islast islastpage");
addMeta("empty", "empty isempty");
const OK_KEYS = new Set(["success", "issuccess", "ok", "succeeded", "issucceeded", "issuccessful", "successful", "status", "result"]);
const CODE_KEYS = new Set(["statuscode", "code", "httpstatus", "httpcode", "status", "errorcode", "resultcode", "responsecode"]);
const MESSAGE_KEYS = new Set(["message", "msg", "messages", "resultmessage", "responsemessage", "detail", "title", "description", "errormessage"]);
const ERRORS_KEYS = new Set(["error", "errors", "errormessages", "validationerrors", "exception", "problems"]);
const TIME_KEYS = new Set(["timestamp", "servertime", "time", "datetime", "responsetime"]);
const TRACE_KEYS = new Set(["traceid", "requestid", "correlationid", "trackingid", "trackid"]);
const CONTAINERS = ["data", "result", "results", "payload", "response", "body", "value", "item", "record", "entity", "object", "content", "model", "dto"];
const META_CONTAINERS = new Set(["meta", "metadata", "pagination", "paging", "pageinfo", "pager", "page", "pagable", "pageable", "links", "link", "info", "paginate"]);
const LIST_KEYS = ["data", "items", "results", "result", "rows", "records", "content", "list", "docs", "entries", "values", "elements", "nodes", "hits", "collection"];

// ---------------------------------------------------------------- schema helpers
interface Deref { node: Obj; ref?: string; nullable: boolean }
function deref(doc: Obj, node: unknown, depth = 0): Deref {
  let n: Obj = isObj(node) ? node : {};
  let ref: string | undefined;
  let nullable = n.nullable === true || n["x-nullable"] === true;
  for (let i = 0; i < 20 && typeof n.$ref === "string"; i++) {
    ref = n.$ref.split("/").pop();
    const t = resolveRef(doc, n.$ref);
    if (!isObj(t)) break;
    n = t;
    nullable ||= n.nullable === true;
  }
  const alts = n.oneOf ?? n.anyOf;
  if (Array.isArray(alts) && depth < 10) {
    const nonNull = alts.filter((o: Obj) => !(isObj(o) && o.type === "null"));
    const d = deref(doc, nonNull[0], depth + 1);
    return { node: d.node, ref: d.ref ?? ref, nullable: nullable || nonNull.length < alts.length || d.nullable };
  }
  if (Array.isArray(n.type)) nullable ||= n.type.includes("null");
  if (Array.isArray(n.allOf) && depth < 10) {
    // merge parts into one object schema; the first $ref part names it
    const props: Obj = {}, req: string[] = [];
    let firstRef: string | undefined;
    for (const p of n.allOf) {
      const d = deref(doc, p, depth + 1);
      firstRef ??= d.ref;
      Object.assign(props, d.node.properties ?? {});
      if (Array.isArray(d.node.required)) req.push(...d.node.required);
    }
    Object.assign(props, n.properties ?? {});
    if (Array.isArray(n.required)) req.push(...n.required);
    return { node: { ...n, allOf: undefined, type: "object", properties: props, required: req }, ref: ref ?? firstRef, nullable };
  }
  return { node: n, ref, nullable };
}
const typeOf = (n: Obj): string | undefined => {
  const t = Array.isArray(n.type) ? n.type.find((x: string) => x !== "null") : n.type;
  return t ?? (n.properties ? "object" : n.items ? "array" : undefined);
};
const isObjectSchema = (d: Deref) => typeOf(d.node) === "object" && !!d.node.properties;
function props(d: Deref): [string, Obj][] { return Object.entries((d.node.properties ?? {}) as Obj); }
const pascal = (s: string) => tokenize(s).map((w) => w[0].toUpperCase() + w.slice(1)).join("") || "Item";

// ---------------------------------------------------------------- envelope analysis
type Mode = "success" | "error";
const looksLikeId = (k: string) => /^(id|_id|uuid|guid|key|slug|code)$/i.test(k) || /(Id|_id|ID)$/.test(k);
function envelopeKey(k: string, n: Deref): boolean {
  const x = norm(k);
  const t = typeOf(n.node);
  if (META[x] && t !== "object" && t !== "array") return true;
  if (OK_KEYS.has(x) || CODE_KEYS.has(x) || MESSAGE_KEYS.has(x) || ERRORS_KEYS.has(x) || TIME_KEYS.has(x) || TRACE_KEYS.has(x)) return t !== "object" || ERRORS_KEYS.has(x);
  if (META_CONTAINERS.has(x) && t === "object") return true;
  return false;
}
/** An object whose properties are all envelope keys, except `except` (the payload). */
function isEnvelope(doc: Obj, d: Deref, except: string, slack = 0): boolean {
  let unknown = 0;
  for (const [k, v] of props(d)) if (k !== except && !envelopeKey(k, deref(doc, v))) unknown++;
  return unknown <= slack;
}
const arrayOfObjects = (doc: Obj, d: Deref): Deref | undefined => {
  if (typeOf(d.node) !== "array") return undefined;
  const it = deref(doc, d.node.items);
  return isObjectSchema(it) ? it : undefined;
};

/** Path (property names) to the list array inside a response schema, or undefined. [] = the body itself is the array. */
function findList(doc: Obj, d: Deref, depth = 0): string[] | undefined {
  if (arrayOfObjects(doc, d)) return [];
  if (!isObjectSchema(d) || depth > 3) return undefined;
  const entries = props(d);
  const cands = entries.filter(([, v]) => arrayOfObjects(doc, deref(doc, v)));
  cands.sort((a, b) => rank(LIST_KEYS, a[0]) - rank(LIST_KEYS, b[0]));
  for (const [k] of cands) if (isEnvelope(doc, d, k, LIST_KEYS.includes(norm(k)) ? 1 : 0)) return [k];
  for (const [k, v] of entries.sort((a, b) => rank(CONTAINERS, a[0]) - rank(CONTAINERS, b[0]))) {
    const x = norm(k);
    if (!CONTAINERS.includes(x) && !META_CONTAINERS.has(x)) continue;
    const sub = deref(doc, v);
    if (!isObjectSchema(sub) || !isEnvelope(doc, d, k, 1)) continue;
    const p = findList(doc, sub, depth + 1);
    if (p) return [k, ...p];
  }
  return undefined;
}
const rank = (list: string[], k: string) => { const i = list.indexOf(norm(k)); return i < 0 ? 99 : i; };

/** Path to the record inside a detail/mutation response, [] = the body is the record, undefined = no record. */
function findRecord(doc: Obj, d: Deref, known: Set<string>, depth = 0): string[] | undefined {
  if (!isObjectSchema(d) || depth > 3) return undefined;
  const entries = props(d);
  const names = entries.map(([k]) => k);
  const hasId = names.some(looksLikeId);
  const envelopeLike = entries.some(([k, v]) => { const x = norm(k); return (OK_KEYS.has(x) || CONTAINERS.includes(x)) && typeOf(deref(doc, v).node) !== undefined; });
  if ((d.ref && known.has(d.ref)) || (hasId && !envelopeLike)) return [];
  const objs = entries.filter(([, v]) => isObjectSchema(deref(doc, v))).sort((a, b) => rank(CONTAINERS, a[0]) - rank(CONTAINERS, b[0]));
  for (const [k, v] of objs) {
    if (!CONTAINERS.includes(norm(k)) && !(objs.length === 1 && !META_CONTAINERS.has(norm(k)))) continue;
    if (!isEnvelope(doc, d, k, 1)) continue;
    const sub = deref(doc, v);
    const p = findRecord(doc, sub, known, depth + 1);
    if (p) return [k, ...p];
    return [k];
  }
  return envelopeLike ? undefined : [];
}

// ---------------------------------------------------------------- leaf generators
function leafGen(doc: Obj, name: string, d: Deref, model: string, overrides?: Record<string, JsonGen>): JsonGen {
  const spec = jsonField(name, d.node, doc, 0, new Set());
  const { models } = mapModels([{ name: model, fields: [spec] }], { overrides });
  return models[0].fields[name];
}

function statusShape(doc: Obj, k: string, d: Deref, mode: Mode): Shape | undefined {
  const x = norm(k);
  const t = typeOf(d.node);
  const en = Array.isArray(d.node.enum) ? (d.node.enum as unknown[]) : undefined;
  if (OK_KEYS.has(x) && t === "boolean") return { t: "const", value: mode === "success" };
  if ((x === "status" || x === "result") && t === "string") {
    const good = en?.find((v) => /^(ok|success|succeeded|successful|done)$/i.test(String(v))) ?? (en ? en[0] : "success");
    const bad = en?.find((v) => /^(error|fail|failed|failure|nok)$/i.test(String(v))) ?? (en ? en[en.length - 1] : "error");
    return { t: "const", value: mode === "success" ? good : bad };
  }
  if (CODE_KEYS.has(x) && (t === "integer" || t === "number")) {
    // envelopes like { isSuccess, statusCode: 0, data } use an app code, declared as default/example
    const declared = d.node.default ?? d.node.example;
    if (mode === "success" && typeof declared === "number") return { t: "const", value: declared };
    return { t: "meta", role: "status", as: "number" };
  }
  if (CODE_KEYS.has(x) && t === "string" && x !== "status") return en ? { t: "const", value: en[0] } : { t: "meta", role: "statusText", as: "string" };
  if (MESSAGE_KEYS.has(x)) {
    if (t === "string") return { t: "meta", role: "message", as: "string" };
    if (t === "array") return { t: "array", of: { t: "meta", role: "message", as: "string" }, min: mode === "error" ? 1 : 0, max: mode === "error" ? 1 : 0 };
  }
  if (ERRORS_KEYS.has(x)) {
    if (mode === "success") return d.nullable || t === "object" || t === "string" ? { t: "const", value: null } : t === "array" ? { t: "const", value: [] } : { t: "const", value: null };
    if (t === "array") {
      const it = deref(doc, d.node.items);
      if (typeOf(it.node) === "string") return { t: "array", of: { t: "meta", role: "message", as: "string" }, min: 1, max: 1 };
      return { t: "array", of: errorObject(doc, it), min: 1, max: 1 };
    }
    if (t === "string") return { t: "meta", role: "message", as: "string" };
    if (t === "object") return errorObject(doc, d);
  }
  if (TIME_KEYS.has(x) && t === "string") return { t: "now" };
  if (TIME_KEYS.has(x) && (t === "integer" || t === "number")) return { t: "meta", role: "epoch", as: "number" };
  if (TRACE_KEYS.has(x) && t === "string") return { t: "gen", gen: "id.uuid" };
  return undefined;
}
function errorObject(doc: Obj, d: Deref): Shape {
  const out: Record<string, Shape> = {};
  for (const [k, v] of props(d)) {
    const sub = deref(doc, v);
    const x = norm(k);
    out[k] = statusShape(doc, k, sub, "error")
      ?? (/(field|property|param|path|key|name)$/.test(x) && typeOf(sub.node) === "string" ? { t: "const", value: "title" } : { t: "gen", gen: leafGen(doc, k, sub, "Error") });
  }
  return { t: "object", props: out };
}

/** Build the response shape around the payload at `target` (list or record). */
function envShape(doc: Obj, d: Deref, target: string[] | undefined, payload: Shape | undefined, mode: Mode, model: string, ov: Record<string, JsonGen> | undefined, depth = 0): Shape {
  if (target && target.length === 0 && payload) return d.nullable && mode === "success" ? payload : payload;
  const t = typeOf(d.node);
  if (t === "object" && d.node.properties) {
    const out: Record<string, Shape> = {};
    for (const [k, v] of props(d)) {
      const sub = deref(doc, v);
      if (target && target[0] === k) { out[k] = envShape(doc, sub, target.slice(1), payload, mode, model, ov, depth + 1); continue; }
      const x = norm(k);
      const st = typeOf(sub.node);
      if (META[x] && st !== "object" && st !== "array" && (target || mode === "success")) {
        // "page"/"number"/"start" are only meta next to a list
        out[k] = { t: "meta", role: META[x], as: st === "string" ? "string" : st === "boolean" ? "boolean" : "number" };
        if (st === "string" && META[x] === "page") out[k] = { t: "meta", role: "page", as: "string" };
        continue;
      }
      const s = statusShape(doc, k, sub, mode);
      if (s) { out[k] = s; continue; }
      if (META_CONTAINERS.has(x) && st === "object" && depth < 4 && (target || mode === "error")) { out[k] = envShape(doc, sub, undefined, undefined, mode, model, ov, depth + 1); continue; }
      out[k] = { t: "gen", gen: leafGen(doc, k, sub, model, ov) };
    }
    return { t: "object", props: out };
  }
  if (payload && target && target.length) return payload;
  return { t: "gen", gen: leafGen(doc, "value", d, model, ov) };
}

// ---------------------------------------------------------------- operations
const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
interface Op { method: HttpMethod; path: string; op: Obj; params: Obj[] }

function successResponse(doc: Obj, op: Obj): { status: number; schema?: Obj } {
  const res = (op.responses ?? {}) as Obj;
  const codes = Object.keys(res);
  const code = codes.find((c) => /^2\d\d$/.test(c)) ?? codes.find((c) => /^2XX$/i.test(c)) ?? (codes.includes("default") ? "default" : undefined);
  if (!code) return { status: 200 };
  const r = deref(doc, res[code]).node;
  const status = /^\d+$/.test(code) ? Number(code) : 200;
  return { status, schema: bodySchema(r) };
}
function bodySchema(r: Obj): Obj | undefined {
  if (r.schema) return r.schema; // Swagger 2
  const content = (r.content ?? {}) as Obj;
  const key = Object.keys(content).find((k) => /json/i.test(k)) ?? Object.keys(content).find((k) => k === "*/*") ?? Object.keys(content)[0];
  return key ? content[key]?.schema : undefined;
}

function queryRoles(doc: Obj, params: Obj[], fields: string[]): QueryRoles | undefined {
  const q: QueryRoles = {};
  const filters: NonNullable<QueryRoles["filters"]> = {};
  const fieldBy = new Map(fields.map((f) => [norm(f), f]));
  for (const raw of params) {
    const p = deref(doc, raw).node;
    if (p.in !== "query" || typeof p.name !== "string") continue;
    const name: string = p.name;
    const x = norm(name);
    const sch = deref(doc, p.schema ?? p).node;
    if (["page", "pagenumber", "pageindex", "pageno", "currentpage", "pagenum", "p"].includes(x) && !q.page) {
      q.page = name;
      if (sch.minimum === 0 || sch.default === 0 || x === "pageindex" && sch.minimum !== 1) q.pageBase = 0;
    } else if (["pagesize", "limit", "perpage", "size", "take", "pagelength", "itemsperpage", "maxresults", "top", "rowsperpage", "count"].includes(x) && !q.pageSize) {
      q.pageSize = name;
      if (typeof sch.default === "number") q.defaultPageSize = sch.default;
    } else if (["offset", "skip", "start"].includes(x)) q.offset = name;
    else if (["q", "search", "query", "keyword", "keywords", "term", "searchterm", "searchtext", "text", "s", "filter", "searchquery"].includes(x) && !q.search && typeOf(sch) !== "object") q.search = name;
    else if (["sort", "sortby", "orderby", "ordering", "sortfield", "sortcolumn", "sortkey"].includes(x)) q.sort = name;
    else if (["order", "sortorder", "direction", "sortdir", "orderdir", "dir", "sortdirection", "orderdirection"].includes(x)) q.order = name;
    else {
      const m = /^(.*?)(?:_?(gte|lte|gt|lt|min|max|from|to|like))$/i.exec(name) ?? /^(min|max|from|to)_?(.*)$/i.exec(name);
      if (fieldBy.has(x)) filters[name] = { field: fieldBy.get(x)!, op: typeOf(sch) === "array" ? "in" : "eq" };
      else if (m) {
        const [a, b] = /^(min|max|from|to)$/i.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
        const f = fieldBy.get(norm(a)) ?? fieldBy.get(norm(a) + "at") ?? fieldBy.get(norm(a) + "date");
        const op = /^(gte|gt|min|from)$/i.test(b) ? "gte" : /like/i.test(b) ? "like" : "lte";
        if (f) filters[name] = { field: f, op };
      } else if (x.endsWith("id") && fieldBy.has(x)) filters[name] = { field: fieldBy.get(x)!, op: "eq" };
    }
  }
  if (Object.keys(filters).length) q.filters = filters;
  return Object.keys(q).length ? q : undefined;
}

// ---------------------------------------------------------------- field polish for UIs
const IMAGE = /(avatar|image|img|photo|picture|pic|thumbnail|thumb|logo|icon|cover|banner|poster|aks|tasvir)/i;
function polish(resource: string, fields: Record<string, JsonGen>, idField: string, opts: CompileOptions, ov?: Record<string, JsonGen>): void {
  const isCategory = /categor|dastebandi|genre|department/i.test(resource);
  const walk = (o: Record<string, JsonGen>, top: boolean, path: string) => {
    for (const [k, g] of Object.entries(o)) {
      const full = path ? `${path}.${k}` : k;
      if (ov && (`${resource}.${full}` in ov || full in ov || k in ov)) continue;
      const imgKind = /avatar|profile|user|aks/i.test(k) ? "internet.avatar" : /thumb|icon|logo/i.test(k) ? "internet.thumbnail" : "internet.image";
      const replaced = (x: JsonGen): JsonGen => {
        if (x === "internet.url" && IMAGE.test(k) && opts.images !== "url") return imgKind;
        if (x === "id.index" && !(top && k === idField)) {
          const n = typeof opts.count === "number" ? opts.count : 30;
          return /^parent_?id$/i.test(k) && top ? { $nullable: { $int: [1, n] }, rate: 0.5 } : { $int: [1, n] };
        }
        if (isCategory && top && /^(name|title|label)$/i.test(k) && (x === "text.sentence" || x === "text.word" || x === "product.name")) return "commerce.category";
        if (x && typeof x === "object" && !Array.isArray(x)) {
          const ox = x as Record<string, JsonGen>;
          for (const w of ["$nullable", "$optional", "$unique", "$truncate", "$clamp"]) if (w in ox) return { ...ox, [w]: replaced(ox[w]) };
          if ("$array" in ox) return { ...ox, of: ox.of && typeof ox.of === "object" && !Array.isArray(ox.of) && !Object.keys(ox.of).some((y) => y.startsWith("$")) ? (walk(ox.of as Record<string, JsonGen>, false, full + "[]"), ox.of) : replaced(ox.of) };
          if (!Object.keys(ox).some((y) => y.startsWith("$"))) { walk(ox, false, full); return ox; }
        }
        return x;
      };
      o[k] = replaced(g);
    }
  };
  walk(fields, true, "");
}

// ---------------------------------------------------------------- compile
export function isOpenAPI(x: unknown): x is Obj { return isObj(x) && (typeof x.openapi === "string" || typeof x.swagger === "string") && isObj(x.paths); }

export function compileOpenAPI(doc: unknown, opts: CompileOptions = {}): MockSpec {
  if (!isOpenAPI(doc)) throw new Error("farsi-mock: expected an OpenAPI 3.x or Swagger 2 document (JSON; convert YAML first)");
  const basePath = (opts.basePath ?? (doc.swagger ? doc.basePath ?? "" : String(doc.servers?.[0]?.url ?? "").replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/\{[^}]+\}/g, ""))).replace(/\/+$/, "");
  const ops: Op[] = [];
  for (const [path, item] of Object.entries(doc.paths as Obj)) {
    if (!isObj(item)) continue;
    for (const m of METHODS) {
      const op = item[m.toLowerCase()];
      if (!isObj(op)) continue;
      ops.push({ method: m, path, op, params: [...(item.parameters ?? []), ...(op.parameters ?? [])] });
    }
  }
  const lastIsParam = (p: string) => /\/\{[^}]+\}$/.test(p);
  const basePathOf = (p: string) => (lastIsParam(p) ? p.replace(/\/\{[^}]+\}$/, "") : p);
  const lastStatic = (p: string) => p.split("/").filter((s) => s && !s.startsWith("{")).pop() ?? "root";

  // resources: name -> { view field specs }
  const res = new Map<string, { specs: FieldSpec[]; byKey: Map<string, FieldSpec> }>();
  const baseToRes = new Map<string, string>();
  const known = new Set<string>();
  const addView = (name: string, d: Deref): { pick: string[]; conflicts: FieldSpec[] } => {
    const spec = jsonField(name, d.node, doc, 0, new Set());
    let r = res.get(name);
    if (!r) res.set(name, (r = { specs: [], byKey: new Map() }));
    const conflicts: FieldSpec[] = [];
    for (const f of spec.fields ?? []) {
      const prev = r.byKey.get(f.name);
      if (!prev) { r.byKey.set(f.name, f); r.specs.push(f); }
      else if (prev.type !== f.type || (prev.type === "array" && prev.items?.type !== f.items?.type)) conflicts.push(f);
    }
    return { pick: (spec.fields ?? []).map((f) => f.name), conflicts };
  };
  const resourceFor = (o: Op, item: Deref): string => {
    const base = basePathOf(o.path);
    const byBase = baseToRes.get(base);
    if (byBase) return byBase;
    const name = item.ref ?? pascal(singular(lastStatic(base)));
    baseToRes.set(base, name);
    known.add(name);
    if (item.ref) known.add(item.ref);
    return name;
  };

  interface Pending { o: Op; kind: RouteKind; status: number; schema?: Obj; target?: string[]; item?: Deref; resource?: string }
  const pending: Pending[] = [];
  // pass 1: lists define resources
  for (const o of ops) {
    const { status, schema } = successResponse(doc, o.op);
    const d = schema ? deref(doc, schema) : undefined;
    if (o.method === "GET" && !lastIsParam(o.path) && d) {
      const target = findList(doc, d);
      if (target) {
        let cur = d;
        for (const k of target) cur = deref(doc, cur.node.properties[k]);
        const item = arrayOfObjects(doc, cur)!;
        pending.push({ o, kind: "list", status, schema, target, item, resource: resourceFor(o, item) });
        continue;
      }
    }
    pending.push({ o, kind: "other", status, schema });
  }
  // pass 2: details and mutations
  for (const p of pending) {
    if (p.kind === "list") continue;
    const { o } = p;
    const base = basePathOf(o.path);
    const kind: RouteKind = o.method === "GET" ? (lastIsParam(o.path) ? "detail" : "other") : o.method === "POST" ? (lastIsParam(o.path) ? "other" : "create") : o.method === "DELETE" ? "delete" : "update";
    if ((kind === "update" || kind === "delete") && !lastIsParam(o.path)) continue;
    const d = p.schema ? deref(doc, p.schema) : undefined;
    const target = d ? findRecord(doc, d, known) : undefined;
    let item: Deref | undefined;
    if (d && target) { item = d; for (const k of target) item = deref(doc, item.node.properties[k]); }
    if (kind === "other") {
      // GET /me, GET /stats: a record only if it is a known resource
      if (item?.ref && known.has(item.ref)) { p.kind = "detail"; p.target = target; p.item = item; p.resource = item.ref; }
      continue;
    }
    // create/update/delete only belong to a resource that a list/detail route (or a shared schema) defines;
    // POST /auth/login or PUT /settings stay plain endpoints
    const resource = baseToRes.get(base) ?? (item?.ref && known.has(item.ref) ? item.ref : undefined) ?? (kind === "detail" && item ? item.ref ?? pascal(singular(lastStatic(base))) : undefined);
    if (!resource) { p.kind = "other"; continue; }
    if (!baseToRes.has(base)) baseToRes.set(base, resource);
    known.add(resource);
    p.kind = kind; p.target = target; p.item = item && isObjectSchema(item) ? item : undefined; p.resource = resource;
  }

  // views + resources
  const views = new Map<Pending, { pick: string[]; conflicts: FieldSpec[] }>();
  for (const p of pending) if (p.resource && p.item) views.set(p, addView(p.resource, p.item));
  for (const p of pending) if (p.resource && !res.has(p.resource)) res.set(p.resource, { specs: [{ name: "id", type: "integer", id: true }], byKey: new Map() });

  const ov = opts.overrides;
  const models: ModelSpec[] = [...res.entries()].map(([name, r]) => ({ name, fields: r.specs }));
  const { models: mapped } = mapModels(models, { overrides: ov, nullRate: opts.nullRate ?? 0.1 });
  const resources: Record<string, MockResource> = {};
  for (const m of mapped) {
    const specs = res.get(m.name)!.specs;
    const idSpec = specs.find((f) => f.id) ?? specs.find((f) => /^(id|_id)$/.test(f.name)) ?? specs.find((f) => norm(f.name) === norm(m.name) + "id") ?? specs.find((f) => /^(uuid|guid|key|slug|code)$/i.test(f.name));
    let idField = idSpec?.name;
    const fields = { ...m.fields };
    if (!idField) { idField = "id"; fields.id = "id.index"; }
    const g = fields[idField];
    const idType: MockResource["idType"] = g === "id.index" || idSpec?.type === "integer" || idSpec?.type === "number" ? "int" : g === "id.objectId" || idSpec?.type === "objectId" ? "objectId" : g === "id.uuid" || idSpec?.format === "uuid" ? "uuid" : "string";
    if (idType === "int") fields[idField] = "id.index";
    polish(m.name, fields, idField, opts, ov);
    const count = typeof opts.count === "number" ? opts.count : opts.count?.[m.name] ?? 30;
    resources[m.name] = { fields, idField, idType, count };
  }

  const routes: MockRoute[] = [];
  for (const p of pending) {
    const { o } = p;
    const route: MockRoute = { method: o.method, path: o.path, kind: p.kind, status: p.status };
    if (o.op.operationId) route.operationId = String(o.op.operationId);
    const d = p.schema ? deref(doc, p.schema) : undefined;
    const modelName = o.op.operationId ? pascal(String(o.op.operationId)) : "Envelope";
    if (p.resource) {
      route.resource = p.resource;
      const r = resources[p.resource];
      const v = views.get(p);
      const fieldNames = Object.keys(r.fields);
      const pick = v && v.pick.length !== fieldNames.length ? v.pick : undefined;
      // path params -> fields
      const names = [...o.path.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
      if (names.length) {
        route.params = {};
        const segs = o.path.split("/");
        names.forEach((n, i) => {
          const isLast = i === names.length - 1 && lastIsParam(o.path) && p.kind !== "list";
          const before = segs[segs.indexOf(`{${n}}`) - 1] ?? "";
          const byName = fieldNames.find((f) => norm(f) === norm(n));
          if (isLast) route.params![n] = byName && !/^(id)$/i.test(n) && norm(n) !== norm(p.resource!) + "id" ? byName : r.idField;
          else route.params![n] = byName ?? fieldNames.find((f) => norm(f) === norm(singular(before)) + "id") ?? "~";
        });
      }
      let payload: Shape | undefined = p.kind === "list" ? { t: "items", resource: p.resource, ...(pick ? { pick } : {}) } : p.item ? { t: "record", resource: p.resource, ...(pick ? { pick } : {}) } : undefined;
      if (payload && v?.conflicts.length) {
        const { models: cm } = mapModels([{ name: p.resource, fields: v.conflicts }], { overrides: ov });
        (payload as Extract<Shape, { t: "items" | "record" }>).view = cm[0].fields;
      }
      if (d && payload) route.response = envShape(doc, d, p.target ?? [], payload, "success", modelName, ov);
      else if (d) route.response = envShape(doc, d, undefined, undefined, "success", modelName, ov);
      if (p.kind === "list") route.query = queryRoles(doc, o.params, fieldNames);
    } else if (d) {
      const whole = ov?.[`${o.method} ${o.path}`];
      route.response = whole !== undefined ? { t: "gen", gen: whole } : envShape(doc, d, undefined, undefined, "success", modelName, ov);
    }
    if (p.status === 204) delete route.response;
    // error responses
    const errs: Record<string, Shape> = {};
    for (const [code, r] of Object.entries((o.op.responses ?? {}) as Obj)) {
      if (!(/^[45]/.test(code) || code === "default")) continue;
      const s = bodySchema(deref(doc, r).node);
      if (s) errs[code] = envShape(doc, deref(doc, s), undefined, undefined, "error", "Error", ov);
    }
    if (Object.keys(errs).length) route.errors = errs;
    routes.push(route);
  }
  // most specific paths first (static segments before params)
  routes.sort((a, b) => comparePaths(a.path, b.path));
  return { farsiMockSpec: 1, title: doc.info?.title ? String(doc.info.title) : undefined, basePath, resources, routes };
}
