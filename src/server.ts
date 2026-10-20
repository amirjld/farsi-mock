// Mock REST server on node:http. No framework, no dependencies.
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Iran } from "./iran.js";
import { Schema, type DatasetCount, type SchemaDef } from "./schema.js";
import { fromJson, generateDataset } from "./schema.js";

type Rows = Record<string, unknown>[];
export interface MockServerOptions {
  /** Ready data: { users: [...], orders: [...] }. */
  data?: Record<string, Rows>;
  /** Or generate it: resource name -> Schema / schema definition / JSON schema-file fields. */
  resources?: Record<string, Schema<any> | SchemaDef | { fields: unknown; count?: DatasetCount }>;
  /** Generator for `resources` (seeded => same data on every start). */
  iran?: Iran;
  /** Records per resource when generating (default 50). */
  count?: number;
  /** URL prefix, e.g. "/api" (default ""). */
  basePath?: string;
  /** Default page size (default 20, max 1000). */
  pageSize?: number;
  /** Send CORS headers (default true). */
  cors?: boolean;
  /** Allow POST/PUT/PATCH/DELETE on the in-memory data (default false = read-only, 405). */
  writable?: boolean;
  /** Artificial latency in ms (number or [min, max]). */
  delay?: number | [number, number];
  /** Called for every request (for logging). */
  onRequest?: (info: { method: string; url: string; status: number; ms: number }) => void;
}

export interface MockServer {
  server: Server;
  data: Record<string, Rows>;
  /** Start listening; resolves with the base URL. Port 0 picks a free port. */
  listen(port?: number, host?: string): Promise<string>;
  close(): Promise<void>;
  /** The request handler, for mounting in an existing http server or express: app.use(mock.handler). */
  handler: (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;
}

function buildData(o: MockServerOptions): Record<string, Rows> {
  if (o.data) return o.data;
  if (!o.resources) throw new Error("farsi-mock: createMockServer needs `data` or `resources`");
  if (!o.iran) throw new Error("farsi-mock: createMockServer needs `iran` to generate resources");
  const f = o.iran;
  const spec = Object.fromEntries(Object.entries(o.resources).map(([name, r]) => {
    if (r instanceof Schema) return [name, { schema: r, count: o.count ?? 50 }];
    const file = r as { fields?: unknown; count?: DatasetCount };
    if (file && typeof file === "object" && "fields" in file && file.fields && typeof file.fields === "object") return [name, { schema: new Schema(f, fromJson(f, file.fields) as SchemaDef), count: file.count ?? o.count ?? 50 }];
    return [name, { schema: new Schema(f, fromJson(f, r) as SchemaDef), count: o.count ?? 50 }];
  }));
  return generateDataset(f, spec) as Record<string, Rows>;
}

const idOf = (r: Record<string, unknown>) => (r.id ?? r._id ?? r.uuid) as unknown;
const getPath = (o: unknown, p: string) => p.split(".").reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]), o);
const RESERVED = new Set(["page", "limit", "_page", "_limit", "per_page", "pageSize", "sort", "_sort", "order", "_order", "q", "envelope", "offset", "_start", "_end", "fields"]);

