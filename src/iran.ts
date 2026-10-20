import { Rng } from "./rng.js";
import { PROVINCES, type ProvinceData, type City } from "./data/places.js";
import { BANKS, type BankData } from "./data/banks.js";
import { MALE_NAMES, FEMALE_NAMES, UNISEX_NAMES, LAST_NAMES, SURNAME_ROOTS, SURNAME_SUFFIXES, BLOCKED_FULL_NAMES, type Name } from "./data/names.js";
import { CITY_GEO } from "./data/geo.js";
import { FIXED_SOLAR_HOLIDAYS } from "./data/holidays.js";
import {
  MOBILE_PREFIXES, OPERATOR_WEIGHTS, type Operator, STREETS, STREET_TYPES, ALLEYS, DISTRICTS, EMAIL_DOMAINS,
  COMPANY_WORDS, COMPANY_FIELDS, COMPANY_TYPES, CATEGORIES, COLORS, ORDER_STATUSES, ORDER_STATUS_WEIGHTS,
  PAYMENT_METHODS, SHIPPING_METHODS, WORDS, STREET_WIDTHS, PLATE_LETTERS, EDUCATION_LEVELS, type Category, type CatalogItem, type PlateType,
} from "./data/misc.js";
import { jalaliOf, formatGregorian, toPersianDigits, toGregorian, toJalali, jalaliMonthLength, parseJalali } from "./jalali.js";
import { createHelpers, type Helpers } from "./helpers.js";
import { nationalIdCheckDigit, luhnCheckDigit, shebaCheckDigits, legalCheckDigit } from "./validate.js";
import { createPresets } from "./presets.js";
import { Schema, type SchemaDef, type SchemaOptions, ArrayMarker, UniqueMarker, OptionalMarker, OneOfMarker, type Gen, type RecordContext, makeRef, type RefSource, generateDataset, type DatasetSpec, type DatasetResult, type RefOptions } from "./schema.js";
import type { Infer, InferGen } from "./types.js";
import * as inference from "./infer/index.js";

export type Gender = "male" | "female";
export type ProvinceInput = string;
export type { Operator, PlateType };
export type DigitsMode = "fa" | "latin";

export interface Province { iso: string; name: string; nameEn: string; areaCode: string }
export interface Person {
  gender: Gender; firstName: string; lastName: string; fullName: string;
  firstNameEn: string; lastNameEn: string; fullNameEn: string;
  fatherName: string; birthDate: string; birthDateJalali: string; age: number;
  nationalId: string; birthProvince: string; birthCity: string;
}
export interface Contact { mobile: string; operator: Operator; landline: string; email: string; postalCode: string }
export interface Address {
  province: string; provinceEn: string; provinceIso: string; provinceId: number; city: string; cityEn: string;
  district: string; street: string; alley: string; plaque: string; floor: number; unit: number;
  postalCode: string; latitude: number; longitude: number; line: string; formatted: string;
}
export interface BankAccount { bankId: string; bankName: string; bankNameEn: string; cardNumber: string; sheba: string; accountNumber: string }
export interface Company {
  name: string; nameEn: string; type: string; typeEn: string; legalNationalId: string; economicCode: string;
  registrationNumber: string; landline: string; province: string; city: string;
}
export interface Product { sku: string; name: string; baseName: string; variant: string | null; category: string; categoryEn: string; categoryId: string; price: number; unit: string; color: string; description: string }
export interface Plate { formatted: string; twoDigits: string; letter: string; threeDigits: string; regionCode: string; type: PlateType }
export interface Holiday { jalali: string; gregorian: string; name: string; nameEn: string; weekday: string }
export interface OrderItem { sku: string; name: string; quantity: number; unitPrice: number; total: number }
export interface Order {
  orderNumber: string; status: string; items: OrderItem[]; subtotal: number; discount: number; shipping: number;
  tax: number; total: number; currency: "IRT"; paymentMethod: string; shippingMethod: string; createdAt: string; createdAtJalali: string;
}

export interface IranOptions {
  seed?: number | string;
  referenceDate?: Date | string;
  /** National IDs use real issuing-office prefixes of the birth city instead of the safe, never-issued "000" prefix. Default false. */
  realisticIds?: boolean;
  /**
   * Digits in generated *text*. Default: data fields (IDs, phones, postal codes) use Latin digits and
   * formatted text (address.formatted, plate.formatted) uses Persian digits. "latin" or "fa" forces
   * one script; schemas also convert every string field with their own `digits` option.
   */
  digits?: DigitsMode;
  /** Weekend used by workday helpers. Default "friday". */
  weekend?: "friday" | "thursday_friday";
}

const DAY = 86_400_000;
const normalize = (s: string) => s.trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\s\u200c-]+/g, "");

export class Iran {
  readonly rng: Rng;
  private refDate?: Date;
  /** Default for nationalId({ realistic }). */
  realisticIds: boolean;
  digitsMode?: DigitsMode;
  weekend: "friday" | "thursday_friday";
  /** Faker-style helpers: arrayElement, weightedArrayElement, maybe, unique, replaceSymbols, ... */
  readonly helpers: Helpers;

