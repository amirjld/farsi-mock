import type { FieldSpec, FieldType, ModelSpec } from "./spec.js";

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------- JSON Schema / OpenAPI
const STR_FORMAT_TYPE: Record<string, FieldType> = { "date-time": "datetime", date: "date" };

function resolveRef(root: Obj, ref: string): Obj | undefined {
  if (!ref.startsWith("#/")) return undefined;
  return ref.slice(2).split("/").reduce<any>((o, k) => (o == null ? undefined : o[k.replace(/~1/g, "/").replace(/~0/g, "~")]), root);
}

function jsonField(name: string, node: Obj, root: Obj, depth: number, seen: Set<string>): FieldSpec {
  if (!isObj(node)) return { name, type: "unknown" };
  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref) || depth > 6) return { name, type: "object", fields: [] };
    const target = resolveRef(root, node.$ref);
    if (!target) return { name, type: "unknown" };
    const next = new Set(seen); next.add(node.$ref);
    return { ...jsonField(name, target, root, depth + 1, next), name };
  }
  if (Array.isArray(node.allOf)) {
    const parts = node.allOf.map((p: Obj) => jsonField(name, p, root, depth + 1, seen));
    const fields = parts.flatMap((p: FieldSpec) => p.fields ?? []);
    return { ...Object.assign({}, ...parts), name, ...(fields.length ? { type: "object", fields } : {}) };
  }
  for (const k of ["oneOf", "anyOf"]) {
    if (Array.isArray(node[k])) {
      const opts = node[k] as Obj[];
      const nonNull = opts.filter((o) => o.type !== "null");
      const f = jsonField(name, nonNull[0] ?? {}, root, depth + 1, seen);
      return { ...f, nullable: f.nullable || nonNull.length < opts.length };
    }
  }
  let type = node.type;
  let nullable = node.nullable === true || node["x-nullable"] === true;
  if (Array.isArray(type)) { nullable ||= type.includes("null"); type = type.find((t: string) => t !== "null"); }
  const spec: FieldSpec = { name, type: "unknown" };
  if (nullable) spec.nullable = true;
  if (node.enum) { spec.enum = (node.enum as unknown[]).filter((v) => v !== null) as unknown as FieldSpec["enum"]; }
  if (node.const !== undefined) spec.enum = [node.const];
  if (typeof node.format === "string") spec.format = node.format;
  if (typeof node.pattern === "string") spec.pattern = node.pattern;
  if (typeof node.minLength === "number") spec.minLength = node.minLength;
  if (typeof node.maxLength === "number") spec.maxLength = node.maxLength;
  if (typeof node.minimum === "number") spec.min = node.minimum;
  if (typeof node.maximum === "number") spec.max = node.maximum;
  if (typeof node.exclusiveMinimum === "number") spec.min = node.exclusiveMinimum + (type === "integer" ? 1 : 1e-9);
  if (typeof node.exclusiveMaximum === "number") spec.max = node.exclusiveMaximum - (type === "integer" ? 1 : 1e-9);
  if (node.example !== undefined) spec.example = node.example;
  else if (Array.isArray(node.examples) && node.examples.length) spec.example = node.examples[0];
  if (!type) type = node.properties ? "object" : node.items ? "array" : spec.enum ? typeof spec.enum[0] : undefined;
  switch (type) {
    case "string": spec.type = STR_FORMAT_TYPE[spec.format ?? ""] ?? "string"; break;
    case "integer": spec.type = "integer"; break;
    case "number": spec.type = "number"; break;
    case "boolean": spec.type = "boolean"; break;
    case "array":
      spec.type = "array";
      spec.items = jsonField(singular(name), node.items ?? {}, root, depth + 1, seen);
      if (typeof node.minItems === "number") spec.minLength = node.minItems;
      if (typeof node.maxItems === "number") spec.maxLength = node.maxItems;
      break;
    case "object": {
      spec.type = "object";
      const req = new Set<string>(Array.isArray(node.required) ? node.required : []);
      spec.fields = Object.entries((node.properties ?? {}) as Obj).map(([k, v]) => ({ ...jsonField(k, v, root, depth + 1, seen), ...(req.has(k) ? {} : { optional: true }) }));
      break;
    }
  }
  if (node.readOnly && /^(id|_id)$/i.test(name)) spec.id = true;
  return spec;
}

