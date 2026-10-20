import type { Iran, Gender, Person, Contact, Address, BankAccount, Company, Product, Order, Operator } from "./iran.js";
import type { ProvinceData, City } from "./data/places.js";
import { PROVINCES } from "./data/places.js";
import { jalaliOf, toLatinDigits, toPersianDigits } from "./jalali.js";
import type { Path, Infer, Simplify } from "./types.js";

export type GenFn = (f: Iran, ctx: RecordContext) => unknown;
/**
 * A field generator: a path like "person.fullName", a function, a literal number/boolean/null, a nested object,
 * an array marker, a nested schema, or a constraint marker (unique / optional / nullable / oneOf).
 */
export type Gen =
  | Path | (string & {}) | GenFn | number | boolean | null
  | ArrayMarker<any> | Literal<unknown> | UniqueMarker<any> | OptionalMarker<any, any> | OneOfMarker<any>
  | Schema<any> | SchemaDef | readonly Gen[];
export interface SchemaDef { [field: string]: Gen }
export type KeyCase = "preserve" | "camel" | "snake" | "pascal" | "kebab";

export interface ContextOptions {
  province?: string; city?: string; gender?: Gender; operator?: Operator | Lowercase<Operator>; bank?: string;
  category?: string; minAge?: number; maxAge?: number; realisticIds?: boolean; emailDomains?: string[];
}
export interface SchemaOptions {
  context?: ContextOptions;
  case?: KeyCase;
  /** Record-level uniqueness: field names (or tuples of names) that must not repeat within one many()/dataset entity. */
  uniqueBy?: string | readonly (string | readonly string[])[];
  /**
   * Digits in string values. "latin": every digit becomes ASCII. "fa": Persian digits in text values; machine
   * formats (emails, URLs, UUIDs, ISO dates, IDs/phones that are only digits) stay Latin unless `digitsAll`.
   */
  digits?: "fa" | "latin";
  digitsAll?: boolean;
}

export class ArrayMarker<G = Gen> { constructor(readonly n: number | readonly [number, number], readonly gen: G) {} }
export class Literal<V = unknown> { constructor(readonly value: V) {} }
export class UniqueMarker<G = Gen> { constructor(readonly gen: G, readonly maxRetries = 200) {} }
export class OptionalMarker<G = Gen, M extends null | undefined = null | undefined> {
  declare readonly _m: M;
  constructor(readonly gen: G, readonly rate: number, readonly mode: "null" | "omit") {
    if (!(rate >= 0 && rate <= 1)) throw new Error("farsi-mock: optional/nullable rate must be between 0 and 1");
  }
}
export class OneOfMarker<G extends readonly unknown[] = readonly Gen[]> { constructor(readonly gens: G) {} }
/** Use a string as a literal value instead of a path. */
export const literal = <const V>(value: V) => new Literal<V>(value);
const OMIT = Symbol("omit");

/** State shared by all records of one many()/dataset entity call. */
export interface RunState { unique: Map<object, Set<unknown>>; usedRefs: Map<unknown, Set<number>> }
const newRun = (): RunState => ({ unique: new Map(), usedRefs: new Map() });

/** Per-record context. Entities are created lazily, once per record, so every field of a record agrees. */
export class RecordContext {
  readonly province: ProvinceData;
  readonly city: City;
  readonly gender: Gender;
  private cache = new Map<string, unknown>();
  /** Fields of the current record generated so far (top level, in definition order). */
  record?: Record<string, unknown>;
  /** In dataset entries with `count: { per: "users" }`, the parent record this record belongs to. */
  readonly parentRecord?: Record<string, unknown>;
  /** @internal */ readonly run: RunState;