  constructor(opts: IranOptions = {}) {
    this.rng = new Rng(opts.seed);
    this.realisticIds = opts.realisticIds ?? false;
    this.digitsMode = opts.digits;
    this.weekend = opts.weekend ?? "friday";
    this.helpers = createHelpers(this.rng);
    if (opts.referenceDate) this.setReferenceDate(opts.referenceDate);
  }

  /** Reset the PRNG. Same seed, same calls => same output. */
  seed(seed: number | string): this { this.rng.seed(seed); this.helpers.resetUnique(); return this; }

  /** Fix "now" for date generators (makes dates deterministic too). */
  setReferenceDate(date: Date | string | undefined): this {
    this.refDate = date === undefined ? undefined : new Date(date);
    if (this.refDate && isNaN(this.refDate.getTime())) throw new Error("farsi-mock: invalid reference date");
    return this;
  }
  now(): Date { return this.refDate ? new Date(this.refDate) : new Date(); }

  // ---------- helpers ----------
  int(min = 0, max = 1000): number { return this.rng.int(min, max); }
  float(min = 0, max = 1, decimals = 2): number { return this.rng.float(min, max, decimals); }
  bool(probability = 0.5): boolean { return this.rng.bool(probability); }
  pick<T>(list: readonly T[]): T { return this.rng.pick(list); }
  digits(n: number): string { return this.rng.digits(n); }
  uuid(): string {
    const h = this.rng.digits(32, "0123456789abcdef").split("");
    h[12] = "4"; h[16] = "89ab"[this.rng.int(0, 3)];
    const s = h.join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  /** 24-char hex Mongo ObjectId; the timestamp part falls within the last 2 years. */
  objectId(): string {
    const ts = Math.floor(this.now().getTime() / 1000) - this.rng.int(0, 2 * 365 * 86400);
    return ts.toString(16).padStart(8, "0") + this.rng.digits(16, "0123456789abcdef");
  }
  /** Repeat a generator. */
  many<T>(gen: (i: number) => T, n: number): T[] { return Array.from({ length: n }, (_, i) => gen(i)); }
  /** Schema helper: an array field of `n` (or a random length in [min, max]) items. */
  array<const G extends Gen>(n: number | readonly [number, number], gen: G): ArrayMarker<G> { return new ArrayMarker(n, gen); }
  /** Schema helper: pick a field from a record of another schema / array / dataset entity. */
  ref(source: RefSource, field: string | RefOptions = "id") { return makeRef(source, field); }
  /** Schema helper: values of this field are unique within a many() call (retries, then throws). */
  unique<R>(gen: (f: Iran, ctx: RecordContext) => R, opts?: { maxRetries?: number }): UniqueMarker<(f: Iran, ctx: RecordContext) => R>;
  unique<const G extends Gen>(gen: G, opts?: { maxRetries?: number }): UniqueMarker<G>;
  unique(gen: Gen, opts: { maxRetries?: number } = {}): UniqueMarker<Gen> { return new UniqueMarker(gen, opts.maxRetries ?? 200); }
  /** Schema helper: null with probability `rate` (default 0.2). */
  nullable<R>(gen: (f: Iran, ctx: RecordContext) => R, rate?: number): OptionalMarker<(f: Iran, ctx: RecordContext) => R, null>;
  nullable<const G extends Gen>(gen: G, rate?: number): OptionalMarker<G, null>;
  nullable(gen: Gen, rate = 0.2): OptionalMarker<Gen, null> { return new OptionalMarker(gen, rate, "null"); }
  /** Schema helper: the field is left out with probability `rate` (default 0.2). */
  optional<R>(gen: (f: Iran, ctx: RecordContext) => R, rate?: number): OptionalMarker<(f: Iran, ctx: RecordContext) => R, undefined>;
  optional<const G extends Gen>(gen: G, rate?: number): OptionalMarker<G, undefined>;
  optional(gen: Gen, rate = 0.2): OptionalMarker<Gen, undefined> { return new OptionalMarker(gen, rate, "omit"); }
  /** Schema helper: weighted pick of literal values, e.g. weighted([["active", 8], ["banned", 1]]). */
  weighted<T>(entries: readonly (readonly [T, number])[]): () => T { return () => this.rng.weighted(entries); }
  /** Schema helper: one of several generators (paths, functions, ...), picked uniformly. */
  oneOf<const G extends readonly Gen[]>(...gens: G): OneOfMarker<G> { return new OneOfMarker(gens); }

  // ---------- places ----------
  provinces(): Province[] { return PROVINCES.map(toProvince); }
  /** Resolve a province by Persian name, English name or ISO code. */
  findProvince(input: ProvinceInput): ProvinceData {
    const q = normalize(input);
    const p = PROVINCES.find((x) => [x.fa, x.en, x.iso, x.iso.slice(3)].some((v) => normalize(v) === q));
    if (!p) throw new Error(`farsi-mock: unknown province "${input}". Use a Persian/English name or ISO code like IR-10.`);
    return p;
  }
  /** @internal */ provinceData(input?: ProvinceInput): ProvinceData {
    if (input) return this.findProvince(input);
    // weight by a rough population proxy: provinces listing more cities get picked a bit more; Tehran boosted
    return this.rng.weighted(PROVINCES.map((p) => [p, p.iso === "IR-23" ? 12 : p.iso === "IR-09" || p.iso === "IR-10" ? 5 : 2 + p.cities.length / 2] as const));
  }
  /** @internal */ cityData(p: ProvinceData, city?: string): City {
    if (city) {
      const c = p.cities.find((x) => normalize(x.fa) === normalize(city) || normalize(x.en) === normalize(city));
      if (c) return c;
      return { fa: city, en: city, nidPrefixes: [] };
    }
    return this.rng.bool(0.55) ? p.cities[0] : this.rng.pick(p.cities);
  }
  province(opts: { province?: ProvinceInput } = {}): Province { return toProvince(this.provinceData(opts.province)); }
  city(opts: { province?: ProvinceInput } = {}): string { return this.cityData(this.provinceData(opts.province)).fa; }

  // ---------- person ----------
  gender(): Gender { return this.rng.bool() ? "male" : "female"; }
  firstName(opts: { gender?: Gender; en?: boolean } = {}): string {
    const n = this.firstNameData(opts.gender ?? this.gender());
    return opts.en ? n[1] : n[0];
  }
  lastName(opts: { en?: boolean } = {}): string { const n = this.lastNameData(); return opts.en ? n[1] : n[0]; }
  /** @internal */ firstNameData(gender: Gender): Name {
    if (this.rng.bool(0.04)) return this.rng.pick(UNISEX_NAMES);
    return this.rng.pick(gender === "male" ? MALE_NAMES : FEMALE_NAMES);
  }
  /** @internal 70% common surnames, 30% compound root + suffix (کریم‌پور, رضایی, ...). */
  lastNameData(): Name {
    if (this.rng.bool(0.7)) return this.rng.pick(LAST_NAMES);
    for (;;) {
      const [rf, re] = this.rng.pick(SURNAME_ROOTS);
      const [sf, se] = this.rng.pick(SURNAME_SUFFIXES);
      const n = joinSurname(rf, re, sf, se);
      if (n) return n;
    }
  }

  /**
   * Valid national ID (کد ملی). Safe by default: the 3-digit prefix is "000", which is in no
   * published issuing-office table, so the ID cannot belong to a real person. With
   * `realistic: true` (or `createIran({ realisticIds: true })`) the prefix is a real issuing-office
   * code of the given province/city instead. Some systems reject the 000 prefix.
   */
  nationalId(opts: { province?: ProvinceInput; city?: string; realistic?: boolean } = {}): string {
    let prefix: string;
    if (!(opts.realistic ?? this.realisticIds)) prefix = "000";
    else {
      const p = this.provinceData(opts.province);
      const c = this.cityData(p, opts.city);
      prefix = this.rng.pick(c.nidPrefixes.length ? c.nidPrefixes : p.cities[0].nidPrefixes);
    }
    for (;;) {
      const body = prefix + this.rng.digits(6);
      const id = body + nationalIdCheckDigit(body);
      if (!/^(\d)\1{9}$/.test(id)) return id;
    }
  }

  birthDate(opts: { minAge?: number; maxAge?: number } = {}): { date: Date; gregorian: string; jalali: string; age: number } {
    const { minAge = 18, maxAge = 70 } = opts;
    const now = this.now();
    const ms = now.getTime() - this.rng.int(Math.round(minAge * 365.25), Math.round(maxAge * 365.25 - 1)) * DAY;
    const date = new Date(Math.floor(ms / DAY) * DAY);
    let age = now.getUTCFullYear() - date.getUTCFullYear();
    if (now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age--;
    return { date, gregorian: formatGregorian(date), jalali: jalaliOf(date).formatted, age };
  }

  person(opts: { gender?: Gender; province?: ProvinceInput; city?: string; minAge?: number; maxAge?: number; realisticIds?: boolean } = {}): Person {
    const gender = opts.gender ?? this.gender();
    const p = this.provinceData(opts.province);
    const c = this.cityData(p, opts.city);
    let first, last;
    do {
      first = this.firstNameData(gender);
      last = this.lastNameData();
    } while (BLOCKED_FULL_NAMES.has(`${first[0]} ${last[0]}`));
    let father;
    do father = this.rng.pick(MALE_NAMES); while (father[0] === first[0]);
    const b = this.birthDate(opts);
    return {
      gender, firstName: first[0], lastName: last[0], fullName: `${first[0]} ${last[0]}`,
      firstNameEn: first[1], lastNameEn: last[1], fullNameEn: `${first[1]} ${last[1]}`,
      fatherName: father[0], birthDate: b.gregorian, birthDateJalali: b.jalali, age: b.age,
      nationalId: this.nationalId({ province: p.iso, city: c.fa, realistic: opts.realisticIds }),
      birthProvince: p.fa, birthCity: c.fa,
    };
  }

  // ---------- contact ----------
  mobile(opts: { operator?: Operator | Lowercase<Operator>; format?: "local" | "international" | "e164" | "short" } = {}): string {
    const op = opts.operator ? canonicalOperator(opts.operator) : this.rng.weighted(OPERATOR_WEIGHTS);
    const n = this.rng.pick(MOBILE_PREFIXES[op]) + this.rng.digits(7);
    return formatMobile(n, opts.format);
  }
  mobileWithOperator(opts: { operator?: Operator | Lowercase<Operator> } = {}): { mobile: string; operator: Operator } {
    const operator = opts.operator ? canonicalOperator(opts.operator) : this.rng.weighted(OPERATOR_WEIGHTS);
    return { mobile: this.rng.pick(MOBILE_PREFIXES[operator]) + this.rng.digits(7), operator };
  }
  /** Landline: 0 + 2-digit province area code + 8 digits, e.g. 03132456789. */
  landline(opts: { province?: ProvinceInput } = {}): string {
    return "0" + this.provinceData(opts.province).areaCode + this.rng.pick("2345678".split("")) + this.rng.digits(7);
  }
  postalCode(opts: { dashed?: boolean } = {}): string {
    let first4: string;
    do first4 = this.rng.digits(4, "13456789"); while (/^(\d)\1{3}$/.test(first4));
    const code = first4 + this.rng.digits(1, "134679") + this.rng.digits(5, "013456789");
    return opts.dashed ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
  }
  /** Email on reserved example.* domains by default, so nothing ever reaches a real inbox. */
  email(opts: { firstNameEn?: string; lastNameEn?: string; domains?: string[] } = {}): string {
    const f = (opts.firstNameEn ?? this.firstName({ en: true })).toLowerCase().replace(/[^a-z]/g, "");
    const l = (opts.lastNameEn ?? this.lastName({ en: true })).toLowerCase().replace(/[^a-z]/g, "");
    const sep = this.rng.pick([".", "_", ""]);
    const local = this.rng.pick([`${f}${sep}${l}`, `${f}${sep}${l}${this.rng.int(1, 99)}`, `${f[0]}${sep}${l}`, `${f}${this.rng.int(1360, 1395)}`]);
    return `${local}@${this.rng.pick(opts.domains?.length ? opts.domains : EMAIL_DOMAINS)}`;
  }
  contact(opts: { province?: ProvinceInput; operator?: Operator | Lowercase<Operator>; person?: Pick<Person, "firstNameEn" | "lastNameEn">; emailDomains?: string[] } = {}): Contact {
    const m = this.mobileWithOperator({ operator: opts.operator });
    return {
      mobile: m.mobile, operator: m.operator, landline: this.landline({ province: opts.province }),
      email: this.email({ ...opts.person, domains: opts.emailDomains }), postalCode: this.postalCode(),
    };
  }

  // ---------- address ----------
  address(opts: { province?: ProvinceInput; city?: string; persianDigits?: boolean } = {}): Address {
    const p = this.provinceData(opts.province);
    const c = this.cityData(p, opts.city);
    const street = this.street();
    const alley = this.alley();
    const plaque = String(this.rng.int(1, 250));
    const floor = this.rng.int(0, 8);
    const unit = floor === 0 ? 1 : this.rng.int(1, 4) + (floor - 1) * 2;
    const district = this.rng.pick(DISTRICTS);
    const postalCode = this.postalCode();
    const dg = (opts.persianDigits ?? this.digitsMode !== "latin") ? toPersianDigits : (x: string) => x;
    const geo = this.cityPoint(p, c);
    const floorText = floor === 0 ? "همکف" : `طبقه ${floor}`;
    const line = dg(`${district}، ${street}، ${alley}، پلاک ${plaque}، ${floorText}، واحد ${unit}`);
    return {
      province: p.fa, provinceEn: p.en, provinceIso: p.iso, provinceId: PROVINCES.indexOf(p) + 1,
      city: c.fa, cityEn: c.en, district, street, alley, plaque, floor, unit, postalCode,
      latitude: geo.latitude, longitude: geo.longitude,
      line,
      formatted: `${p.fa}، ${c.fa}، ${line}، ${dg(`کد پستی ${postalCode}`)}`,
    };
  }

  /** Street in common Iranian patterns: «خیابان آزادی»، «بلوار شهید کریمی»، «خیابان بیست‌متری». */
  street(): string {
    const t = this.rng.pick(STREET_TYPES);
    const r = this.rng.next();
    if (r < 0.25) return `${t} شهید ${this.lastNameData()[0]}`;
    if (r < 0.33) return `خیابان ${this.rng.pick(STREET_WIDTHS)}`;
    return `${t} ${this.rng.pick(STREETS)}`;
  }
  alley(): string {
    const r = this.rng.next();
    if (r < 0.45) return `کوچه ${this.rng.pick(ALLEYS)}`;
    if (r < 0.7) return `کوچه ${this.rng.int(1, 40)}`;
    if (r < 0.9) return `کوچه شهید ${this.lastNameData()[0]}`;
    return `بن‌بست ${this.rng.pick(ALLEYS)}`;
  }
  /**
   * Random point inside a city. City centres come from GeoNames (CC BY 4.0); the radius is estimated
   * from population, so points are plausible but not guaranteed to be on land inside city limits.
   */
  cityPoint(p: ProvinceData, c: City): { latitude: number; longitude: number } {
    const g = CITY_GEO[`${p.iso}|${c.fa}`];
    const [lat, lng, radius] = g ?? [p.lat, p.lng, 6];
    const r = radius * Math.sqrt(this.rng.next()), t = this.rng.next() * 2 * Math.PI;
    const dLat = (r * Math.cos(t)) / 111.32, dLng = (r * Math.sin(t)) / (111.32 * Math.cos((lat * Math.PI) / 180));
    return { latitude: Number((lat + dLat).toFixed(6)), longitude: Number((lng + dLng).toFixed(6)) };
  }
  /** Iranian car plate, e.g. «۱۲ ب ۳۴۵ ایران ۶۷». Region codes are random (10-99), not tied to a province. */
  plate(opts: { type?: PlateType; persianDigits?: boolean } = {}): Plate {
    const type = opts.type ?? (this.rng.bool(0.9) ? "private" : this.rng.pick(["taxi", "government", "public", "disabled"] as const));
    const twoDigits = String(this.rng.int(11, 99)).replace(/0/g, String(this.rng.int(1, 9)));
    const letter = this.rng.pick(PLATE_LETTERS[type]);
    const threeDigits = String(this.rng.int(111, 999)).replace(/0/g, String(this.rng.int(1, 9)));
    const regionCode = String(this.rng.int(10, 99));
    const dg = (opts.persianDigits ?? this.digitsMode !== "latin") ? toPersianDigits : (x: string) => x;
    return { formatted: dg(`${twoDigits} ${letter} ${threeDigits} ایران ${regionCode}`), twoDigits, letter, threeDigits, regionCode, type };
  }
  /** Education level (fa/en), weighted roughly by adult population shares. */
  education(opts: { en?: boolean } = {}): string {
    const e = this.rng.weighted(EDUCATION_LEVELS.map((x) => [x, x[2]] as const));
    return opts.en ? e[1] : e[0];
  }

  // ---------- bank ----------
  banks(): { id: string; name: string; nameEn: string }[] { return BANKS.map((b) => ({ id: b.id, name: b.fa, nameEn: b.en })); }
  /** @internal */ bankData(input?: string): BankData {
    if (!input) return this.rng.pick(BANKS);
    const q = normalize(input);
    const b = BANKS.find((x) => [x.id, x.fa, x.en, x.fa.replace(/^بانک /, ""), x.shebaCode, ...x.bins].some((v) => normalize(v) === q));
    if (!b) throw new Error(`farsi-mock: unknown bank "${input}". Try one of: ${BANKS.map((x) => x.id).join(", ")}`);
    return b;
  }
  cardNumber(opts: { bank?: string; dashed?: boolean } = {}): string {
    const b = this.bankData(opts.bank);
    const body = this.rng.pick(b.bins) + this.rng.digits(9);
    const n = body + luhnCheckDigit(body);
    return opts.dashed ? n.replace(/(\d{4})(?=\d)/g, "$1-") : n;
  }
  sheba(opts: { bank?: string; accountNumber?: string } = {}): string {
    const b = this.bankData(opts.bank);
    const acct = (opts.accountNumber ?? this.accountNumber()).replace(/\D/g, "").padStart(18, "0").slice(-18);
    const bban = b.shebaCode + "0" + acct;
    return "IR" + shebaCheckDigits(bban) + bban;
  }
  accountNumber(): string { return String(this.rng.int(1, 9)) + this.rng.digits(this.rng.int(9, 12)); }
  bank(opts: { bank?: string } = {}): BankAccount {
    const b = this.bankData(opts.bank);
    const accountNumber = this.accountNumber();
    return {
      bankId: b.id, bankName: b.fa, bankNameEn: b.en,
      cardNumber: this.cardNumber({ bank: b.id }), sheba: this.sheba({ bank: b.id, accountNumber }), accountNumber,
    };
  }

  // ---------- company ----------
  /** 11-digit legal-entity national ID (شناسه ملی) with a valid check digit. */
  legalNationalId(): string {
    for (;;) {
      const body = this.rng.pick(["10", "14"]) + this.rng.digits(8);
      if (/^0{6}$/.test(body.slice(3, 9))) continue;
      return body + legalCheckDigit(body);
    }
  }
  companyName(): { fa: string; en: string; type: string; typeEn: string; entity: string } {
    const w = this.rng.shuffle(COMPANY_WORDS).slice(0, 2);
    const f = this.rng.pick(COMPANY_FIELDS);
    const t = this.rng.weighted(COMPANY_TYPES.map((x) => [x, x[2]] as const));
    return { fa: `${w[0][0]} ${f[0]} ${w[1][0]}`, en: `${w[0][1]} ${f[1]} ${w[1][1]}`, type: t[0], typeEn: t[1], entity: t[3] };
  }
  company(opts: { province?: ProvinceInput; city?: string } = {}): Company {
    const p = this.provinceData(opts.province);
    const c = this.cityData(p, opts.city);
    const n = this.companyName();
    const legalNationalId = this.legalNationalId();
    return {
      name: `${n.entity} ${n.fa} (${n.type})`, nameEn: `${n.en} ${n.entity === "موسسه" ? "Institute" : "Co."}`, type: n.type, typeEn: n.typeEn, legalNationalId,
      // Since 1398 the economic code of a legal entity is its 11-digit national ID.
      economicCode: legalNationalId,
      registrationNumber: String(this.rng.int(1000, 650000)),
      landline: this.landline({ province: p.iso }), province: p.fa, city: c.fa,
    };
  }

  // ---------- commerce ----------
  categories(): { id: string; name: string; nameEn: string }[] { return CATEGORIES.map((c) => ({ id: c.id, name: c.fa, nameEn: c.en })); }
  /** Rounded toman price. Under 1M rounds to 1,000; above that to 10,000. `psychological` gives x9,000 endings. */
  price(opts: { min?: number; max?: number; psychological?: boolean } = {}): number {
    const { min = 50_000, max = 5_000_000 } = opts;
    // log-uniform so cheap and expensive items both show up
    const v = Math.exp(this.rng.float(Math.log(Math.max(min, 1000)), Math.log(Math.max(max, min + 1))));
    const step = v >= 1_000_000 ? 10_000 : 1_000;
    let p = Math.max(step, Math.round(v / step) * step);
    if (opts.psychological && p > 10_000) p = Math.floor(p / 10_000) * 10_000 + 9_000;
    while (p > max && p - step >= step) p -= step;
    while (p < min) p += step;
    return p;
  }
  /** @internal */ categoryData(input?: string): Category {
    if (!input) return this.rng.pick(CATEGORIES);
    const q = normalize(input);
    const c = CATEGORIES.find((x) => [x.id, x.fa, x.en, ...x.aliases].some((v) => normalize(v) === q));
    if (!c) throw new Error(`farsi-mock: unknown category "${input}". Try: ${CATEGORIES.map((x) => x.id).join(", ")}`);
    return c;
  }
  /** @internal */ catalogItem(category?: string): { c: Category; item: CatalogItem; variant: string | null; name: string } {
    const c = this.categoryData(category);
    const item = this.rng.pick(c.items);
    const variant = item.variants ? this.rng.pick(item.variants) : null;
    const model = item.model ? ` مدل ${this.rng.digits(2, "ABCDEFGHKLMNPRSTVXZ")}${this.rng.int(10, 990)}` : "";
    return { c, item, variant, name: `${item.name}${variant ? " " + variant : ""}${model}` };
  }
  productName(opts: { category?: string } = {}): string { return this.catalogItem(opts.category).name; }
  sku(): string { return `SKU-${this.rng.digits(3, "ABCDEFGHKLMNPRSTVXZ")}-${this.rng.digits(5)}`; }
  /** Product from a brand-free catalog; the price range comes from the item (rough 1405 toman ranges). */
  product(opts: { category?: string; minPrice?: number; maxPrice?: number } = {}): Product {
    const { c, item, variant, name } = this.catalogItem(opts.category);
    return {
      sku: this.sku(), name, baseName: item.name, variant,
      category: c.fa, categoryEn: c.en, categoryId: c.id,
      price: this.price({ min: opts.minPrice ?? item.min, max: opts.maxPrice ?? item.max }),
      unit: item.unit, color: this.rng.pick(COLORS), description: this.sentence({ words: [8, 16] }),
    };
  }
  orderNumber(): string { return `ORD-${jalaliOf(this.now()).year}-${this.rng.digits(6)}`; }
  order(opts: { items?: number | [number, number]; taxRate?: number } = {}): Order {
    const count = Array.isArray(opts.items) ? this.rng.int(opts.items[0], opts.items[1]) : opts.items ?? this.rng.int(1, 4);
    const items = this.many(() => {
      const p = this.product();
      const quantity = this.rng.weighted([[1, 70], [2, 20], [3, 7], [5, 3]] as const);
      return { sku: p.sku, name: p.name, quantity, unitPrice: p.price, total: p.price * quantity };
    }, count);
    const subtotal = items.reduce((a, i) => a + i.total, 0);
    const discount = this.rng.bool(0.3) ? Math.round((subtotal * this.rng.pick([5, 10, 15, 20])) / 100 / 1000) * 1000 : 0;
    const ship = this.rng.pick(SHIPPING_METHODS);
    const shipping = subtotal - discount > 5_000_000 ? 0 : Math.round(this.rng.int(ship.cost[0], ship.cost[1]) / 1000) * 1000;
    const tax = Math.round(((subtotal - discount) * (opts.taxRate ?? 0.1)) / 1000) * 1000;
    const created = this.recentDate({ days: 120 });
    return {
      orderNumber: this.orderNumber(),
      status: this.rng.weighted(ORDER_STATUSES.map((s, i) => [s, ORDER_STATUS_WEIGHTS[i]] as const)),
      items, subtotal, discount, shipping, tax, total: subtotal - discount + shipping + tax, currency: "IRT",
      paymentMethod: this.rng.pick(PAYMENT_METHODS), shippingMethod: ship.fa,
      createdAt: created.toISOString(), createdAtJalali: jalaliOf(created).dateTime,
    };
  }

  // ---------- dates ----------
  /** Random moment in the last `days` days (default 30). */
  recentDate(opts: { days?: number } = {}): Date { return new Date(this.now().getTime() - this.rng.int(0, (opts.days ?? 30) * DAY)); }
  pastDate(opts: { years?: number } = {}): Date { return new Date(this.now().getTime() - this.rng.int(0, Math.round((opts.years ?? 3) * 365 * DAY))); }
  futureDate(opts: { days?: number } = {}): Date { return new Date(this.now().getTime() + this.rng.int(DAY / 24, (opts.days ?? 90) * DAY)); }
  betweenDates(from: Date | string, to: Date | string): Date {
    const a = new Date(from).getTime(), b = new Date(to).getTime();
    return new Date(this.rng.int(Math.min(a, b), Math.max(a, b)));
  }
  /** Jalali helpers. */
  readonly jalali = {
    /** Jalali parts of a date. */
    of: (date: Date | string = this.now()) => jalaliOf(new Date(date)),
    /** "1403/05/14" (no time). */
    format: (date: Date | string = this.now()) => jalaliOf(new Date(date)).formatted,
    toGregorian: (jy: number, jm: number, jd: number) => { const g = toGregorian(jy, jm, jd); return new Date(Date.UTC(g.gy, g.gm - 1, g.gd)); },
    /** Random date inside a Jalali year (default: current Jalali year). */
    inYear: (jy?: number) => {
      const y = jy ?? jalaliOf(this.now()).year;
      const jm = this.rng.int(1, 12);
      const jd = this.rng.int(1, jalaliMonthLength(y, jm));
      const g = toGregorian(y, jm, jd);
      return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, this.rng.int(0, 23), this.rng.int(0, 59)));
    },
    recent: (days = 30) => jalaliOf(this.recentDate({ days })).formatted,
    past: (years = 3) => jalaliOf(this.pastDate({ years })).formatted,
    future: (days = 90) => jalaliOf(this.futureDate({ days })).formatted,
    /** "1405/07/28 14:30" for a date (default now). */
    dateTime: (date: Date | string = this.now()) => jalaliOf(new Date(date)).dateTime,
    /** Random moment between two Jalali dates ("1405/01/01") or Dates, inclusive of both days. */
    between: (from: string | Date, to: string | Date, opts: { workdaysOnly?: boolean; hours?: [number, number] } = {}) => {
      const a = jalaliStart(from), b = jalaliStart(to) + DAY - 1;
      for (let i = 0; i < 1000; i++) {
        const d = new Date(this.rng.int(Math.min(a, b), Math.max(a, b)));
        if (opts.hours) d.setUTCHours(this.rng.int(opts.hours[0], opts.hours[1] - 1), this.rng.int(0, 59), this.rng.int(0, 59), 0);
        if (!opts.workdaysOnly || !this.jalali.isOffDay(d)) return d;
      }
      throw new Error("farsi-mock: no workday in the given range");
    },
    /** Fixed solar public holidays of a Jalali year (lunar holidays move yearly and are not included). */
    holidays: (jy?: number): Holiday[] => {
      const y = jy ?? jalaliOf(this.now()).year;
      return FIXED_SOLAR_HOLIDAYS.map((h) => {
        const d = this.jalali.toGregorian(y, h.month, h.day);
        const j = jalaliOf(d);
        return { jalali: j.formatted, gregorian: formatGregorian(d), name: h.fa, nameEn: h.en, weekday: j.weekday };
      });
    },
    /** True for fixed solar public holidays. */
    isHoliday: (date: Date | string) => {
      const d = new Date(date); const { jm, jd } = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      return FIXED_SOLAR_HOLIDAYS.some((h) => h.month === jm && h.day === jd);
    },
    /** True on the weekend (Friday, or Thursday+Friday with weekend: "thursday_friday"). */
    isWeekend: (date: Date | string) => { const w = new Date(date).getUTCDay(); return w === 5 || (this.weekend === "thursday_friday" && w === 4); },
    isOffDay: (date: Date | string) => this.jalali.isWeekend(date) || this.jalali.isHoliday(date),
    /** Random working day (not weekend, not a fixed holiday) in the last `days` days, in working hours. */
    recentWorkday: (days = 30) => {
      const to = this.now(), from = new Date(to.getTime() - days * DAY);
      return this.jalali.between(from, to, { workdaysOnly: true, hours: [8, 17] });
    },
  };