export function createMockServer(opts: MockServerOptions): MockServer {
  const data = buildData(opts);
  const base = (opts.basePath ?? "").replace(/\/+$/, "");
  const pageSize = Math.min(1000, Math.max(1, opts.pageSize ?? 20));
  const cors = opts.cors !== false;
  const names = () => Object.keys(data);
  const findResource = (seg: string) => names().find((n) => n === seg) ?? names().find((n) => n.toLowerCase() === seg.toLowerCase());

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    const text = body === undefined ? "" : JSON.stringify(body, null, 2);
    res.writeHead(status, {
      ...(body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
      ...(cors ? { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Expose-Headers": "X-Total-Count,Link" } : {}),
      ...headers,
    });
    res.end(text);
  };
  const readBody = (req: IncomingMessage) => new Promise<Record<string, unknown>>((resolve, reject) => {
    let s = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => { s += c; if (s.length > 1e6) reject(new Error("body too large")); });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error("invalid JSON body")); } });
    req.on("error", reject);
  });

  const handle = async (req: IncomingMessage, res: ServerResponse, next?: () => void): Promise<number> => {
    const url = new URL(req.url ?? "/", "http://x");
    const method = (req.method ?? "GET").toUpperCase();
    let path = decodeURIComponent(url.pathname);
    if (base) { if (path !== base && !path.startsWith(base + "/")) { if (next) { next(); return 0; } send(res, 404, { error: "Not found" }); return 404; } path = path.slice(base.length); }
    const segs = path.split("/").filter(Boolean);
    if (method === "OPTIONS") { send(res, 204, undefined); return 204; }
    if (!segs.length) {
      if (method !== "GET" && method !== "HEAD") { send(res, 405, { error: "Method not allowed" }); return 405; }
      send(res, 200, { resources: names().map((n) => ({ name: n, count: data[n].length, url: `${base}/${n}` })) });
      return 200;
    }
    const name = findResource(segs[0]);
    if (!name || segs.length > 2) { if (next) { next(); return 0; } send(res, 404, { error: `Unknown resource "${segs[0]}"`, resources: names() }); return 404; }
    const rows = data[name];
    const q = url.searchParams;

    if (segs.length === 2) {
      const idx = rows.findIndex((r) => String(idOf(r)) === segs[1]);
      if (method === "GET" || method === "HEAD") {
        if (idx < 0) { send(res, 404, { error: `${name}/${segs[1]} not found` }); return 404; }
        send(res, 200, rows[idx]); return 200;
      }
      if (!opts.writable) { send(res, 405, { error: "Read-only mock server (start with writable: true / --writable)" }); return 405; }
      if (idx < 0) { send(res, 404, { error: `${name}/${segs[1]} not found` }); return 404; }
      if (method === "DELETE") { rows.splice(idx, 1); send(res, 204, undefined); return 204; }
      if (method === "PUT" || method === "PATCH") {
        const body = await readBody(req);
        const key = "id" in rows[idx] ? "id" : "_id" in rows[idx] ? "_id" : "id";
        rows[idx] = method === "PUT" ? { ...body, [key]: idOf(rows[idx]) } : { ...rows[idx], ...body, [key]: idOf(rows[idx]) };
        send(res, 200, rows[idx]); return 200;
      }
      send(res, 405, { error: "Method not allowed" }); return 405;
    }

    if (method === "POST") {
      if (!opts.writable) { send(res, 405, { error: "Read-only mock server (start with writable: true / --writable)" }); return 405; }
      const body = await readBody(req);
      const sample = rows[0] ?? {};
      const key = "_id" in sample && !("id" in sample) ? "_id" : "id";
      if (body[key] === undefined) {
        const ids = rows.map(idOf);
        body[key] = ids.every((x) => typeof x === "number") ? Math.max(0, ...(ids as number[])) + 1 : globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      }
      rows.push(body);
      send(res, 201, body, { Location: `${base}/${name}/${body[key]}` }); return 201;
    }
    if (method !== "GET" && method !== "HEAD") { send(res, 405, { error: "Method not allowed" }); return 405; }

    // filters: ?city=تهران&address.city=..., q= full-text, sort=-price
    let list = rows;
    for (const [k, v] of q) {
      if (RESERVED.has(k)) continue;
      const [field, op] = k.split(/_(gte|lte|ne|like)$/);
      list = list.filter((r) => {
        const val = getPath(r, field);
        if (op === "gte") return Number(val) >= Number(v);
        if (op === "lte") return Number(val) <= Number(v);
        if (op === "ne") return String(val) !== v;
        if (op === "like") return String(val ?? "").toLowerCase().includes(v.toLowerCase());
        return String(val) === v;
      });
    }
    const term = q.get("q");
    if (term) list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(term.toLowerCase()));
    const sort = q.get("sort") ?? q.get("_sort");
    if (sort) {
      const keys = sort.split(",").map((s) => (s.startsWith("-") ? [s.slice(1), -1] : [s, (q.get("order") ?? q.get("_order")) === "desc" ? -1 : 1]) as [string, number]);
      list = [...list].sort((a, b) => {
        for (const [k, dir] of keys) {
          const x = getPath(a, k), y = getPath(b, k);
          if (x === y) continue;
          if (x === undefined || x === null) return 1;
          if (y === undefined || y === null) return -1;
          return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fa")) * dir;
        }
        return 0;
      });
    }
    const total = list.length;
    const limit = Math.min(1000, Math.max(1, Number(q.get("limit") ?? q.get("_limit") ?? q.get("per_page") ?? q.get("pageSize") ?? pageSize) || pageSize));
    const page = Math.max(1, Number(q.get("page") ?? q.get("_page") ?? 1) || 1);
    const start = q.has("offset") ? Math.max(0, Number(q.get("offset")) || 0) : (page - 1) * limit;
    const items = list.slice(start, start + limit);
    const pages = Math.max(1, Math.ceil(total / limit));
    const link = [page < pages ? `<${base}/${name}?page=${page + 1}&limit=${limit}>; rel="next"` : "", page > 1 ? `<${base}/${name}?page=${page - 1}&limit=${limit}>; rel="prev"` : ""].filter(Boolean).join(", ");
    const headers: Record<string, string> = { "X-Total-Count": String(total), ...(link ? { Link: link } : {}) };
    if (q.get("envelope") === "false" || q.has("_page") || q.has("_limit")) send(res, 200, items, headers);
    else send(res, 200, { data: items, meta: { page, limit, total, pages } }, headers);
    return 200;
  };

  const handler = (req: IncomingMessage, res: ServerResponse, next?: () => void) => {
    const t0 = Date.now();
    const d = opts.delay;
    const wait = d === undefined ? 0 : typeof d === "number" ? d : d[0] + Math.random() * (d[1] - d[0]);
    const run = () => handle(req, res, next)
      .then((status) => { if (status) opts.onRequest?.({ method: req.method ?? "GET", url: req.url ?? "/", status, ms: Date.now() - t0 }); })
      .catch((e: Error) => { send(res, 400, { error: e.message }); opts.onRequest?.({ method: req.method ?? "GET", url: req.url ?? "/", status: 400, ms: Date.now() - t0 }); });
    if (wait > 0) setTimeout(run, wait); else void run();
  };
  const server = createServer((req, res) => handler(req, res));
  return {
    server, data, handler,
    listen: (port = 3000, host = "127.0.0.1") => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        const a = server.address();
        const p = typeof a === "object" && a ? a.port : port;
        resolve(`http://${host.includes(":") ? `[${host}]` : host}:${p}${base}`);
      });
    }),
    close: () => new Promise((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
      // Node 18 keeps idle keep-alive sockets open, which would delay close()
      server.closeAllConnections?.();
    }),
  };
}
