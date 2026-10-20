import { ALIASES, NOISE, tokenize, modelKind, type Alias, type ModelKind, type Produces } from "./aliases.js";
import type { FieldSpec, FieldType, ModelSpec } from "./spec.js";
import { singular } from "./parsers.js";

export type JsonGen = string | number | boolean | null | { [k: string]: unknown } | JsonGen[];

export interface FieldReport {
  model: string;
  /** Dotted field path inside the model, e.g. "address.city" or "items[].price". */
  field: string;
  type: FieldType;
  generator: JsonGen;
  /** 0..1: 0.95 exact alias, ~0.8 partial alias, 0.5-0.7 type/format fallback, below 0.4 a guess. */
  confidence: number;
  reason: string;
}

export interface MapOptions {
  /** Field overrides: "field", "Model.field" or "Model.nested.field" -> generator (path string or JSON generator). */
  overrides?: Record<string, JsonGen>;
  /** Probability of null for nullable fields (default 0 = always filled). */
  nullRate?: number;
  /** Probability that optional fields are left out (default 0). */
  optionalRate?: number;
  /** Names of models generated together (for ref:Model.field). */
  models?: string[];
}

interface Ctx { model: string; kind: ModelKind; opts: MapOptions; report: FieldReport[]; models: Map<string, string> }

const COMPAT: Record<Produces, FieldType[]> = {
  string: ["string", "unknown"],
  number: ["number", "integer", "unknown"],
  boolean: ["boolean", "unknown"],
  date: ["date", "datetime", "string", "unknown"],
};

const FORMAT_GEN: Record<string, [JsonGen, string, number]> = {
  "ir-mobile": ["contact.mobile", "value looks like an Iranian mobile", 0.9],
  "ir-landline": ["contact.landline", "value looks like an Iranian landline", 0.9],
  "ir-national-id": ["person.nationalId", "value passes the national ID checksum", 0.9],
  "ir-sheba": ["bank.sheba", "value looks like a Sheba/IBAN", 0.92],
  "ir-card": ["bank.cardNumber", "value passes Luhn (16 digits)", 0.9],
  "ir-postal": ["address.postalCode", "value looks like a postal code", 0.8],
  "ir-plate": ["vehicle.plate", "value looks like a car plate", 0.85],
  "jalali-date": ["date.recentJalali", "value looks like a Jalali date", 0.85],
  email: ["contact.email", "format email", 0.9],
  uuid: ["id.uuid", "format uuid", 0.9],
  cuid: [{ $regex: "c[a-z0-9]{24}" }, "format cuid", 0.85],
  objectid: ["id.objectId", "format ObjectId", 0.9],
  uri: ["internet.url", "format uri", 0.8],
  url: ["internet.url", "format url", 0.8],
  ipv4: ["internet.ip", "format ipv4", 0.85],
  "date-time": ["date.past", "format date-time", 0.6],
  date: [{ $dateOnly: "date.past" }, "format date", 0.6],
  time: [{ $regex: "([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" }, "format time", 0.7],
  hostname: [{ $template: "host{id.index}.example.com" }, "format hostname", 0.7],
};

const MODIFIERS = new Set(["id", "ids", "verified", "confirmed", "enabled", "disabled", "count", "status", "type", "at", "on", "flag", "visible", "hash", "token", "length", "len", "otp", "valid", "changed", "sent", "required", "public", "private"]);

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

/** Best alias for a field name. Exported for tests and for the CLI's --explain. */
export function matchAlias(name: string, kind: ModelKind = "any", type: FieldType = "unknown"): { alias: Alias; score: number; how: string } | undefined {
  const tokens = tokenize(name);
  const joined = tokens.join("");
  const stripped = tokens.filter((t) => !NOISE.has(t)).join("");
  // "emailVerified", "user_id", "phoneCount": the last word changes the meaning, so only exact matches count
  const modified = tokens.length > 1 && MODIFIERS.has(tokens[tokens.length - 1]);
  let best: { alias: Alias; score: number; how: string } | undefined;
  for (const alias of ALIASES) {
    if (alias.kind && alias.kind !== kind) continue;
    if (!COMPAT[alias.produces].includes(type)) continue;
    const bonus = alias.kind ? 0.02 : 0;
    for (const key of alias.keys) {
      let score = 0, how = "";
      if (joined === key) { score = 0.95; how = "exact"; }
      else if (stripped && stripped === key) { score = 0.88; how = "exact without prefix words"; }
      else if (modified) continue;
      else if (key.length >= 4 && joined.endsWith(key) && joined.length - key.length <= 12) { score = 0.8; how = "suffix"; }
      else if (key.length >= 3 && tokens.includes(key)) { score = 0.75; how = "word"; }
      else if (key.length >= 5 && joined.startsWith(key) && joined.length - key.length <= 8) { score = 0.7; how = "prefix"; }
      else if (key.length >= 6 && Math.abs(joined.length - key.length) <= 1 && lev(joined, key) <= 1) { score = 0.65; how = "typo"; }
      if (score && score + bonus > (best?.score ?? 0)) best = { alias, score: Math.min(0.97, score + bonus), how: `${how} match "${key}"` };
    }
  }
  return best;
}