  constructor(
    readonly f: Iran,
    readonly index: number,
    readonly options: ContextOptions,
    readonly refs: Record<string, Record<string, unknown>[]> = {},
    private parent?: RecordContext,
    run?: RunState,
    parentRecord?: Record<string, unknown>,
  ) {
    this.run = run ?? parent?.run ?? newRun();
    this.parentRecord = parentRecord ?? parent?.parentRecord;
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
    return this.once("person", () => this.f.person({ ...this.where, gender: this.gender, minAge: this.options.minAge, maxAge: this.options.maxAge, realisticIds: this.options.realisticIds }), true);
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
  get plate() { return this.once("plate", () => this.f.plate()); }
  get geo() { return { latitude: this.address.latitude, longitude: this.address.longitude }; }
}

type Resolver = (ctx: RecordContext) => unknown;
export const ENTITIES = ["person", "contact", "address", "bank", "company", "product", "order"] as const;

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
  "date.dateTimeJalali": (c) => jalaliOf(c.f.recentDate()).dateTime,
  "date.workday": (c) => c.f.jalali.recentWorkday().toISOString(),
  "date.workdayJalali": (c) => jalaliOf(c.f.jalali.recentWorkday()).formatted,
  "date.birthDate": (c) => c.person.birthDate,
  "helpers.bool": (c) => c.f.bool(),
  "person.education": (c) => c.f.education(),
  "person.educationEn": (c) => c.f.education({ en: true }),
  "vehicle.plate": (c) => c.plate.formatted,
  "vehicle.plateLatin": (c) => toLatinDigits(c.plate.formatted),
  "geo.latitude": (c) => c.geo.latitude,
  "geo.longitude": (c) => c.geo.longitude,
  "geo.point": (c) => [c.geo.longitude, c.geo.latitude],
  "internet.username": (c) => `${c.person.firstNameEn}.${c.person.lastNameEn}${c.f.int(1, 999)}`.toLowerCase().replace(/[^a-z0-9.]/g, ""),
  "internet.url": (c) => `https://${c.f.word().length ? "shop" : "site"}${c.f.int(1, 9999)}.example.com`,
  "internet.image": (c) => placeholderImage(c.f, 640, 480),
  "internet.avatar": (c) => placeholderImage(c.f, 128, 128, (c.person.firstName[0] ?? "") + (c.person.lastName[0] ?? "")),
  "internet.thumbnail": (c) => placeholderImage(c.f, 320, 240),
  "internet.slug": (c) => c.f.helpers.slugify(c.product.name),
  "internet.password": (c) => c.f.helpers.replaceSymbols("??##**??##*"),
  "internet.ip": (c) => `10.${c.f.int(0, 255)}.${c.f.int(0, 255)}.${c.f.int(1, 254)}`,
  "commerce.category": (c) => c.product.category,
  "company.typeName": (c) => c.company.type,
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
/** Offline placeholder image: an SVG data URI (renders in <img> without network). */
function placeholderImage(f: Iran, w: number, h: number, label?: string): string {
  const hue = f.int(0, 359);
  const text = label || `${w}×${h}`;
  const fs = Math.round(Math.min(w, h) / (label ? 2.6 : 6));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="hsl(${hue},45%,82%)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Vazirmatn,Tahoma,sans-serif" font-size="${fs}" fill="hsl(${hue},35%,35%)">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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
  if (path === "parent" || path.startsWith("parent.")) {
    const sub = path.slice(7);
    return (ctx) => {
      if (!ctx.parentRecord) throw new Error(`farsi-mock: "${path}" only works in dataset entries with count: { per: "<entity>" }`);
      return clone(sub ? getPath(ctx.parentRecord, sub) : ctx.parentRecord);
    };
  }
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
  return new Error(`farsi-mock: unknown path "${path}". Did you mean: ${near.join(", ")}? Use literal("...") for a fixed string.`);
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
  if (gen === undefined) throw new Error("farsi-mock: a field generator is undefined");
  if (gen instanceof Literal) return () => clone(gen.value);
  if (typeof gen === "function") return (ctx) => finish(f, gen(ctx.f, ctx), ctx);
  if (gen instanceof ArrayMarker) {
    const item = compile(f, gen.gen);
    return (ctx) => {
      const n = typeof gen.n === "number" ? gen.n : ctx.f.int(gen.n[0], gen.n[1]);
      return Array.from({ length: n }, (_, i) => item(ctx.child(i))).filter((v) => v !== OMIT);
    };
  }
  if (gen instanceof Schema) return (ctx) => gen.build(ctx.child(ctx.index));
  if (gen instanceof UniqueMarker) {
    const inner = compile(f, gen.gen as Gen);
    return (ctx) => {
      let seen = ctx.run.unique.get(gen);
      if (!seen) ctx.run.unique.set(gen, (seen = new Set()));
      for (let i = 0; i < gen.maxRetries; i++) {
        const v = inner(ctx);
        const k = v && typeof v === "object" ? JSON.stringify(v) : v;
        if (!seen.has(k)) { seen.add(k); return v; }
      }
      throw new Error(`farsi-mock: unique() gave up after ${gen.maxRetries} tries (generator has too few distinct values for this count)`);
    };
  }
  if (gen instanceof OptionalMarker) {
    const inner = compile(f, gen.gen as Gen);
    const empty = gen.mode === "omit" ? OMIT : null;
    return (ctx) => (ctx.f.bool(gen.rate) ? empty : inner(ctx));
  }
  if (gen instanceof OneOfMarker) {
    const items = (gen.gens as readonly Gen[]).map((g) => compile(f, g));
    return (ctx) => ctx.f.pick(items)(ctx);
  }
  if (Array.isArray(gen)) { const items = (gen as readonly Gen[]).map((g) => compile(f, g)); return (ctx) => items.map((r) => r(ctx)).filter((v) => v !== OMIT); }
  if (typeof gen === "object") {
    const entries = Object.entries(gen).map(([k, g]) => [k, compile(f, g)] as const);
    return (ctx) => {
      // the outermost object of a record is exposed as ctx.record so later fields can read earlier ones
      const top = ctx.record === undefined;
      const o: Record<string, unknown> = {};
      if (top) ctx.record = o;
      for (const [k, r] of entries) { const v = r(ctx); if (v !== OMIT) o[k] = v; }
      return o;
    };
  }
  throw new Error(`farsi-mock: unsupported generator ${String(gen)}`);
}

/** Values returned by user functions may themselves be markers/paths-as-markers; Dates become ISO strings. */
function finish(f: Iran, v: unknown, ctx: RecordContext): unknown {
  if (v instanceof ArrayMarker || v instanceof Schema || v instanceof Literal || v instanceof UniqueMarker || v instanceof OptionalMarker || v instanceof OneOfMarker) return compile(f, v as Gen)(ctx);
  if (v instanceof Date) return v.toISOString();
  return v;
}

export class Schema<T = Record<string, unknown>> {
  private resolver: Resolver;
  private uniqueKeys: (readonly string[])[];
  /** Records from the most recent many()/one() call, used by refs. */
  last: T[] = [];

