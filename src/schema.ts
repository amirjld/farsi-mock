import type { Iran, Gender, Person, Contact, Address, BankAccount, Company, Product, Order, Operator } from "./iran.js";
import type { ProvinceData, City } from "./data/places.js";
import { PROVINCES } from "./data/places.js";
import { jalaliOf } from "./jalali.js";

export type GenFn = (f: Iran, ctx: RecordContext) => unknown;
/** A field generator: a path like "person.fullName", a function, a literal number/boolean/null, a nested object, an array marker, or a nested schema. */
export type Gen = string | GenFn | number | boolean | null | ArrayMarker | Literal | Schema | SchemaDef | Gen[];
export interface SchemaDef { [field: string]: Gen }
export type KeyCase = "preserve" | "camel" | "snake" | "pascal" | "kebab";

export interface ContextOptions {
  province?: string; city?: string; gender?: Gender; operator?: Operator | Lowercase<Operator>; bank?: string;
  category?: string; minAge?: number; maxAge?: number; unissuedNationalId?: boolean; emailDomains?: string[];
}
export interface SchemaOptions { context?: ContextOptions; case?: KeyCase }

export class ArrayMarker { constructor(readonly n: number | [number, number], readonly gen: Gen) {} }
export class Literal { constructor(readonly value: unknown) {} }
/** Use a string as a literal value instead of a path. */
export const literal = (value: unknown) => new Literal(value);

/** Per-record context. Entities are created lazily, once per record, so every field of a record agrees. */
export class RecordContext {
  readonly province: ProvinceData;
  readonly city: City;
  readonly gender: Gender;
  private cache = new Map<string, unknown>();
  /** Fields of the current record generated so far (top level, in definition order). */
  record?: Record<string, unknown>;

  constructor(
    readonly f: Iran,
    readonly index: number,
    readonly options: ContextOptions,
    readonly refs: Record<string, Record<string, unknown>[]> = {},
    private parent?: RecordContext,
  ) {
    this.province = parent?.province ?? f.provinceData(options.province);
    this.city = parent?.city ?? f.cityData(this.province, options.city);
    this.gender = parent?.gender ?? options.gender ?? f.gender();
  }

  /** Child context for array items / nested schemas: same person, place and company; fresh contact, address, bank, product and order. */
  child(index: number): RecordContext {
    return new RecordContext(this.f, index, this.options, this.refs, this);
  }

  private once<T>(key: string, make: () => T, shared = false): T {
    if (shared && this.parent) return this.parent.once(key, make, true);
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key) as T;
  }
  private get where() { return { province: this.province.iso, city: this.city.fa }; }

  get person(): Person {
    return this.once("person", () => this.f.person({ ...this.where, gender: this.gender, minAge: this.options.minAge, maxAge: this.options.maxAge, unissuedNationalId: this.options.unissuedNationalId }), true);
  }
  get address(): Address { return this.once("address", () => this.f.address(this.where)); }
  get contact(): Contact {
    return this.once("contact", () => {
      const m = this.f.mobileWithOperator({ operator: this.options.operator });
      return {
        mobile: m.mobile, operator: m.operator, landline: this.f.landline({ province: this.province.iso }),
        email: this.f.email({ firstNameEn: this.person.firstNameEn, lastNameEn: this.person.lastNameEn, domains: this.options.emailDomains }),
        postalCode: this.address.postalCode,
      };
    });
  }
  get bank(): BankAccount { return this.once("bank", () => this.f.bank({ bank: this.options.bank })); }
  get company(): Company { return this.once("company", () => this.f.company(this.where), true); }
  get product(): Product { return this.once("product", () => this.f.product({ category: this.options.category })); }
  get order(): Order { return this.once("order", () => this.f.order()); }
  get provinceInfo() {
    return { name: this.province.fa, nameEn: this.province.en, iso: this.province.iso, id: PROVINCES.indexOf(this.province) + 1, areaCode: "0" + this.province.areaCode };
  }
  get cityInfo() { return { name: this.city.fa, nameEn: this.city.en }; }
}

type Resolver = (ctx: RecordContext) => unknown;
const ENTITIES = ["person", "contact", "address", "bank", "company", "product", "order"] as const;

