import type { Iran } from "../iran.js";
import { Schema, fromJson, generateDataset, type SchemaDef, type DatasetCount, type SchemaOptions } from "../schema.js";
import { mapModels, type FieldReport, type JsonGen, type MapOptions, type MappedModel } from "./mapper.js";
import { parseJsonSchema, parseOpenAPI, parsePrisma, parseMongoose, parseZod, parseSample, orderByRefs } from "./parsers.js";
import type { ModelSpec } from "./spec.js";

export type { FieldReport, JsonGen, MapOptions } from "./mapper.js";
export type { FieldSpec, FieldType, ModelSpec } from "./spec.js";
export { matchAlias, mapModels } from "./mapper.js";
export { ALIASES, tokenize, modelKind } from "./aliases.js";
export { parseJsonSchema, parseOpenAPI, parsePrisma, parseMongoose, parseZod, parseSample, detectFormat, singular } from "./parsers.js";

export type InferSource = "zod" | "jsonschema" | "openapi" | "prisma" | "mongoose" | "sample";

export interface InferOptions extends MapOptions {
  /** Model name for single-model inputs (JSON Schema, Zod, Mongoose, samples). */
  name?: string;
  /** Only these models (Prisma / OpenAPI / JSON Schema $defs). */
  model?: string | string[];
  /** Records per model when generating a dataset (number, or per model). Default 10. */
  count?: number | Record<string, DatasetCount>;
  /** Schema options (context, case, digits, ...) for the generated schemas. */
  schemaOptions?: SchemaOptions;
}

/** Result of schema inference: generator definitions, a confidence report, and ready-to-use schemas. */
export class InferredSchema {
  constructor(readonly f: Iran, readonly source: InferSource, readonly models: MappedModel[], readonly report: FieldReport[], private opts: InferOptions = {}) {}

  get modelNames(): string[] { return this.models.map((m) => m.name); }

  /** Generator definition (JSON schema-file format) of one model (default: the first). */
  fields(model?: string): Record<string, JsonGen> { return this.get(model).fields; }

  private get(model?: string): MappedModel {
    if (!model) return this.models[0];
    const m = this.models.find((x) => x.name.toLowerCase() === model.toLowerCase());
    if (!m) throw new Error(`farsi-mock: model "${model}" not found. Available: ${this.modelNames.join(", ")}`);
    return m;
  }

  /** A Schema for one model. Refs to other models need dataset() instead. */
  schema(model?: string, options: SchemaOptions = {}): Schema {
    return new Schema(this.f, fromJson(this.f, this.get(model).fields) as SchemaDef, { ...this.opts.schemaOptions, ...options });
  }

  /** Shortcut: n records of one model. */
  many(n: number, model?: string): Record<string, unknown>[] {
    if (this.models.length > 1 && !model) return this.dataset({ [this.models[0].name]: n })[this.models[0].name];
    return this.schema(model).many(n);
  }

  /** Generate all models together, with references resolved. */
  dataset(count: number | Record<string, DatasetCount> = this.opts.count ?? 10): Record<string, Record<string, unknown>[]> {
    const spec = Object.fromEntries(this.models.map((m) => [m.name, {
      schema: new Schema(this.f, fromJson(this.f, m.fields) as SchemaDef, this.opts.schemaOptions),
      count: typeof count === "number" ? count : count[m.name] ?? 10,
    }]));
    return generateDataset(this.f, spec);
  }

  /** Fields with confidence below the threshold (default 0.5): good candidates for overrides. */
  lowConfidence(threshold = 0.5): FieldReport[] { return this.report.filter((r) => r.confidence < threshold); }

  /** Average confidence of all fields (0..1). */
  get confidence(): number { return this.report.length ? Math.round((this.report.reduce((a, r) => a + r.confidence, 0) / this.report.length) * 100) / 100 : 0; }

  /** JSON schema file usable with `farsi-mock schema file.json` (one model: { fields }, several: { entities }). */
  toJSON(count: number | Record<string, DatasetCount> = this.opts.count ?? 10): Record<string, unknown> {
    if (this.models.length === 1 && !JSON.stringify(this.models[0].fields).includes('"ref:')) return { count: typeof count === "number" ? count : 10, fields: this.models[0].fields };
    return { entities: Object.fromEntries(this.models.map((m) => [m.name, { count: typeof count === "number" ? count : count[m.name] ?? 10, fields: m.fields }])) };
  }