  constructor(readonly f: Iran, readonly def: SchemaDef, readonly options: SchemaOptions = {}) {
    this.resolver = compile(f, def);
    const u = options.uniqueBy;
    this.uniqueKeys = u === undefined ? [] : typeof u === "string" ? [[u]] : u.map((k) => (typeof k === "string" ? [k] : k));
  }

  /** @internal */ build(ctx: RecordContext): T {
    let v = this.resolver(ctx);
    if (this.options.digits) v = convertDigits(v, this.options.digits, !!this.options.digitsAll);
    return applyCase(v, this.options.case ?? "preserve") as T;
  }

  /** One record. */
  one(context: ContextOptions = {}, refs?: Record<string, Record<string, unknown>[]>): T {
    const r = this.build(new RecordContext(this.f, 0, { ...this.options.context, ...context }, refs));
    this.last = [r];
    return r;
  }

  /** n records. */
  many(n: number, context: ContextOptions = {}, refs?: Record<string, Record<string, unknown>[]>): T[] {
    const out = this.generate(n, context, refs);
    this.last = out;
    return out;
  }

  /** @internal */ generate(n: number, context: ContextOptions = {}, refs?: Record<string, Record<string, unknown>[]>, run: RunState = newRun(), parent?: Record<string, unknown>, offset = 0): T[] {
    const opts = { ...this.options.context, ...context };
    const seen = this.uniqueKeys.map(() => new Set<string>());
    const out: T[] = [];
    for (let i = 0; i < n; i++) {
      let r: T | undefined;
      for (let attempt = 0; ; attempt++) {
        r = this.build(new RecordContext(this.f, offset + i, opts, refs, undefined, run, parent));
        if (!this.uniqueKeys.length) break;
        const keys = this.uniqueKeys.map((ks) => JSON.stringify(ks.map((k) => getPath(r, k))));
        if (keys.every((k, j) => !seen[j].has(k))) { keys.forEach((k, j) => seen[j].add(k)); break; }
        if (attempt >= 200) throw new Error(`farsi-mock: uniqueBy ${JSON.stringify(this.options.uniqueBy)} could not be satisfied after 200 tries`);
      }
      out.push(r);
    }
    return out;
  }