const FRESH: Record<string, (ctx: RecordContext) => unknown> = {
  "id.uuid": (c) => c.f.uuid(),
  "id.objectId": (c) => c.f.objectId(),
  "id.index": (c) => c.index + 1,
  "id.int": (c) => c.f.int(1, 1_000_000),
  "date.now": (c) => c.f.now().toISOString(),
  "date.nowJalali": (c) => jalaliOf(c.f.now()).formatted,
  "date.recent": (c) => c.f.recentDate().toISOString(),
  "date.recentJalali": (c) => jalaliOf(c.f.recentDate()).formatted,
  "date.past": (c) => c.f.pastDate().toISOString(),
  "date.pastJalali": (c) => jalaliOf(c.f.pastDate()).formatted,
  "date.future": (c) => c.f.futureDate().toISOString(),
  "date.futureJalali": (c) => jalaliOf(c.f.futureDate()).formatted,
  "text.word": (c) => c.f.word(),
  "text.sentence": (c) => c.f.sentence(),
  "text.paragraph": (c) => c.f.paragraph(),
  "number.int": (c) => c.f.int(0, 1000),
  "number.float": (c) => c.f.float(0, 1000, 2),
  "number.rating": (c) => c.f.float(2.5, 5, 1),
  "number.percent": (c) => c.f.int(0, 100),
  "helpers.bool": (c) => c.f.bool(),
  "commerce.price": (c) => c.f.price(),
  "commerce.productName": (c) => c.f.productName({ category: c.options.category }),
  "commerce.sku": (c) => c.f.sku(),
  "commerce.orderNumber": (c) => c.f.orderNumber(),
  "phone.mobile": (c) => c.f.mobile({ operator: c.options.operator }),
  "phone.landline": (c) => c.f.landline({ province: c.province.iso }),
  "province.name": (c) => c.provinceInfo.name,
  "province.nameEn": (c) => c.provinceInfo.nameEn,
  "province.iso": (c) => c.provinceInfo.iso,
  "province.id": (c) => c.provinceInfo.id,
  "province.areaCode": (c) => c.provinceInfo.areaCode,
  "city.name": (c) => c.cityInfo.name,
  "city.nameEn": (c) => c.cityInfo.nameEn,
};

let entityFields: Record<string, string[]> | undefined;
/** All supported string paths, grouped. */
export function listPaths(f: Iran): Record<string, string[]> {
  if (!entityFields) {
    const probe = new (f.constructor as new (o: object) => Iran)({ seed: 1, referenceDate: "2026-01-01T00:00:00Z" });
    const ctx = new RecordContext(probe, 0, {});
    entityFields = Object.fromEntries(ENTITIES.map((e) => [e, Object.keys(ctx[e] as object)]));
  }
  const out: Record<string, string[]> = {};
  for (const [e, keys] of Object.entries(entityFields)) out[e] = [e, ...keys.map((k) => `${e}.${k}`)];
  for (const k of Object.keys(FRESH)) (out[k.split(".")[0]] ??= []).push(k);
  return out;
}

function compilePath(f: Iran, path: string): Resolver {
  if (path.startsWith("ref:")) {
    const [name, ...rest] = path.slice(4).split(".");
    const fn = makeRef(name, rest.join(".") || undefined);
    return (ctx) => fn(ctx.f, ctx);
  }
  if (FRESH[path]) return FRESH[path];
  const [ns, field, ...more] = path.split(".");
  if ((ENTITIES as readonly string[]).includes(ns)) {
    const fields = listPaths(f)[ns];
    if (field === undefined) return (ctx) => clone((ctx as unknown as Record<string, unknown>)[ns]);
    if (more.length || !fields.includes(path)) throw unknownPath(f, path);
    return (ctx) => clone(((ctx as unknown as Record<string, Record<string, unknown>>)[ns])[field]);
  }
  throw unknownPath(f, path);
}