  /** Human-readable mapping table (what --explain prints). */
  explain(): string {
    const rows = this.report.map((r) => [`${this.models.length > 1 ? r.model + "." : ""}${r.field}`, r.type, typeof r.generator === "string" ? r.generator : JSON.stringify(r.generator), `${Math.round(r.confidence * 100)}%`, r.reason]);
    const head = ["field", "type", "generator", "conf", "why"];
    const w = head.map((h, i) => Math.min(48, Math.max(h.length, ...rows.map((r) => r[i].length))));
    const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
    const lines = [head.map((h, i) => cut(h, w[i])).join("  "), w.map((n) => "-".repeat(n)).join("  "), ...rows.map((r) => r.map((c, i) => (i === 4 ? c : cut(c, w[i]))).join("  "))];
    const low = this.lowConfidence();
    lines.push("", `source: ${this.source}, models: ${this.modelNames.join(", ")}, fields: ${this.report.length}, average confidence: ${Math.round(this.confidence * 100)}%`);
    if (low.length) lines.push(`low confidence (<50%): ${low.map((r) => `${r.model}.${r.field}`).join(", ")} - consider --override field=path`);
    return lines.join("\n");
  }
}

const build = (f: Iran, source: InferSource, specs: ModelSpec[], opts: InferOptions) => {
  const { models, report } = mapModels(orderByRefs(specs), opts);
  return new InferredSchema(f, source, models, report, opts);
};

export function fromZod(f: Iran, schema: unknown, opts: InferOptions = {}) { return build(f, "zod", parseZod(schema, opts), opts); }
export function fromJsonSchema(f: Iran, json: unknown, opts: InferOptions = {}) { return build(f, "jsonschema", parseJsonSchema(json, opts), opts); }
export function fromOpenAPI(f: Iran, doc: unknown, opts: InferOptions = {}) { return build(f, "openapi", parseOpenAPI(doc, opts), opts); }
export function fromPrisma(f: Iran, text: string, opts: InferOptions & { useDbNames?: boolean } = {}) { return build(f, "prisma", parsePrisma(text, opts), opts); }
export function fromMongoose(f: Iran, def: unknown, opts: InferOptions & { addId?: boolean } = {}) { return build(f, "mongoose", parseMongoose(def, opts), opts); }
export function fromSample(f: Iran, json: unknown, opts: InferOptions = {}) { return build(f, "sample", parseSample(json, opts), opts); }

/** Guess the input kind. Strings: Prisma text or JSON text. Objects: zod, mongoose, OpenAPI, JSON Schema, or a sample. */
export function detectSource(input: unknown): InferSource {
  if (typeof input === "string") {
    if (/\bmodel\s+\w+\s*\{/.test(input)) return "prisma";
    return detectSource(JSON.parse(input));
  }
  const o = input as Record<string, any>;
  if (o && (o._zod || o._def?.typeName)) return "zod";
  if (o && o.obj && typeof o.path === "function") return "mongoose";
  if (o && (o.openapi || o.swagger)) return "openapi";
  if (o && (o.$schema || (o.type === "object" && o.properties) || ((o.$defs || o.definitions) && !Array.isArray(o)))) return "jsonschema";
  return "sample";
}

/** Infer from any supported input (see detectSource), or force the kind with opts.from. */
export function infer(f: Iran, input: unknown, opts: InferOptions & { from?: InferSource } = {}): InferredSchema {
  const from = opts.from ?? detectSource(input);
  const parsed = typeof input === "string" && from !== "prisma" ? JSON.parse(input) : input;
  switch (from) {
    case "zod": return fromZod(f, parsed, opts);
    case "jsonschema": return fromJsonSchema(f, parsed, opts);
    case "openapi": return fromOpenAPI(f, parsed, opts);
    case "prisma": return fromPrisma(f, String(input), opts);
    case "mongoose": return fromMongoose(f, parsed, opts);
    case "sample": return fromSample(f, parsed, opts);
    default: throw new Error(`farsi-mock: unknown source "${String(from)}"`);
  }
}