/** JSON Schema (draft 4-2020-12). A schema with `properties` is one model; one with only $defs/definitions gives a model per definition. */
export function parseJsonSchema(json: unknown, opts: { name?: string; model?: string | string[] } = {}): ModelSpec[] {
  if (!isObj(json)) throw new Error("farsi-mock: JSON Schema must be an object");
  if (json.properties || json.allOf || json.$ref) {
    const f = jsonField(opts.name ?? json.title ?? "Model", json, json, 0, new Set());
    return [{ name: String(opts.name ?? json.title ?? "Model"), fields: f.fields ?? [] }];
  }
  const defs = (json.$defs ?? json.definitions ?? {}) as Obj;
  return pickModels(Object.keys(defs).map((k) => ({ name: k, fields: jsonField(k, defs[k], json, 0, new Set([`#/$defs/${k}`, `#/definitions/${k}`])).fields ?? [] })), opts.model);
}

/** OpenAPI 3.x (components.schemas) or Swagger 2 (definitions). Object schemas become models; $refs between them are expanded as nested objects. */
export function parseOpenAPI(doc: unknown, opts: { model?: string | string[] } = {}): ModelSpec[] {
  if (!isObj(doc)) throw new Error("farsi-mock: OpenAPI document must be an object (parse YAML first)");
  const schemas = (doc.components?.schemas ?? doc.definitions ?? {}) as Obj;
  const base = doc.components?.schemas ? "#/components/schemas/" : "#/definitions/";
  const models = Object.entries(schemas)
    .filter(([, s]) => isObj(s) && (s.type === "object" || s.properties || s.allOf))
    .map(([k, s]) => ({ name: k, fields: jsonField(k, s, doc, 0, new Set([base + k])).fields ?? [] }));
  if (!models.length) throw new Error("farsi-mock: no object schemas found in components.schemas / definitions");
  // link "userId"-style fields to models named in x-ref / description is not standard; keep simple.
  return pickModels(models, opts.model);
}

function pickModels(models: ModelSpec[], want?: string | string[]): ModelSpec[] {
  if (!want) return models;
  const list = (Array.isArray(want) ? want : want.split(",")).map((s) => s.trim().toLowerCase());
  const out = models.filter((m) => list.includes(m.name.toLowerCase()));
  if (!out.length) throw new Error(`farsi-mock: model "${list.join(", ")}" not found. Available: ${models.map((m) => m.name).join(", ")}`);
  return out;
}

// ---------------------------------------------------------------- Prisma (text, no dependency)
const PRISMA_TYPES: Record<string, FieldType> = {
  String: "string", Int: "integer", BigInt: "integer", Float: "number", Decimal: "number", Boolean: "boolean", DateTime: "datetime", Json: "object", Bytes: "string",
};