function unknownPath(f: Iran, path: string): Error {
  const all = Object.values(listPaths(f)).flat();
  const near = all.map((p) => [p, distance(p.toLowerCase(), path.toLowerCase())] as const).sort((a, b) => a[1] - b[1]).slice(0, 5).map((x) => x[0]);
  return new Error(`mock-iran: unknown path "${path}". Did you mean: ${near.join(", ")}? Use literal("...") for a fixed string.`);
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

const clone = (v: unknown) => (v && typeof v === "object" ? structuredCloneSafe(v) : v);
function structuredCloneSafe(v: unknown): unknown { return JSON.parse(JSON.stringify(v)); }

function compile(f: Iran, gen: Gen): Resolver {
  if (typeof gen === "string") return compilePath(f, gen);
  if (typeof gen === "number" || typeof gen === "boolean" || gen === null) return () => gen;
  if (gen instanceof Literal) return () => clone(gen.value);
  if (typeof gen === "function") return (ctx) => finish(f, gen(ctx.f, ctx), ctx);
  if (gen instanceof ArrayMarker) {
    const item = compile(f, gen.gen);
    return (ctx) => {
      const n = Array.isArray(gen.n) ? ctx.f.int(gen.n[0], gen.n[1]) : gen.n;
      return Array.from({ length: n }, (_, i) => item(ctx.child(i)));
    };
  }
  if (gen instanceof Schema) return (ctx) => gen.build(ctx.child(ctx.index));
  if (Array.isArray(gen)) { const items = gen.map((g) => compile(f, g)); return (ctx) => items.map((r) => r(ctx)); }
  if (typeof gen === "object") {
    const entries = Object.entries(gen).map(([k, g]) => [k, compile(f, g)] as const);
    return (ctx) => {
      // the outermost object of a record is exposed as ctx.record so later fields can read earlier ones
      const top = ctx.record === undefined;
      const o: Record<string, unknown> = {};
      if (top) ctx.record = o;
      for (const [k, r] of entries) o[k] = r(ctx);
      return o;
    };
  }
  throw new Error(`mock-iran: unsupported generator ${String(gen)}`);
}

/** Values returned by user functions may themselves be markers/paths-as-markers; Dates become ISO strings. */
function finish(f: Iran, v: unknown, ctx: RecordContext): unknown {
  if (v instanceof ArrayMarker || v instanceof Schema || v instanceof Literal) return compile(f, v)(ctx);
  if (v instanceof Date) return v.toISOString();
  return v;
}

export class Schema {
  private resolver: Resolver;
  /** Records from the most recent many()/one() call, used by refs. */
  last: Record<string, unknown>[] = [];

  constructor(readonly f: Iran, readonly def: SchemaDef, readonly options: SchemaOptions = {}) {
    this.resolver = compile(f, def);
  }

  /** @internal */ build(ctx: RecordContext): Record<string, unknown> {
    return applyCase(this.resolver(ctx), this.options.case ?? "preserve") as Record<string, unknown>;
  }

  /** One record. */
  one(context: ContextOptions = {}, refs?: Record<string, Record<string, unknown>[]>): Record<string, unknown> {
    const r = this.build(new RecordContext(this.f, 0, { ...this.options.context, ...context }, refs));
    this.last = [r];
    return r;
  }

  /** n records. */
  many(n: number, context: ContextOptions = {}, refs?: Record<string, Record<string, unknown>[]>): Record<string, unknown>[] {
    const opts = { ...this.options.context, ...context };
    const out = Array.from({ length: n }, (_, i) => this.build(new RecordContext(this.f, i, opts, refs)));
    this.last = out;
    return out;
  }

  /** New schema with extra / overridden fields. */
  extend(def: SchemaDef, options: SchemaOptions = {}): Schema { return new Schema(this.f, { ...this.def, ...def }, mergeOpts(this.options, options)); }
  omit(...keys: string[]): Schema { return new Schema(this.f, Object.fromEntries(Object.entries(this.def).filter(([k]) => !keys.includes(k))), this.options); }
  pick(...keys: string[]): Schema { return new Schema(this.f, Object.fromEntries(keys.filter((k) => k in this.def).map((k) => [k, this.def[k]])), this.options); }
  /** Rename top-level fields, e.g. { mobile: "phone_number" }. */
  rename(map: Record<string, string>): Schema { return new Schema(this.f, Object.fromEntries(Object.entries(this.def).map(([k, v]) => [map[k] ?? k, v])), this.options); }
  withContext(context: ContextOptions): Schema { return new Schema(this.f, this.def, mergeOpts(this.options, { context })); }
  withCase(keyCase: KeyCase): Schema { return new Schema(this.f, this.def, { ...this.options, case: keyCase }); }
}

function mergeOpts(a: SchemaOptions, b: SchemaOptions): SchemaOptions { return { ...a, ...b, context: { ...a.context, ...b.context } }; }

// ---------- refs ----------
export type RefSource = Schema | Record<string, unknown>[] | string;

export function makeRef(source: RefSource, field: string | undefined = "id"): GenFn {
  return (f, ctx) => {
    let records: Record<string, unknown>[];
    if (typeof source === "string") {
      records = ctx.refs[source];
      if (!records) throw new Error(`mock-iran: ref to "${source}" but no such entity was generated earlier in this dataset`);
    } else if (source instanceof Schema) {
      records = source.last;
      if (!records.length) throw new Error("mock-iran: ref to a schema that has not generated any records yet; call .many() on it first");
    } else records = source;
    if (!records.length) throw new Error("mock-iran: ref source is empty");
    const r = f.pick(records);
    return field ? getPath(r, field) : clone(r);
  };
}

const getPath = (o: unknown, path: string) => path.split(".").reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]), o);

