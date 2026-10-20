export type Format = "json" | "jsonl" | "csv" | "sql" | "mongo" | "ts";
export interface CsvOptions { delimiter?: string; bom?: boolean; eol?: "\r\n" | "\n"; columns?: string[] }

/** Flatten nested objects to dot keys; arrays become JSON strings. */
export function flatten(record: Record<string, unknown>, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(record)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) flatten(v as Record<string, unknown>, key, out);
    else out[key] = v;
  }
  return out;
}

function cell(v: unknown, delimiter: string): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  return s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter) || /^\s|\s$/.test(s)
    ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV. Nested fields become dot-named columns (address.city). */
export function toCsv(records: Record<string, unknown>[], opts: CsvOptions = {}): string {
  const { delimiter = ",", bom = false, eol = "\r\n" } = opts;
  const rows = records.map((r) => flatten(r));
  const columns = opts.columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [columns.map((c) => cell(c, delimiter)).join(delimiter), ...rows.map((r) => columns.map((c) => cell(r[c], delimiter)).join(delimiter))];
  return (bom ? "\uFEFF" : "") + lines.join(eol) + eol;
}

export function toJsonl(records: unknown[]): string { return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""); }
export function toJson(records: unknown, pretty = true): string { return JSON.stringify(records, null, pretty ? 2 : 0) + "\n"; }

export function format(records: Record<string, unknown>[], fmt: Format, opts: CsvOptions & { pretty?: boolean } & SqlOptions & MongoJsonOptions & TsOptions = {}): string {
  if (fmt === "csv") return toCsv(records, opts);
  if (fmt === "sql") return toSql(records, opts);
  if (fmt === "mongo") return toMongoJson(records, opts);
  if (fmt === "ts") return toTs(records, opts);
  if (fmt === "jsonl") return toJsonl(records);
  return toJson(records, opts.pretty ?? true);
}