  // ---------- schema inference ----------
  /** Infer a schema from a zod object (v3 or v4; zod is not a dependency). */
  fromZod(schema: unknown, opts?: inference.InferOptions) { return inference.fromZod(this, schema, opts); }
  /** Infer from a JSON Schema object. */
  fromJsonSchema(json: unknown, opts?: inference.InferOptions) { return inference.fromJsonSchema(this, json, opts); }
  /** Infer from an OpenAPI 3 / Swagger 2 document (components.schemas / definitions). */
  fromOpenAPI(doc: unknown, opts?: inference.InferOptions) { return inference.fromOpenAPI(this, doc, opts); }
  /** Infer from schema.prisma text (parsed as text, no Prisma dependency). */
  fromPrisma(text: string, opts?: inference.InferOptions & { useDbNames?: boolean }) { return inference.fromPrisma(this, text, opts); }
  /** Infer from a mongoose Schema or definition object. */
  fromMongoose(def: unknown, opts?: inference.InferOptions & { addId?: boolean }) { return inference.fromMongoose(this, def, opts); }
  /** Infer from sample JSON records (shapes and formats only; values are not copied). */
  fromSample(json: unknown, opts?: inference.InferOptions) { return inference.fromSample(this, json, opts); }
  /** Auto-detect the input kind and infer. */
  infer(input: unknown, opts?: inference.InferOptions & { from?: inference.InferSource }) { return inference.infer(this, input, opts); }