// ---------- datasets ----------
export type DatasetEntry = { schema: Schema | SchemaDef; count: number; context?: ContextOptions; case?: KeyCase } | [Schema | SchemaDef, number];
export type DatasetSpec = Record<string, DatasetEntry>;

export function generateDataset(f: Iran, spec: DatasetSpec): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [name, entry] of Object.entries(spec)) {
    const e = Array.isArray(entry) ? { schema: entry[0], count: entry[1] } : entry;
    let s = e.schema instanceof Schema ? e.schema : new Schema(f, e.schema);
    if (!Array.isArray(entry) && entry.case) s = s.withCase(entry.case);
    out[name] = s.many(e.count, Array.isArray(entry) ? {} : entry.context ?? {}, out);
  }
  return out;
}

// ---------- key case ----------
function words(k: string): string[] {
  return k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_\-]+/).filter(Boolean);
}
export function convertKey(k: string, c: KeyCase): string {
  if (c === "preserve") return k;
  const w = words(k).map((x) => x.toLowerCase());
  if (!w.length) return k;
  if (c === "snake") return w.join("_");
  if (c === "kebab") return w.join("-");
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (c === "pascal") return w.map(cap).join("");
  return w[0] + w.slice(1).map(cap).join("");
}
function applyCase(v: unknown, c: KeyCase): unknown {
  if (c === "preserve") return v;
  if (Array.isArray(v)) return v.map((x) => applyCase(x, c));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [convertKey(k, c), applyCase(x, c)]));
  return v;
}

// ---------- JSON schema files ----------
/** Convert a JSON schema file's field map into a SchemaDef. See README "Schema files". */
export function fromJson(f: Iran, json: unknown): Gen {
  if (typeof json === "string" || typeof json === "number" || typeof json === "boolean" || json === null) return json as Gen;
  if (Array.isArray(json)) return json.map((x) => fromJson(f, x));
  const o = json as Record<string, unknown>;
  if ("$literal" in o) return new Literal(o.$literal);
  if ("$array" in o) return new ArrayMarker(o.$array as number | [number, number], fromJson(f, o.of));
  if ("$pick" in o) { const list = o.$pick as unknown[]; return (x) => clone(x.pick(list)); }
  if ("$int" in o) { const [a, b] = o.$int as [number, number]; return (x) => x.int(a, b); }
  if ("$float" in o) { const [a, b, d = 2] = o.$float as number[]; return (x) => x.float(a, b, d); }
  if ("$bool" in o) { const p = typeof o.$bool === "number" ? o.$bool : 0.5; return (x) => x.bool(p); }
  if ("$template" in o) {
    const t = String(o.$template);
    const parts = [...t.matchAll(/\{([^}]+)\}/g)].map((m) => [m[0], compile(f, m[1])] as const);
    return (_x, ctx) => parts.reduce((s, [token, r]) => s.replace(token, String(r(ctx))), t);
  }
  if ("$gen" in o) {
    const name = String(o.$gen);
    if (!GEN_ALLOW.includes(name)) throw new Error(`mock-iran: $gen "${name}" is not allowed. Allowed: ${GEN_ALLOW.join(", ")}`);
    const args = o.args;
    return (x) => (x as unknown as Record<string, (a?: unknown) => unknown>)[name](args);
  }
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fromJson(f, v)])) as SchemaDef;
}

export const GEN_ALLOW = [
  "mobile", "landline", "nationalId", "postalCode", "email", "cardNumber", "sheba", "accountNumber", "price", "productName", "sku",
  "orderNumber", "legalNationalId", "firstName", "lastName", "city", "gender", "uuid", "objectId", "sentence", "paragraph", "word",
  "person", "contact", "address", "bank", "company", "product", "order",
];
