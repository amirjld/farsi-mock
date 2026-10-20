export type Format = "json" | "jsonl" | "csv";
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

export function format(records: Record<string, unknown>[], fmt: Format, opts: CsvOptions & { pretty?: boolean } = {}): string {
  if (fmt === "csv") return toCsv(records, opts);
  if (fmt === "jsonl") return toJsonl(records);
  return toJson(records, opts.pretty ?? true);
}