function wrap(spec: FieldSpec, gen: JsonGen, ctx: Ctx, skipUnique = false): JsonGen {
  let g = gen;
  if (spec.maxLength !== undefined && spec.type === "string" && !(typeof g === "object" && g && ("$regex" in g || "$pick" in g))) g = { $truncate: g, max: spec.maxLength };
  if (spec.unique && !skipUnique) g = { $unique: g };
  if (spec.nullable && (ctx.opts.nullRate ?? 0) > 0) g = { $nullable: g, rate: ctx.opts.nullRate };
  else if (spec.optional && (ctx.opts.optionalRate ?? 0) > 0) g = { $optional: g, rate: ctx.opts.optionalRate };
  return g;
}

function numberFallback(spec: FieldSpec): [JsonGen, string, number] {
  const lo = spec.min ?? spec.range?.[0], hi = spec.max ?? spec.range?.[1];
  const has = lo !== undefined || hi !== undefined;
  const a = lo ?? (hi !== undefined ? Math.min(0, hi) : 0), b = hi ?? (a + 1000);
  if (spec.type === "integer") return [{ $int: [Math.ceil(a), Math.floor(b)] }, has ? "integer in range" : "integer", has ? 0.6 : 0.4];
  return [{ $float: [a, b, 2] }, has ? "number in range" : "number", has ? 0.6 : 0.4];
}

function boolGen(name: string): [JsonGen, string] {
  const t = tokenize(name).join("");
  if (/(deleted|banned|blocked|suspended|locked|archived|spam|disabled)/.test(t)) return [{ $bool: 0.05 }, "boolean (rarely true)"];
  if (/(active|verified|enabled|confirmed|approved|published|available|visible|instock)/.test(t)) return [{ $bool: 0.85 }, "boolean (mostly true)"];
  return [{ $bool: 0.5 }, "boolean"];
}

function idGen(spec: FieldSpec): [JsonGen, string] {
  if (spec.type === "objectId" || spec.format === "objectid" || spec.name === "_id") return ["id.objectId", "primary key (ObjectId)"];
  if (spec.type === "integer" || spec.type === "number") return ["id.index", "primary key (1, 2, 3, ...)"];
  if (spec.format === "cuid") return [{ $regex: "c[a-z0-9]{24}" }, "primary key (cuid)"];
  return ["id.uuid", "primary key (uuid)"];
}

function findModel(ctx: Ctx, guess: string): string | undefined {
  const g = guess.toLowerCase();
  for (const [lower, real] of ctx.models) if (lower === g || singular(lower) === g || lower === g + "s") return real;
  return undefined;
}

