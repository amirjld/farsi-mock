/** Small, fast, seedable PRNG (sfc32 seeded through splitmix32). Not for cryptography. */
export class Rng {
  private a = 0; private b = 0; private c = 0; private d = 0;

  constructor(seed?: number | string) { this.seed(seed ?? randomSeed()); }

  seed(seed: number | string): void {
    let s = typeof seed === "string" ? hashString(seed) : seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min = 0, max = 1, decimals?: number): number {
    const v = min + this.next() * (max - min);
    return decimals === undefined ? v : Number(v.toFixed(decimals));
  }

  bool(probability = 0.5): boolean { return this.next() < probability; }

  pick<T>(list: readonly T[]): T {
    if (!list.length) throw new Error("mock-iran: cannot pick from an empty list");
    return list[Math.floor(this.next() * list.length)];
  }

  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [v, w] of entries) { if ((r -= w) < 0) return v; }
    return entries[entries.length - 1][0];
  }

  digits(n: number, chars = "0123456789"): string {
    let s = "";
    for (let i = 0; i < n; i++) s += chars[Math.floor(this.next() * chars.length)];
    return s;
  }

  shuffle<T>(list: readonly T[]): T[] {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function randomSeed(): number { return Math.floor(Math.random() * 4294967296); }