  // ---------- text ----------
  word(): string { return this.rng.pick(WORDS); }
  sentence(opts: { words?: number | [number, number] } = {}): string {
    const w = opts.words ?? [6, 12];
    const n = Array.isArray(w) ? this.rng.int(w[0], w[1]) : w;
    return this.many(() => this.word(), n).join(" ") + ".";
  }
  paragraph(opts: { sentences?: number } = {}): string { return this.many(() => this.sentence(), opts.sentences ?? this.rng.int(2, 5)).join(" "); }

  // ---------- schema ----------
  private presetCache?: ReturnType<typeof createPresets>;
  /** Ready-made schemas: user, seller, address, product, order. */
  get presets(): ReturnType<typeof createPresets> { return (this.presetCache ??= createPresets(this)); }

  /** Define a record shape with your own field names. See README. */
  schema<const D extends SchemaDef>(def: D, opts: SchemaOptions = {}): Schema<Infer<D>> { return new Schema<Infer<D>>(this, def, opts); }
  /** Generate several related schemas at once; refs can point at earlier entities by name ("ref:users.id"). */
  dataset<const S extends DatasetSpec>(spec: S): DatasetResult<S> { return generateDataset(this, spec as DatasetSpec) as unknown as DatasetResult<S>; }
}

function toProvince(p: ProvinceData): Province { return { iso: p.iso, name: p.fa, nameEn: p.en, areaCode: "0" + p.areaCode }; }