function mapField(spec: FieldSpec, path: string, ctx: Ctx, kind: ModelKind): JsonGen {
  const add = (gen: JsonGen, confidence: number, reason: string) => { ctx.report.push({ model: ctx.model, field: path, type: spec.type, generator: gen, confidence: Math.round(confidence * 100) / 100, reason }); return gen; };
  const ov = ctx.opts.overrides;
  const ovKey = ov && [`${ctx.model}.${path}`, path, spec.name].find((k) => k in ov);
  if (ov && ovKey) return add(ov[ovKey], 1, `override "${ovKey}"`);

  if (spec.type === "object") {
    const sub = modelKind(spec.name);
    const out: Record<string, JsonGen> = {};
    for (const f of spec.fields ?? []) out[f.name] = mapField(f, `${path}.${f.name}`, ctx, sub === "any" ? kind : sub);
    if (!spec.fields?.length) return add({ $literal: {} }, 0.3, "object without known fields");
    return wrap(spec, out, ctx);
  }
  if (spec.type === "array") {
    const item = spec.items ?? { name: singular(spec.name), type: "unknown" };
    const lo = spec.minLength ?? 1, hi = spec.maxLength ?? Math.max(lo, 3);
    const itemPath = `${path}[]`;
    const of = mapField({ ...item, name: item.name || singular(spec.name), optional: false, nullable: false }, itemPath, ctx, kind);
    return wrap(spec, { $array: [lo, Math.min(hi, lo + 5)], of }, ctx);
  }

  // primary keys
  if (spec.id || /^(id|_id|uuid|guid)$/i.test(spec.name)) { const [g, r] = idGen(spec); return add(wrap(spec, g, ctx, true), 0.95, r); }
  // explicit references
  if (spec.ref) {
    const target = findModel(ctx, spec.ref.model);
    if (target) return add(wrap(spec, `ref:${target}.${spec.ref.field ?? "id"}`, ctx, true), 0.95, `reference to ${target}`);
    const [g] = idGen({ ...spec, id: true });
    return add(wrap(spec, g, ctx), 0.6, `reference to ${spec.ref.model} (not generated here; random id)`);
  }
  if (spec.enum?.length) return add(wrap(spec, { $pick: [...spec.enum] }, ctx, true), 0.9, "enum values");
  if (spec.type === "boolean") { const [g, r] = boolGen(spec.name); return add(wrap(spec, g, ctx, true), 0.9, r); }

  const alias = matchAlias(spec.name, kind, spec.type);
  // strong format evidence (from samples or explicit formats) beats a weak alias
  const fmt = spec.format ? FORMAT_GEN[spec.format] : undefined;
  if (fmt && (spec.format!.startsWith("ir-") || spec.format === "jalali-date" || !alias || alias.score < 0.88 || ["email", "uuid", "objectid", "cuid"].includes(spec.format!))) {
    if (!(alias && alias.score >= 0.88 && fmt[0] === "date.past")) {
      return add(wrap(spec, fmt[0], ctx), Math.max(fmt[2], alias && alias.alias.gen === fmt[0] ? alias.score : 0), fmt[1]);
    }
  }
  if (alias) {
    let g = alias.alias.gen as JsonGen;
    if (alias.alias.produces === "number" && (spec.min !== undefined || spec.max !== undefined)) g = { $clamp: g, min: spec.min ?? -1e15, max: spec.max ?? 1e15 };
    if (alias.alias.produces === "date" && spec.type === "date") g = { $dateOnly: g };
    if (g === "person.birthDate" && spec.type === "datetime") g = { $dateTime: g };
    if (spec.pattern) g = { $regex: spec.pattern };
    const reason = spec.pattern ? `pattern (alias "${alias.alias.label}" overridden by the field's regex)` : `${alias.alias.label} (${alias.how})`;
    return add(wrap(spec, g, ctx), spec.pattern ? 0.75 : alias.score, reason);
  }
  // foreign-key style names: userId, user_id, authorId
  const tokens = tokenize(spec.name);
  if (tokens.length > 1 && tokens[tokens.length - 1] === "id") {
    const target = findModel(ctx, tokens.slice(0, -1).join(""));
    if (target) return add(wrap(spec, `ref:${target}.${ctx.models.get(`__id:${target}`) ?? "id"}`, ctx, true), 0.85, `foreign key to ${target} (by name)`);
    const [g] = idGen({ ...spec, name: "id" });
    return add(wrap(spec, g, ctx), 0.55, "looks like a foreign key; random id");
  }
  if (spec.pattern) return add(wrap(spec, { $regex: spec.pattern }, ctx), 0.7, "regex pattern");
  if (spec.type === "datetime" || spec.type === "date") return add(wrap(spec, spec.type === "date" ? { $dateOnly: "date.past" } : "date.past", ctx), 0.55, `${spec.type} type`);
  if (spec.type === "objectId") return add(wrap(spec, "id.objectId", ctx), 0.6, "ObjectId type");
  if (spec.type === "integer" || spec.type === "number") { const [g, r, c] = numberFallback(spec); return add(wrap(spec, g, ctx), c, r); }
  if (spec.type === "string") {
    const short = (spec.maxLength ?? 100) <= 30;
    return add(wrap(spec, short ? "text.word" : "text.sentence", ctx), 0.25, "plain string (no hint)");
  }
  return add(wrap(spec, "text.word", ctx), 0.1, "unknown type");
}

export interface MappedModel { name: string; fields: Record<string, JsonGen> }

/** Map parsed models to generator definitions plus a per-field report. */
export function mapModels(models: ModelSpec[], opts: MapOptions = {}): { models: MappedModel[]; report: FieldReport[] } {
  const names = new Map<string, string>();
  for (const m of models) {
    names.set(m.name.toLowerCase(), m.name);
    const id = m.fields.find((f) => f.id) ?? m.fields.find((f) => /^(id|_id)$/.test(f.name));
    if (id) names.set(`__id:${m.name}`, id.name);
  }
  for (const n of opts.models ?? []) names.set(n.toLowerCase(), n);
  const report: FieldReport[] = [];
  const out = models.map((m) => {
    const ctx: Ctx = { model: m.name, kind: modelKind(m.name), opts, report, models: names };
    const fields: Record<string, JsonGen> = {};
    for (const f of m.fields) fields[f.name] = mapField(f, f.name, ctx, ctx.kind);
    return { name: m.name, fields };
  });
  // fix ref fields when the referenced model's key is not "id" (e.g. Mongo _id)
  for (const r of report) {
    if (typeof r.generator === "string" && r.generator.startsWith("ref:")) {
      const [model, field] = r.generator.slice(4).split(".");
      if (field === "id" && names.get(`__id:${model}`) === "_id") r.generator = `ref:${model}._id`;
    }
  }
  const fixRefs = (g: JsonGen): JsonGen => {
    if (typeof g === "string" && g.startsWith("ref:")) { const [model, field] = g.slice(4).split("."); return field === "id" && names.get(`__id:${model}`) === "_id" ? `ref:${model}._id` : g; }
    if (Array.isArray(g)) return g.map(fixRefs);
    if (g && typeof g === "object") return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, fixRefs(v as JsonGen)]));
    return g;
  };
  for (const m of out) m.fields = fixRefs(m.fields) as Record<string, JsonGen>;
  return { models: out, report };
}