  /** New schema with extra / overridden fields. */
  extend<const E extends SchemaDef>(def: E, options: SchemaOptions = {}): Schema<Simplify<Omit<T, keyof E> & Infer<E>>> {
    return new Schema(this.f, { ...this.def, ...def }, mergeOpts(this.options, options));
  }
  omit<K extends keyof T & string>(...keys: K[]): Schema<Simplify<Omit<T, K>>> {
    return new Schema(this.f, Object.fromEntries(Object.entries(this.def).filter(([k]) => !keys.includes(k as K))), this.options);
  }
  pick<K extends keyof T & string>(...keys: K[]): Schema<Simplify<Pick<T, K>>> {
    return new Schema(this.f, Object.fromEntries(keys.filter((k) => k in this.def).map((k) => [k, this.def[k]])), this.options);
  }
  /** Rename top-level fields, e.g. { mobile: "phone_number" }. */
  rename<const M extends Partial<Record<keyof T & string, string>>>(map: M): Schema<Simplify<RenameKeys<T, M>>> {
    const m = map as Record<string, string>;
    return new Schema(this.f, Object.fromEntries(Object.entries(this.def).map(([k, v]) => [m[k] ?? k, v])), this.options);
  }
  withContext(context: ContextOptions): Schema<T> { return new Schema<T>(this.f, this.def, mergeOpts(this.options, { context })); }
  /** Note: the static type keeps the original keys. */
  withCase(keyCase: KeyCase): Schema<T> { return new Schema<T>(this.f, this.def, { ...this.options, case: keyCase }); }
  withOptions(options: SchemaOptions): Schema<T> { return new Schema<T>(this.f, this.def, mergeOpts(this.options, options)); }
}

type RenameKeys<T, M> = { [K in keyof T as K extends keyof M ? (M[K] extends string ? M[K] : K) : K]: T[K] };

const MACHINE = /@|:\/\/|^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{24}$|^\d{4}-\d{2}-\d{2}T|^[+\d\s-]+$|^[A-Z]{2}\d+$|^[A-Z]+-/;
function convertDigits(v: unknown, mode: "fa" | "latin", all: boolean): unknown {
  if (typeof v === "string") return mode === "latin" ? toLatinDigits(v) : !all && MACHINE.test(v) ? v : toPersianDigits(v);
  if (Array.isArray(v)) return v.map((x) => convertDigits(x, mode, all));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convertDigits(x, mode, all)]));
  return v;
}

function mergeOpts(a: SchemaOptions, b: SchemaOptions): SchemaOptions { return { ...a, ...b, context: { ...a.context, ...b.context } }; }

// ---------- refs ----------
export type RefSource = Schema<any> | readonly Record<string, unknown>[] | string;
export interface RefOptions {
  /** Field to copy (dot path). Omit/empty for the whole record. Default "id". */
  field?: string;
  /** Pick each source record at most once per run (one-to-one). Throws when the source runs out. */
  unique?: boolean;
}

export function makeRef(source: RefSource, field: string | RefOptions | undefined = "id"): GenFn {
  const o: RefOptions = typeof field === "object" ? field : { field };
  const path = typeof field === "object" ? (field.field ?? "id") : field;
  return (f, ctx) => {
    let records: readonly Record<string, unknown>[];
    if (typeof source === "string") {
      records = ctx.refs[source];
      if (!records) throw new Error(`farsi-mock: ref to "${source}" but no such entity was generated earlier in this dataset`);
    } else if (source instanceof Schema) {
      records = source.last as Record<string, unknown>[];
      if (!records.length) throw new Error("farsi-mock: ref to a schema that has not generated any records yet; call .many() on it first");
    } else records = source;
    if (!records.length) throw new Error("farsi-mock: ref source is empty");
    let r: Record<string, unknown>;
    if (o.unique) {
      const key = typeof source === "string" ? `name:${source}` : records;
      let used = ctx.run.usedRefs.get(key);
      if (!used) ctx.run.usedRefs.set(key, (used = new Set()));
      if (used.size >= records.length) throw new Error(`farsi-mock: unique ref exhausted (${records.length} source records)`);
      let idx = f.int(0, records.length - 1);
      while (used.has(idx)) idx = (idx + 1) % records.length;
      used.add(idx);
      r = records[idx];
    } else r = f.pick(records);
    return path ? getPath(r, path) : clone(r);
  };
}

const getPath = (o: unknown, path: string) => path.split(".").reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]), o);

// ---------- datasets ----------
/** Fixed count, or `{ per: "users", min: 1, max: 3 }` = 1-3 records for every record of `users` (use "parent.<field>" paths). */
export type DatasetCount = number | { per: string; min?: number; max?: number; count?: number };
export type DatasetEntry =
  | { schema: Schema<any> | SchemaDef; count: DatasetCount; context?: ContextOptions; case?: KeyCase; uniqueBy?: SchemaOptions["uniqueBy"] }
  | readonly [Schema<any> | SchemaDef, DatasetCount];
export type DatasetSpec = Record<string, DatasetEntry>;
type EntrySchema<E> = E extends { schema: infer S } ? S : E extends readonly [infer S, unknown] ? S : never;
type RecordOf<S> = S extends Schema<infer T> ? T : S extends SchemaDef ? Infer<S> : Record<string, unknown>;
export type DatasetResult<S> = { [K in keyof S]: RecordOf<EntrySchema<S[K]>>[] };