// ---------------------------------------------------------------- SQL
export type SqlDialect = "postgres" | "mysql" | "sqlite";
export interface SqlOptions {
  dialect?: SqlDialect;
  /** Table name (single record list). Datasets use the entity names. */
  table?: string;
  /** Rows per INSERT statement (default 500). */
  batchSize?: number;
  /** Also emit CREATE TABLE IF NOT EXISTS with types guessed from the values. */
  createTable?: boolean;
  /** Skip rows that hit a unique constraint (ON CONFLICT DO NOTHING / INSERT IGNORE / INSERT OR IGNORE). */
  ignoreConflicts?: boolean;
  /** Wrap everything in a transaction (default true). */
  transaction?: boolean;
  /** Nested objects: "json" (default) stores them as JSON text, "flatten" makes address_city style columns. */
  nested?: "json" | "flatten";
}
type Rows = Record<string, unknown>[];
const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function qid(name: string, d: SqlDialect): string { return d === "mysql" ? "`" + name.replace(/`/g, "``") + "`" : '"' + name.replace(/"/g, '""') + '"'; }
function sqlValue(v: unknown, d: SqlDialect): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return d === "postgres" ? (v ? "TRUE" : "FALSE") : v ? "1" : "0";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  const esc = s.replace(/'/g, "''").replace(/\u0000/g, "");
  return `'${d === "mysql" ? esc.replace(/\\/g, "\\\\") : esc}'`;
}
function sqlType(values: unknown[], col: string, d: SqlDialect): string {
  const vs = values.filter((v) => v !== null && v !== undefined);
  const pk = /^(id|_id)$/i.test(col) ? " PRIMARY KEY" : "";
  if (!vs.length) return "TEXT";
  if (vs.every((v) => typeof v === "boolean")) return d === "postgres" ? "BOOLEAN" : d === "mysql" ? "TINYINT(1)" : "INTEGER";
  if (vs.every((v) => typeof v === "number" && Number.isInteger(v))) {
    const big = vs.some((v) => Math.abs(v as number) > 2147483647);
    return (d === "sqlite" ? "INTEGER" : big ? "BIGINT" : "INTEGER") + pk;
  }
  if (vs.every((v) => typeof v === "number")) return d === "postgres" ? "DOUBLE PRECISION" : d === "mysql" ? "DOUBLE" : "REAL";
  if (vs.every((v) => v instanceof Date || (typeof v === "string" && ISO_DT.test(v)))) return d === "postgres" ? "TIMESTAMPTZ" : d === "mysql" ? "DATETIME(3)" : "TEXT";
  if (vs.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) return d === "sqlite" ? "TEXT" : "DATE";
  if (vs.some((v) => typeof v === "object" && !(v instanceof Date))) return d === "postgres" ? "JSONB" : d === "mysql" ? "JSON" : "TEXT";
  if (d === "mysql") { const max = Math.max(...vs.map((v) => String(v).length)); return (max <= 191 ? "VARCHAR(255)" : "TEXT") + pk; }
  return "TEXT" + pk;
}
function sqlCell(v: unknown, d: SqlDialect): unknown {
  // MySQL DATETIME does not accept the trailing Z / offset
  if (d === "mysql" && typeof v === "string" && ISO_DT.test(v)) return new Date(v).toISOString().replace("T", " ").replace("Z", "");
  return v;
}

function tableSql(table: string, records: Rows, o: SqlOptions): string {
  const d = o.dialect ?? "postgres";
  const rows = o.nested === "flatten" ? records.map((r) => Object.fromEntries(Object.entries(flatten(r)).map(([k, v]) => [k.replace(/\./g, "_"), v]))) : records;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const out: string[] = [];
  if (o.createTable) out.push(`CREATE TABLE IF NOT EXISTS ${qid(table, d)} (\n${cols.map((c) => `  ${qid(c, d)} ${sqlType(rows.map((r) => r[c]), c, d)}`).join(",\n")}\n);`);
  if (!rows.length || !cols.length) return out.join("\n");
  const size = Math.max(1, o.batchSize ?? 500);
  const head = d === "mysql" && o.ignoreConflicts ? "INSERT IGNORE INTO" : d === "sqlite" && o.ignoreConflicts ? "INSERT OR IGNORE INTO" : "INSERT INTO";
  const tail = d === "postgres" && o.ignoreConflicts ? " ON CONFLICT DO NOTHING" : "";
  for (let i = 0; i < rows.length; i += size) {
    const values = rows.slice(i, i + size).map((r) => `(${cols.map((c) => sqlValue(sqlCell(r[c], d), d)).join(", ")})`);
    out.push(`${head} ${qid(table, d)} (${cols.map((c) => qid(c, d)).join(", ")}) VALUES\n  ${values.join(",\n  ")}${tail};`);
  }
  return out.join("\n");
}

/** SQL INSERT statements for records (`table` option) or a dataset ({ users: [...], orders: [...] }, inserted in order). */
export function toSql(data: Rows | Record<string, Rows>, opts: SqlOptions = {}): string {
  const d = opts.dialect ?? "postgres";
  if (!["postgres", "mysql", "sqlite"].includes(d)) throw new Error(`farsi-mock: unknown SQL dialect "${d}" (postgres | mysql | sqlite)`);
  const tables: [string, Rows][] = Array.isArray(data) ? [[opts.table ?? "records", data]] : Object.entries(data);
  const body = tables.map(([t, rows]) => tableSql(t, rows, opts)).filter(Boolean).join("\n\n");
  if (opts.transaction === false) return body + "\n";
  const begin = d === "mysql" ? "START TRANSACTION;" : "BEGIN;";
  return `${begin}\n${body}\nCOMMIT;\n`;
}

// ---------------------------------------------------------------- MongoDB Extended JSON
export interface MongoJsonOptions {
  /** "relaxed" (default, mongoimport friendly) or "canonical" ({ $numberInt }, { $date: { $numberLong } }). */
  mode?: "relaxed" | "canonical";
  /** Fields whose 24-hex values become { $oid }. Default: _id and fields ending in Id / _id / Ids. */
  objectIdFields?: (key: string) => boolean;
  /** ISO date-time strings become { $date } (default true). */
  dates?: boolean;
  /** "array" (default, use mongoimport --jsonArray) or "lines" (one document per line). */
  layout?: "array" | "lines";
}
const HEX24 = /^[0-9a-f]{24}$/i;
const defaultOidField = (k: string) => k === "_id" || /(Id|_id|Ids|_ids)$/.test(k);

/** Convert one value to MongoDB Extended JSON (as a plain object). */
export function toExtendedJson(value: unknown, opts: MongoJsonOptions = {}, key = ""): unknown {
  const canonical = opts.mode === "canonical";
  const isOid = opts.objectIdFields ?? defaultOidField;
  if (value instanceof Date) return canonical ? { $date: { $numberLong: String(value.getTime()) } } : { $date: value.toISOString() };
  if (typeof value === "string") {
    if (HEX24.test(value) && isOid(key)) return { $oid: value.toLowerCase() };
    if (opts.dates !== false && ISO_DT.test(value)) return toExtendedJson(new Date(value), opts, key);
    return value;
  }
  if (typeof value === "number" && canonical) {
    if (Number.isInteger(value)) return Math.abs(value) <= 2147483647 ? { $numberInt: String(value) } : { $numberLong: String(value) };
    return { $numberDouble: String(value) };
  }
  if (Array.isArray(value)) return value.map((v) => toExtendedJson(v, opts, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toExtendedJson(v, opts, k)]));
  return value;
}

/** MongoDB Extended JSON text for mongoimport / mongosh (ObjectIds as $oid, dates as $date). */
export function toMongoJson(records: Rows, opts: MongoJsonOptions = {}): string {
  const docs = records.map((r) => toExtendedJson(r, opts));
  if (opts.layout === "lines") return docs.map((x) => JSON.stringify(x)).join("\n") + (docs.length ? "\n" : "");
  return JSON.stringify(docs, null, 2) + "\n";
}

// ---------------------------------------------------------------- TypeScript fixtures
export interface TsOptions {
  /** Export name for a record list (default "records"). Datasets use the entity names. */
  name?: string;
  /** Generate interfaces from the values (default true). */
  types?: boolean;
  /** Use `as const` instead of interfaces. */
  asConst?: boolean;
}
const IDENT = /^[A-Za-z_$][\w$]*$/;
const pascal = (s: string) => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c: string) => c.toUpperCase());
const camel = (s: string) => { const p = pascal(s); return p ? p[0].toLowerCase() + p.slice(1) : "records"; };
const singularize = (s: string) => (/ies$/.test(s) ? s.slice(0, -3) + "y" : /(ss|us)$/.test(s) ? s : /s$/.test(s) ? s.slice(0, -1) : s);
const propKey = (k: string) => (IDENT.test(k) ? k : JSON.stringify(k));

