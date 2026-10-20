import type { Rng } from "./rng.js";

export interface Helpers {
  /** Random element. */
  arrayElement<T>(list: readonly T[]): T;
  /** `count` distinct elements (default: random 1..length), in random order. */
  arrayElements<T>(list: readonly T[], count?: number | { min: number; max: number }): T[];
  shuffle<T>(list: readonly T[]): T[];
  /** Weighted pick: [{ weight, value }] (faker style) or [[value, weight]]. */
  weightedArrayElement<T>(list: readonly { weight: number; value: T }[] | readonly (readonly [T, number])[]): T;
  /** Run `fn` with probability (default 0.5), else undefined. */
  maybe<T>(fn: () => T, opts?: { probability?: number }): T | undefined;
  /** Call `fn` until it returns a value not seen before under `key` (shared store, reset by seed()). */
  unique<T>(fn: () => T, opts?: { key?: string; maxRetries?: number }): T;
  resetUnique(key?: string): void;
  /** n unique values from fn. */
  uniqueArray<T>(fn: () => T, n: number): T[];
  /** Repeat fn: count or { min, max }. */
  multiple<T>(fn: (i: number) => T, opts?: { count?: number | { min: number; max: number } }): T[];
  /** "#" -> digit, "?" -> Latin letter, "*" -> digit or letter, "@" -> Persian letter. */
  replaceSymbols(pattern: string): string;
  /** Integer in a range object. */
  rangeToNumber(range: number | { min: number; max: number }): number;
  /** Tiny regex-ish generator for common patterns: char classes, \d \w, {n} {m,n}, ?, literals. */
  fromRegExp(pattern: string | RegExp): string;
  /** Slug from Latin or Persian text (keeps Persian letters, joins with "-"). */
  slugify(text: string): string;
}

const LATIN = "abcdefghijklmnopqrstuvwxyz";
const FA = "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی";

export function createHelpers(rng: Rng): Helpers {
  const seen = new Map<string, Set<unknown>>();
  const count = (c: number | { min: number; max: number } | undefined, dflt: () => number) =>
    c === undefined ? dflt() : typeof c === "number" ? c : rng.int(c.min, c.max);
  const h: Helpers = {
    arrayElement: (list) => rng.pick(list),
    arrayElements: (list, c) => rng.shuffle(list).slice(0, Math.min(list.length, count(c, () => rng.int(1, Math.max(1, list.length))))),
    shuffle: (list) => rng.shuffle(list),
    weightedArrayElement: <T>(list: readonly { weight: number; value: T }[] | readonly (readonly [T, number])[]) => {
      const entries = (list as readonly unknown[]).map((e) => (Array.isArray(e) ? e : [(e as { value: T }).value, (e as { weight: number }).weight])) as [T, number][];
      return rng.weighted(entries);
    },
    maybe: (fn, opts = {}) => (rng.bool(opts.probability ?? 0.5) ? fn() : undefined),
    unique: (fn, opts = {}) => {
      const key = opts.key ?? fn.toString();
      let set = seen.get(key);
      if (!set) seen.set(key, (set = new Set()));
      const max = opts.maxRetries ?? 500;
      for (let i = 0; i < max; i++) {
        const v = fn();
        const k = typeof v === "object" ? JSON.stringify(v) : v;
        if (!set.has(k)) { set.add(k); return v; }
      }
      throw new Error(`farsi-mock: unique() gave up after ${max} tries; the generator has too few distinct values`);
    },
    resetUnique: (key) => { if (key) seen.delete(key); else seen.clear(); },
    uniqueArray: (fn, n) => {
      const out = new Set<ReturnType<typeof fn>>();
      for (let i = 0; out.size < n; i++) { if (i > n * 50 + 500) throw new Error("farsi-mock: uniqueArray could not find enough distinct values"); out.add(fn()); }
      return [...out];
    },
    multiple: (fn, opts = {}) => Array.from({ length: count(opts.count, () => 3) }, (_, i) => fn(i)),
    replaceSymbols: (pattern) => pattern.replace(/[#?*@]/g, (c) =>
      c === "#" ? rng.digits(1) : c === "?" ? rng.pick(LATIN.split("")).toUpperCase() : c === "@" ? rng.pick(FA.split("")) : rng.pick((LATIN + "0123456789").split(""))),
    rangeToNumber: (r) => (typeof r === "number" ? r : rng.int(r.min, r.max)),
    fromRegExp: (pattern) => genRegex(typeof pattern === "string" ? pattern : pattern.source, rng),
    slugify: (text) => text.trim().toLowerCase().replace(/[\u200c\s_]+/g, "-").replace(/[^a-z0-9\u0600-\u06ff-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, ""),
  };
  return h;
}

/** Minimal generator for simple regexes (no backrefs/lookarounds/alternation groups beyond a|b). */
export function genRegex(src: string, rng: Rng): string {
  let i = 0;
  const s = src.replace(/^\^/, "").replace(/\$$/, "");
  const out: string[] = [];
  const classChars = (body: string): string[] => {
    const neg = body.startsWith("^");
    if (neg) body = body.slice(1);
    const chars: string[] = [];
    for (let k = 0; k < body.length; k++) {
      let c = body[k];
      if (c === "\\") { const e = body[++k]; chars.push(...escapeChars(e)); continue; }
      if (body[k + 1] === "-" && k + 2 < body.length) {
        const end = body[k + 2];
        for (let x = c.charCodeAt(0); x <= end.charCodeAt(0); x++) chars.push(String.fromCharCode(x));
        k += 2; continue;
      }
      chars.push(c);
    }
    if (!neg) return chars;
    const pool = (LATIN + LATIN.toUpperCase() + "0123456789").split("");
    return pool.filter((c) => !chars.includes(c));
  };
  const escapeChars = (e: string): string[] => {
    if (e === "d") return "0123456789".split("");
    if (e === "w") return (LATIN + LATIN.toUpperCase() + "0123456789_").split("");
    if (e === "s") return [" "];
    return [e];
  };
  while (i < s.length) {
    let atom: () => string;
    const c = s[i];
    if (c === "[") {
      const end = s.indexOf("]", i + 1);
      const chars = classChars(s.slice(i + 1, end));
      atom = () => rng.pick(chars);
      i = end + 1;
    } else if (c === "(") {
      let depth = 1, j = i + 1;
      while (j < s.length && depth) { if (s[j] === "(") depth++; else if (s[j] === ")") depth--; j++; }
      const inner = s.slice(i + 1, j - 1).replace(/^\?:/, "");
      const alts = inner.split("|");
      atom = () => genRegex(rng.pick(alts), rng);
      i = j;
    } else if (c === "\\") { const chars = escapeChars(s[i + 1]); atom = () => rng.pick(chars); i += 2; }
    else if (c === ".") { atom = () => rng.pick(LATIN.split("")); i++; }
    else { atom = () => c; i++; }
    let min = 1, max = 1;
    if (s[i] === "{") {
      const end = s.indexOf("}", i);
      const [a, b] = s.slice(i + 1, end).split(",");
      min = Number(a); max = b === undefined ? min : b === "" ? min + 5 : Number(b);
      i = end + 1;
    } else if (s[i] === "?") { min = 0; max = 1; i++; }
    else if (s[i] === "*") { min = 0; max = 5; i++; }
    else if (s[i] === "+") { min = 1; max = 6; i++; }
    const n = rng.int(min, max);
    for (let k = 0; k < n; k++) out.push(atom());
  }
  return out.join("");
}