function canonicalOperator(op: string): Operator {
  const o = op.toLowerCase();
  if (o === "mci" || o === "hamrah" || o === "hamrah-e-aval" || o === "همراه اول") return "MCI";
  if (o === "irancell" || o === "mtn" || o === "ایرانسل") return "Irancell";
  if (o === "rightel" || o === "رایتل") return "Rightel";
  throw new Error(`farsi-mock: unknown operator "${op}" (MCI, Irancell, Rightel)`);
}

function formatMobile(n: string, f: "local" | "international" | "e164" | "short" = "local"): string {
  if (f === "e164") return "+98" + n.slice(1);
  if (f === "international") return "98" + n.slice(1);
  if (f === "short") return n.slice(1);
  return n;
}

const NON_JOINING = new Set("اآأدذرزژو".split(""));
/** Join a surname root and suffix with ZWNJ where Persian orthography needs it. */
function joinSurname(rf: string, re: string, sf: string, se: string): Name | null {
  const last = rf[rf.length - 1];
  if (sf === "ی") {
    if (last === "ی") return null;
    if (last === "ا" || last === "و") return [rf + "یی", re + "ei"];
    return [rf + "ی", re + "i"];
  }
  return [NON_JOINING.has(last) ? rf + sf : rf + "\u200c" + sf, re + se];
}

function jalaliStart(v: string | Date): number {
  if (v instanceof Date) return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  const j = parseJalali(v);
  const g = toGregorian(j.jy, j.jm, j.jd);
  return Date.UTC(g.gy, g.gm - 1, g.gd);
}

export type { InferGen };