export function generateDataset<S extends DatasetSpec>(f: Iran, spec: S): DatasetResult<S> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [name, entry] of Object.entries(spec)) {
    const e = isTuple(entry) ? { schema: entry[0], count: entry[1] } : entry;
    let s: Schema<any> = e.schema instanceof Schema ? e.schema : new Schema(f, e.schema as SchemaDef);
    if (!isTuple(entry) && (entry.case || entry.uniqueBy)) s = s.withOptions({ ...(entry.case ? { case: entry.case } : {}), ...(entry.uniqueBy ? { uniqueBy: entry.uniqueBy } : {}) });
    const ctxOpts = isTuple(entry) ? {} : entry.context ?? {};
    const run = newRun();
    let records: Record<string, unknown>[];
    if (typeof e.count === "number") records = s.generate(e.count, ctxOpts, out, run);
    else {
      const c = e.count;
      const parents = out[c.per];
      if (!parents) throw new Error(`farsi-mock: "${name}" has count.per "${c.per}" but that entity is not defined before it`);
      records = [];
      for (const p of parents) {
        const n = c.count ?? f.int(c.min ?? 1, c.max ?? c.min ?? 3);
        records.push(...s.generate(n, ctxOpts, out, run, p, records.length));
      }
    }
    s.last = records;
    out[name] = records;
  }
  return out as DatasetResult<S>;
}
const isTuple = (e: DatasetEntry): e is readonly [Schema<any> | SchemaDef, DatasetCount] => Array.isArray(e);

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
  if ("$unique" in o) return new UniqueMarker(fromJson(f, o.$unique));
  if ("$nullable" in o) return new OptionalMarker(fromJson(f, o.$nullable), typeof o.rate === "number" ? o.rate : 0.2, "null");
  if ("$optional" in o) return new OptionalMarker(fromJson(f, o.$optional), typeof o.rate === "number" ? o.rate : 0.2, "omit");
  if ("$oneOf" in o) return new OneOfMarker((o.$oneOf as unknown[]).map((x) => fromJson(f, x)));
  if ("$weighted" in o) { const list = o.$weighted as [unknown, number][]; return (x) => clone(x.helpers.weightedArrayElement(list)); }
  if ("$regex" in o) { const re = String(o.$regex); return (x) => x.helpers.fromRegExp(re); }
  if ("$ref" in o) { const [name, ...rest] = String(o.$ref).split("."); return makeRef(name, { field: rest.join(".") || "id", unique: o.unique === true }); }
  if ("$clamp" in o) {
    const r = compile(f, fromJson(f, o.$clamp)); const lo = Number(o.min ?? -Infinity), hi = Number(o.max ?? Infinity);
    return (x, ctx) => { const v = r(ctx); return typeof v === "number" ? (v < lo || v > hi ? (Number.isInteger(lo) && Number.isInteger(hi) ? x.int(lo, hi) : x.float(lo, hi, 2)) : v) : v; };
  }
  if ("$truncate" in o) { const r = compile(f, fromJson(f, o.$truncate)); const n = Number(o.max); return (_x, ctx) => { const v = r(ctx); return typeof v === "string" ? [...v].slice(0, n).join("").trim() : v; }; }
  if ("$string" in o) { const r = compile(f, fromJson(f, o.$string)); return (_x, ctx) => String(r(ctx)); }
  if ("$number" in o) { const r = compile(f, fromJson(f, o.$number)); return (_x, ctx) => Number(r(ctx)); }
  if ("$dateTime" in o) { const r = compile(f, fromJson(f, o.$dateTime)); return (_x, ctx) => new Date(String(r(ctx))).toISOString(); }
  if ("$dateOnly" in o) { const r = compile(f, fromJson(f, o.$dateOnly)); return (_x, ctx) => String(r(ctx)).slice(0, 10); }
  if ("$gen" in o) {
    const name = String(o.$gen);
    if (!GEN_ALLOW.includes(name)) throw new Error(`farsi-mock: $gen "${name}" is not allowed. Allowed: ${GEN_ALLOW.join(", ")}`);
    const args = o.args;
    return (x) => (x as unknown as Record<string, (a?: unknown) => unknown>)[name](args);
  }
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fromJson(f, v)])) as SchemaDef;
}

export const GEN_ALLOW = [
  "mobile", "landline", "nationalId", "postalCode", "email", "cardNumber", "sheba", "accountNumber", "price", "productName", "sku",
  "orderNumber", "legalNationalId", "firstName", "lastName", "city", "gender", "uuid", "objectId", "sentence", "paragraph", "word",
  "person", "contact", "address", "bank", "company", "product", "order", "plate", "education", "street",
];