/** Parse a schema.prisma file (models, enums, composite types). */
export function parsePrisma(text: string, opts: { model?: string | string[]; useDbNames?: boolean } = {}): ModelSpec[] {
  const src = text.replace(/\/\/.*$/gm, "");
  const enums: Record<string, string[]> = {};
  for (const m of src.matchAll(/\benum\s+(\w+)\s*\{([^}]*)\}/g)) enums[m[1]] = m[2].split(/\s+/).map((s) => s.trim()).filter((s) => s && !s.startsWith("@"));
  const blocks = [...src.matchAll(/\b(model|type)\s+(\w+)\s*\{([^}]*)\}/g)].map((m) => ({ kind: m[1], name: m[2], body: m[3] }));
  const names = new Set(blocks.map((b) => b.name));
  const types: Record<string, FieldSpec[]> = {};
  const models: ModelSpec[] = [];
  const parseBody = (body: string): FieldSpec[] => {
    const fields: FieldSpec[] = [];
    const relations: { fields: string[]; model: string; refs: string[] }[] = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("@@")) continue;
      const m = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, fname, ftype, list, opt, attrs] = m;
      const rel = /@relation\(([^)]*)\)/.exec(attrs);
      if (names.has(ftype) && blocks.find((b) => b.name === ftype)?.kind === "model") {
        if (rel) {
          const fl = /fields:\s*\[([^\]]*)\]/.exec(rel[1]), rl = /references:\s*\[([^\]]*)\]/.exec(rel[1]);
          if (fl) relations.push({ fields: fl[1].split(",").map((s) => s.trim()), model: ftype, refs: rl ? rl[1].split(",").map((s) => s.trim()) : ["id"] });
        }
        continue; // relation fields are virtual
      }
      const mapName = opts.useDbNames ? /@map\("([^"]+)"\)/.exec(attrs)?.[1] : undefined;
      const spec: FieldSpec = { name: mapName ?? fname, type: PRISMA_TYPES[ftype] ?? "unknown" };
      if (enums[ftype]) { spec.type = "string"; spec.enum = enums[ftype]; }
      if (types[ftype]) { spec.type = "object"; spec.fields = types[ftype]; }
      if (opt) { spec.optional = true; spec.nullable = true; }
      if (/@id\b/.test(attrs)) spec.id = true;
      if (/@unique\b/.test(attrs)) spec.unique = true;
      if (/@db\.ObjectId/.test(attrs)) spec.type = "objectId";
      const vc = /@db\.(?:VarChar|Char)\((\d+)\)/.exec(attrs);
      if (vc) spec.maxLength = Number(vc[1]);
      if (/@db\.Date\b/.test(attrs)) spec.type = "date";
      const def = /@default\(((?:[^()]|\([^)]*\))*)\)/.exec(attrs);
      if (def) {
        const d = def[1].trim();
        if (/^uuid\(/.test(d)) spec.format = "uuid";
        else if (/^cuid\(/.test(d)) spec.format = "cuid";
        else if (/^autoincrement\(/.test(d)) spec.generated = "autoincrement";
        else if (/^now\(/.test(d)) spec.generated = "now";
        else if (/^auto\(/.test(d)) spec.generated = "auto";
      }
      if (/@updatedAt\b/.test(attrs)) spec.generated = "updatedAt";
      if (list) fields.push({ name: spec.name, type: "array", items: { ...spec, name: singular(spec.name), optional: undefined, nullable: undefined, id: undefined }, optional: spec.optional });
      else fields.push(spec);
    }
    for (const r of relations) r.fields.forEach((fname, i) => {
      const f = fields.find((x) => x.name === fname);
      if (f) f.ref = { model: r.model, field: r.refs[i] ?? "id" };
    });
    return fields;
  };
  for (const b of blocks.filter((x) => x.kind === "type")) types[b.name] = parseBody(b.body);
  for (const b of blocks.filter((x) => x.kind === "model")) models.push({ name: b.name, fields: parseBody(b.body) });
  if (!models.length) throw new Error("farsi-mock: no `model` blocks found in the Prisma schema");
  // put referenced models first so refs resolve in datasets
  return pickModels(orderByRefs(models), opts.model);
}

/** Topological order so a model comes after the models it references. */
export function orderByRefs(models: ModelSpec[]): ModelSpec[] {
  const byName = new Map(models.map((m) => [m.name, m]));
  const out: ModelSpec[] = [], state = new Map<string, number>();
  const refsOf = (fs: FieldSpec[]): string[] => fs.flatMap((f) => [...(f.ref ? [f.ref.model] : []), ...(f.fields ? refsOf(f.fields) : []), ...(f.items ? refsOf([f.items]) : [])]);
  const visit = (m: ModelSpec) => {
    if (state.get(m.name)) return;
    state.set(m.name, 1);
    for (const r of refsOf(m.fields)) { const t = byName.get(r); if (t && t !== m && !state.get(r)) visit(t); }
    state.set(m.name, 2);
    out.push(m);
  };
  models.forEach(visit);
  return out;
}

// ---------------------------------------------------------------- Mongoose (definition object or Schema, no dependency)
function ctorName(v: unknown): string | undefined {
  if (typeof v === "function") return (v as { schemaName?: string }).schemaName ?? v.name;
  if (typeof v === "string") return v;
  return undefined;
}
const MONGOOSE_TYPES: Record<string, FieldType> = {
  String: "string", Number: "number", Date: "datetime", Boolean: "boolean", ObjectId: "objectId", Buffer: "string", Decimal128: "number",
  BigInt: "integer", Int32: "integer", Double: "number", Mixed: "unknown", Map: "object", UUID: "string",
};

function mongooseField(name: string, v: unknown): FieldSpec {
  if (Array.isArray(v)) return { name, type: "array", items: mongooseField(singular(name), v[0] ?? "Mixed") };
  const n = ctorName(v);
  if (n) return { name, type: MONGOOSE_TYPES[n] ?? "unknown", ...(n === "UUID" ? { format: "uuid" } : {}) };
  if (isObj(v)) {
    if (v.obj && isObj(v.obj) && typeof v.path === "function") return { name, type: "object", fields: mongooseFields(v.obj) }; // sub-schema
    if ("type" in v && (typeof v.type === "function" || typeof v.type === "string" || Array.isArray(v.type) || (isObj(v.type) && typeof v.type.path === "function"))) {
      const base = mongooseField(name, v.type);
      if (v.required === true || (Array.isArray(v.required) && v.required[0])) base.optional = false; else base.optional = true;
      const en = Array.isArray(v.enum) ? v.enum : isObj(v.enum) && Array.isArray(v.enum.values) ? v.enum.values : undefined;
      if (en) base.enum = en;
      const num = (x: unknown) => (Array.isArray(x) ? x[0] : x);
      if (typeof num(v.min) === "number") base.min = num(v.min);
      if (typeof num(v.max) === "number") base.max = num(v.max);
      if (num(v.min) instanceof Date) base.example = num(v.min);
      if (typeof num(v.minlength ?? v.minLength) === "number") base.minLength = num(v.minlength ?? v.minLength);
      if (typeof num(v.maxlength ?? v.maxLength) === "number") base.maxLength = num(v.maxlength ?? v.maxLength);
      const match = num(v.match);
      if (match instanceof RegExp) base.pattern = match.source;
      if (v.unique === true) base.unique = true;
      if (typeof v.ref === "string") base.ref = { model: v.ref, field: "_id" };
      if (base.type === "array" && base.items && typeof v.type?.[0]?.ref === "string") base.items.ref = { model: v.type[0].ref, field: "_id" };
      return base;
    }
    return { name, type: "object", fields: mongooseFields(v) };
  }
  return { name, type: "unknown" };
}
function mongooseFields(def: Obj): FieldSpec[] { return Object.entries(def).map(([k, v]) => mongooseField(k, v)); }

/** Mongoose: a Schema instance (uses .obj and timestamps option) or the plain definition object. */
export function parseMongoose(input: unknown, opts: { name?: string; addId?: boolean } = {}): ModelSpec[] {
  if (!isObj(input)) throw new Error("farsi-mock: pass a mongoose Schema or its definition object");
  const isSchema = isObj(input.obj) && typeof input.path === "function";
  const def = isSchema ? input.obj : input;
  const fields = mongooseFields(def);
  if (opts.addId !== false && !fields.some((f) => f.name === "_id") && !(isSchema && input.options?._id === false)) fields.unshift({ name: "_id", type: "objectId", id: true });
  else { const id = fields.find((f) => f.name === "_id"); if (id) id.id = true; }
  const ts = isSchema ? input.options?.timestamps : undefined;
  if (ts) {
    const c = typeof ts === "object" && typeof ts.createdAt === "string" ? ts.createdAt : "createdAt";
    const u = typeof ts === "object" && typeof ts.updatedAt === "string" ? ts.updatedAt : "updatedAt";
    if (!(typeof ts === "object" && ts.createdAt === false)) fields.push({ name: c, type: "datetime", generated: "timestamps" });
    if (!(typeof ts === "object" && ts.updatedAt === false)) fields.push({ name: u, type: "datetime", generated: "timestamps" });
  }
  return [{ name: opts.name ?? (isSchema ? input.options?.collection : undefined) ?? "Model", fields }];
}

// ---------------------------------------------------------------- Zod v3 and v4 (zod is NOT imported)
function zodField(name: string, s: any, depth = 0): FieldSpec {
  if (!s || depth > 20) return { name, type: "unknown" };
  const d4 = s._zod?.def;
  if (d4) return zod4(name, d4, depth);
  const d3 = s._def;
  if (d3?.typeName) return zod3(name, d3, depth);
  return { name, type: "unknown" };
}
function zod4(name: string, d: any, depth: number): FieldSpec {
  const inner = (x: any) => zodField(name, x, depth + 1);
  switch (d.type) {
    case "object": return { name, type: "object", fields: Object.entries(d.shape as Obj).map(([k, v]) => zodField(k, v, depth + 1)) };
    case "optional": return { ...inner(d.innerType), optional: true };
    case "nullable": return { ...inner(d.innerType), nullable: true };
    case "default": case "prefault": case "catch": case "readonly": case "nonoptional": return inner(d.innerType);
    case "pipe": return d.in?._zod?.def?.type === "transform" ? inner(d.out) : inner(d.in);
    case "lazy": return inner(d.getter?.());
    case "array": {
      const f: FieldSpec = { name, type: "array", items: zodField(singular(name), d.element, depth + 1) };
      for (const c of d.checks ?? []) { const x = c._zod?.def; if (x?.check === "min_length") f.minLength = x.minimum; if (x?.check === "max_length") f.maxLength = x.maximum; }
      return f;
    }
    case "enum": return { name, type: typeof Object.values(d.entries)[0] === "number" ? "integer" : "string", enum: [...new Set(Object.values(d.entries) as (string | number)[])] };
    case "literal": return { name, type: typeof d.values[0] === "number" ? "number" : typeof d.values[0] === "boolean" ? "boolean" : "string", enum: d.values };
    case "union": { const opts = (d.options as any[]).filter((o) => o._zod?.def?.type !== "null"); const f = inner(opts[0]); return opts.length < d.options.length ? { ...f, nullable: true } : f; }
    case "date": return { name, type: "datetime" };
    case "boolean": return { name, type: "boolean" };
    case "bigint": return { name, type: "integer" };
    case "string": case "number": {
      const f: FieldSpec = { name, type: d.type === "string" ? "string" : "number" };
      const checks = [d, ...(d.checks ?? []).map((c: any) => c._zod?.def)].filter(Boolean);
      for (const x of checks) {
        if (x.check === "string_format" || (x === d && d.format && d.type === "string")) {
          if (x.format === "regex") f.pattern = String(x.pattern?.source ?? x.pattern);
          else if (x.format) f.format = x.format === "datetime" ? "date-time" : x.format;
        }
        if (x.check === "number_format" || (x === d && d.format && d.type === "number")) f.type = /int/.test(x.format) ? "integer" : f.type;
        if (x.check === "min_length") f.minLength = x.minimum;
        if (x.check === "max_length") f.maxLength = x.maximum;
        if (x.check === "length_equals") { f.minLength = x.length; f.maxLength = x.length; }
        if (x.check === "greater_than") f.min = x.inclusive ? x.value : x.value + (f.type === "integer" ? 1 : 1e-9);
        if (x.check === "less_than") f.max = x.inclusive ? x.value : x.value - (f.type === "integer" ? 1 : 1e-9);
      }
      if (f.format === "date-time") f.type = "datetime";
      if (f.format === "date") f.type = "date";
      return f;
    }
    default: return { name, type: "unknown" };
  }
}
function zod3(name: string, d: any, depth: number): FieldSpec {
  const inner = (x: any) => zodField(name, x, depth + 1);
  switch (d.typeName) {
    case "ZodObject": { const shape = typeof d.shape === "function" ? d.shape() : d.shape; return { name, type: "object", fields: Object.entries(shape as Obj).map(([k, v]) => zodField(k, v, depth + 1)) }; }
    case "ZodOptional": return { ...inner(d.innerType), optional: true };
    case "ZodNullable": return { ...inner(d.innerType), nullable: true };
    case "ZodDefault": case "ZodCatch": case "ZodReadonly": case "ZodBranded": return inner(d.innerType ?? d.type);
    case "ZodEffects": return inner(d.schema);
    case "ZodPipeline": return inner(d.in);
    case "ZodLazy": return inner(d.getter?.());
    case "ZodArray": return { name, type: "array", items: zodField(singular(name), d.type, depth + 1), ...(d.minLength ? { minLength: d.minLength.value } : {}), ...(d.maxLength ? { maxLength: d.maxLength.value } : {}) };
    case "ZodEnum": return { name, type: "string", enum: d.values };
    case "ZodNativeEnum": { const vals = Object.values(d.values as Obj).filter((v) => typeof v !== "string" || !(typeof (d.values as Obj)[v] === "number")); return { name, type: typeof vals[0] === "number" ? "integer" : "string", enum: vals as (string | number)[] }; }
    case "ZodLiteral": return { name, type: typeof d.value === "number" ? "number" : typeof d.value === "boolean" ? "boolean" : "string", enum: [d.value] };
    case "ZodUnion": case "ZodDiscriminatedUnion": { const opts = [...(d.options instanceof Map ? d.options.values() : d.options)] as any[]; const nn = opts.filter((o) => o._def?.typeName !== "ZodNull"); const f = inner(nn[0]); return nn.length < opts.length ? { ...f, nullable: true } : f; }
    case "ZodDate": return { name, type: "datetime" };
    case "ZodBoolean": return { name, type: "boolean" };
    case "ZodBigInt": return { name, type: "integer" };
    case "ZodString": case "ZodNumber": {
      const f: FieldSpec = { name, type: d.typeName === "ZodString" ? "string" : "number" };
      for (const c of d.checks ?? []) {
        if (["email", "uuid", "url", "cuid", "ulid", "ip", "emoji"].includes(c.kind)) f.format = c.kind === "ip" ? "ipv4" : c.kind;
        if (c.kind === "datetime") { f.format = "date-time"; f.type = "datetime"; }
        if (c.kind === "date") { f.format = "date"; f.type = "date"; }
        if (c.kind === "regex") f.pattern = c.regex.source;
        if (c.kind === "int") f.type = "integer";
        if (c.kind === "length") { f.minLength = c.value; f.maxLength = c.value; }
        if (c.kind === "min") { if (f.type === "string") f.minLength = c.value; else f.min = c.inclusive === false ? c.value + 1e-9 : c.value; }
        if (c.kind === "max") { if (f.type === "string") f.maxLength = c.value; else f.max = c.inclusive === false ? c.value - 1e-9 : c.value; }
      }
      if (f.type === "integer") { if (f.min !== undefined) f.min = Math.ceil(f.min); if (f.max !== undefined) f.max = Math.floor(f.max); }
      return f;
    }
    default: return { name, type: "unknown" };
  }
}

/** Zod v3 or v4 object schema (or a record of them for several models). zod itself is never imported. */
export function parseZod(schema: unknown, opts: { name?: string } = {}): ModelSpec[] {
  const asModel = (name: string, s: unknown): ModelSpec => {
    const f = zodField(name, s);
    if (f.type !== "object") throw new Error(`farsi-mock: fromZod expects z.object(...) (got ${f.type})`);
    return { name, fields: f.fields ?? [] };
  };
  const s = schema as Obj;
  if (s && (s._zod || s._def)) return [asModel(opts.name ?? "Model", s)];
  if (isObj(s)) return Object.entries(s).map(([k, v]) => asModel(k, v));
  throw new Error("farsi-mock: fromZod expects a zod schema");
}

// ---------------------------------------------------------------- samples (JSON records)
const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, objectId: /^[0-9a-f]{24}$/i,
  dateTime: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/, date: /^\d{4}-\d{2}-\d{2}$/,
  jalali: /^1[34]\d\d[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])$/, mobile: /^(\+98|0098|98|0)?9\d{9}$/, landline: /^0[1-8]\d{9}$/,
  sheba: /^IR\d{24}$/i, url: /^https?:\/\//, ipv4: /^(\d{1,3}\.){3}\d{1,3}$/, plate: /^[0-9۰-۹]{2}\s?\S\s?[0-9۰-۹]{3}\s?(ایران)?\s?[0-9۰-۹]{2}$/,
};
const fa2en = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
function nidOk(s: string): boolean {
  if (!/^\d{10}$/.test(s) || /^(\d)\1{9}$/.test(s)) return false;
  const sum = [...s.slice(0, 9)].reduce((a, d, i) => a + Number(d) * (10 - i), 0) % 11;
  return Number(s[9]) === (sum < 2 ? sum : 11 - sum);
}
function luhn(s: string): boolean {
  let sum = 0;
  for (let i = 0; i < s.length; i++) { let d = Number(s[s.length - 1 - i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
}
/** Detect a string format from a value. ir-* formats are Iranian identifiers. */
export function detectFormat(raw: string): string | undefined {
  const v = fa2en(raw.trim());
  const digits = v.replace(/[\s-]/g, "");
  if (RE.email.test(v)) return "email";
  if (RE.uuid.test(v)) return "uuid";
  if (RE.objectId.test(v)) return "objectid";
  if (RE.dateTime.test(v)) return "date-time";
  if (RE.date.test(v)) return "date";
  if (RE.jalali.test(v)) return "jalali-date";
  if (RE.sheba.test(digits)) return "ir-sheba";
  if (RE.mobile.test(digits)) return "ir-mobile";
  if (RE.landline.test(digits)) return "ir-landline";
  if (/^\d{16}$/.test(digits) && luhn(digits)) return "ir-card";
  if (nidOk(digits)) return "ir-national-id";
  if (/^\d{10}$/.test(digits) && /^(?!(\d)\1{3})[13-9]{4}[1346-9][013-9]{5}$/.test(digits)) return "ir-postal";
  if (RE.url.test(v)) return "uri";
  if (RE.ipv4.test(v)) return "ipv4";
  if (RE.plate.test(raw.trim())) return "ir-plate";
  return undefined;
}

function sampleField(name: string, values: unknown[], total: number): FieldSpec {
  const present = values.filter((v) => v !== undefined);
  const nonNull = present.filter((v) => v !== null);
  const spec: FieldSpec = { name, type: "unknown" };
  if (present.length < total) spec.optional = true;
  if (nonNull.length < present.length) spec.nullable = true;
  if (!nonNull.length) return spec;
  const v0 = nonNull[0];
  if (isObj(v0) && "$oid" in v0) return { ...spec, type: "objectId", ...(name === "_id" ? { id: true } : {}) };
  if (isObj(v0) && "$date" in v0) return { ...spec, type: "datetime" };
  if (isObj(v0) && ("$numberLong" in v0 || "$numberInt" in v0)) return { ...spec, type: "integer" };
  if (isObj(v0) && "$numberDecimal" in v0) return { ...spec, type: "number" };
  if (typeof v0 === "boolean") return { ...spec, type: "boolean" };
  if (typeof v0 === "number") {
    const nums = nonNull.filter((x): x is number => typeof x === "number");
    return { ...spec, type: nums.every(Number.isInteger) ? "integer" : "number", range: [Math.min(...nums), Math.max(...nums)] };
  }
  if (typeof v0 === "string") {
    const strs = nonNull.filter((x): x is string => typeof x === "string");
    const formats = strs.map(detectFormat);
    const fmt = formats[0] && formats.every((x) => x === formats[0]) ? formats[0] : undefined;
    if (fmt) spec.format = fmt;
    spec.type = fmt === "date-time" ? "datetime" : fmt === "date" ? "date" : fmt === "objectid" ? "objectId" : "string";
    if (fmt === "objectid" && name === "_id") spec.id = true;
    const distinct = [...new Set(strs)];
    if (!fmt && strs.length >= 6 && distinct.length <= 6 && distinct.length * 2 <= strs.length && distinct.every((s) => /^[A-Za-z][\w-]{0,24}$/.test(s))) spec.enum = distinct;
    spec.maxLength = undefined;
    return spec;
  }
  if (Array.isArray(v0)) {
    const all = nonNull.flatMap((x) => (Array.isArray(x) ? x : []));
    return { ...spec, type: "array", items: all.length && isObj(all[0]) ? { name: singular(name), type: "object", fields: sampleFields(all as Obj[]) } : sampleField(singular(name), all, all.length) };
  }
  if (isObj(v0)) return { ...spec, type: "object", fields: sampleFields(nonNull.filter(isObj)) };
  return spec;
}
function sampleFields(records: Obj[]): FieldSpec[] {
  const keys: string[] = [];
  for (const r of records) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return keys.map((k) => sampleField(k, records.map((r) => r[k]), records.length));
}

/**
 * Sample JSON: one record, an array of records, or { users: [...], orders: [...] } for several models.
 * Only shapes and formats are kept (plus short code-like enum values); sample values are never copied into output.
 */
export function parseSample(json: unknown, opts: { name?: string } = {}): ModelSpec[] {
  if (Array.isArray(json)) {
    if (!json.length || !json.every(isObj)) throw new Error("farsi-mock: sample array must contain objects");
    return [{ name: opts.name ?? "Model", fields: sampleFields(json) }];
  }
  if (!isObj(json)) throw new Error("farsi-mock: sample must be a JSON object or array of objects");
  const vals = Object.values(json);
  if (vals.length && vals.every((v) => Array.isArray(v) && v.length && v.every(isObj))) return Object.entries(json).map(([k, v]) => ({ name: k, fields: sampleFields(v as Obj[]) }));
  return [{ name: opts.name ?? "Model", fields: sampleFields([json]) }];
}

// ---------------------------------------------------------------- utils
export function singular(name: string): string {
  if (/ies$/i.test(name)) return name.slice(0, -3) + "y";
  if (/(ss|us|is)$/i.test(name)) return name;
  if (/(x|ch|sh|ses)es$/i.test(name)) return name.slice(0, -2);
  if (/s$/i.test(name) && name.length > 3) return name.slice(0, -1);
  return name;
}