function tsTypeOf(values: unknown[], indent: string): string {
  const parts = new Set<string>();
  const objs: Record<string, unknown>[] = [], arrs: unknown[][] = [];
  for (const v of values) {
    if (v === undefined) continue;
    if (v === null) parts.add("null");
    else if (Array.isArray(v)) arrs.push(v);
    else if (v instanceof Date) parts.add("Date");
    else if (typeof v === "object") objs.push(v as Record<string, unknown>);
    else parts.add(typeof v);
  }
  if (objs.length) parts.add(tsObjectType(objs, indent));
  if (arrs.length) { const inner = tsTypeOf(arrs.flat(), indent); parts.add(inner.includes("|") ? `(${inner})[]` : `${inner}[]`); }
  return parts.size ? [...parts].join(" | ") : "unknown";
}
function tsObjectType(objs: Record<string, unknown>[], indent: string): string {
  const keys: string[] = [];
  for (const o of objs) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
  const inner = indent + "  ";
  const lines = keys.map((k) => `${inner}${propKey(k)}${objs.every((o) => k in o) ? "" : "?"}: ${tsTypeOf(objs.map((o) => o[k]), inner)};`);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** A TypeScript module exporting the records (and interfaces inferred from them). */
export function toTs(data: Rows | Record<string, Rows>, opts: TsOptions = {}): string {
  const sets: [string, Rows][] = Array.isArray(data) ? [[opts.name ?? "records", data]] : Object.entries(data);
  const out = ["// Generated by farsi-mock. Synthetic test data, not real people.", ""];
  for (const [name, rows] of sets) {
    const constName = camel(name);
    const json = JSON.stringify(rows, (_k, v) => v, 2);
    if (opts.asConst) out.push(`export const ${constName} = ${json} as const;`, "");
    else if (opts.types === false) out.push(`export const ${constName} = ${json};`, "");
    else {
      const typeName = pascal(singularize(name)) || "Record";
      out.push(`export interface ${typeName} ${tsObjectType(rows.length ? rows : [{}], "")}`, "", `export const ${constName}: ${typeName}[] = ${json};`, "");
    }
  }
  return out.join("\n");
}
