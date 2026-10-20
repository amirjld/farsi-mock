import { describe, it, expect } from "vitest";
import { createIran } from "../src/index.js";
import { CATEGORIES } from "../src/data/misc.js";
import { CITY_GEO } from "../src/data/geo.js";
import { PROVINCES } from "../src/data/places.js";
import { validatePostalCode } from "./parsi/phone.js";

const f = createIran({ seed: 77, referenceDate: "2026-10-20T08:00:00Z" });
const ZWNJ = "\u200c";
const NON_JOINING = "اآأدذرزژو";

describe("names", () => {
  it("compound surnames follow ZWNJ rules", () => {
    const names = Array.from({ length: 3000 }, () => f.lastName());
    const compound = names.filter((n) => /(زاده|پور|نیا|فر|نژاد|راد|منش|وند|خانی|لو)$/.test(n));
    expect(compound.length).toBeGreaterThan(200);
    for (const n of names) {
      expect(n).not.toMatch(/\s/);
      expect(n).not.toMatch(new RegExp(`${ZWNJ}${ZWNJ}|^${ZWNJ}|${ZWNJ}$`));
      const i = n.indexOf(ZWNJ);
      if (i > 0) expect(NON_JOINING).not.toContain(n[i - 1]);
      expect(n).not.toMatch(/ییی/);
    }
    // a root ending in a non-joining letter is glued without ZWNJ (e.g. بهرام + ی)
    expect(names.some((n) => !n.includes(ZWNJ) && /(زاده|پور)$/.test(n))).toBe(true);
  });
  it("Latin surnames have no spaces and match", () => {
    for (let i = 0; i < 500; i++) expect(f.lastName({ en: true })).toMatch(/^[A-Z][a-zA-Z'-]+$/);
  });
  it("unisex names appear rarely", () => {
    const ps = Array.from({ length: 4000 }, () => f.person());
    const uni = ps.filter((p) => ["آریا", "آذر", "نیکو", "روشن", "مهر", "شمیم", "صدف"].includes(p.firstName)).length;
    expect(uni).toBeGreaterThan(20);
    expect(uni).toBeLessThan(400);
  });
});

describe("addresses & geo", () => {
  it("street patterns and Persian digits", () => {
    const streets = Array.from({ length: 1000 }, () => f.street());
    expect(streets.some((s) => s.includes("شهید"))).toBe(true);
    expect(streets.some((s) => s.startsWith("بلوار"))).toBe(true);
    expect(streets.some((s) => s.includes("متری"))).toBe(true);
    for (const s of streets) expect(s).toMatch(/^(خیابان|بلوار) \S/);
  });
  it("coordinates fall inside the city radius from GeoNames", () => {
    for (let i = 0; i < 500; i++) {
      const a = f.address();
      const p = PROVINCES.find((x) => x.fa === a.province)!;
      const g = CITY_GEO[`${p.iso}|${a.city}`];
      if (!g) continue;
      const dy = (a.latitude - g[0]) * 111.32, dx = (a.longitude - g[1]) * 111.32 * Math.cos((g[0] * Math.PI) / 180);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(g[2] + 0.05);
      expect(validatePostalCode(a.postalCode).valid).toBe(true);
    }
  });
  it("almost every city has a GeoNames point inside Iran", () => {
    const cities = PROVINCES.flatMap((p) => p.cities.map((c) => `${p.iso}|${c.fa}`));
    const have = cities.filter((k) => CITY_GEO[k]);
    expect(have.length / cities.length).toBeGreaterThan(0.95);
    for (const k of have) {
      const [lat, lng, r] = CITY_GEO[k];
      expect(lat).toBeGreaterThan(25); expect(lat).toBeLessThan(40);
      expect(lng).toBeGreaterThan(44); expect(lng).toBeLessThan(64);
      expect(r).toBeGreaterThanOrEqual(2); expect(r).toBeLessThanOrEqual(25);
    }
  });
  it("latin digits option", () => {
    const g = createIran({ seed: 1, digits: "latin" });
    expect(g.address().formatted).toMatch(/[0-9]/);
    expect(g.address().formatted).not.toMatch(/[۰-۹]/);
  });
});

describe("commerce", () => {
  it("catalog prices stay within item ranges", () => {
    for (const c of CATEGORIES) {
      for (let i = 0; i < 200; i++) {
        const p = f.product({ category: c.id });
        const item = c.items.find((x) => x.name === p.baseName)!;
        expect(item).toBeDefined();
        expect(p.price).toBeGreaterThanOrEqual(item.min * 0.9);
        expect(p.price).toBeLessThanOrEqual(item.max * 1.1);
        expect(p.unit).toBe(item.unit);
        if (p.variant) expect(item.variants).toContain(p.variant);
      }
    }
  });
  it("category aliases", () => {
    expect(f.product({ category: "electronics" }).categoryId).toBe("digital");
    expect(f.product({ category: "clothes" }).categoryId).toBe("fashion");
    expect(f.product({ category: "MDF" }).categoryId).toBe("wood");
    expect(() => f.product({ category: "spaceships" })).toThrow(/unknown category/);
  });
  it("wood/MDF catalog has sheet sizes", () => {
    const names = Array.from({ length: 200 }, () => f.productName({ category: "wood" }));
    expect(names.some((n) => /MDF|ام‌دی‌اف|نئوپان|HDF|چندلایی/.test(n))).toBe(true);
  });
  it("company types", () => {
    const cs = Array.from({ length: 500 }, () => f.company());
    expect(new Set(cs.map((c) => c.type)).size).toBeGreaterThan(4);
    for (const c of cs) {
      expect(c.name).toContain(`(${c.type})`);
      if (c.name.startsWith("موسسه")) expect(c.nameEn).toMatch(/Institute$/);
    }
  });
});

describe("plates & education", () => {
  it("plates", () => {
    for (let i = 0; i < 500; i++) {
      const p = f.plate();
      expect(p.twoDigits).toMatch(/^[1-9]{2}$/);
      expect(p.threeDigits).toMatch(/^[1-9]{3}$/);
      expect(p.regionCode).toMatch(/^[1-9]\d$/);
      expect(p.formatted).toMatch(/^[۱-۹]{2} \S+ [۱-۹]{3} ایران [۰-۹]{2}$/);
    }
    expect(f.plate({ type: "taxi" }).letter).toBe("ت");
    expect(f.plate({ type: "government", persianDigits: false }).formatted).toMatch(/^\d\d الف \d{3} ایران \d\d$/);
  });
  it("education", () => {
    const e = new Set(Array.from({ length: 500 }, () => f.education()));
    expect(e.has("کارشناسی")).toBe(true);
    expect(f.education({ en: true })).toMatch(/[A-Za-z]/);
  });
});

describe("jalali ranges & holidays", () => {
  it("between respects bounds", () => {
    for (let i = 0; i < 300; i++) {
      const d = f.jalali.between("1405/01/01", "1405/01/31");
      const j = f.jalali.of(d);
      expect(j.year).toBe(1405); expect(j.month).toBe(1);
    }
    expect(() => f.jalali.between("1405/13/01", "1405/01/01")).toThrow();
  });
  it("workdays skip Fridays and fixed holidays", () => {
    for (let i = 0; i < 300; i++) {
      const d = f.jalali.between("1405/01/01", "1405/01/20", { workdaysOnly: true, hours: [8, 17] });
      expect(d.getUTCDay()).not.toBe(5);
      expect(f.jalali.isHoliday(d)).toBe(false);
      expect(d.getUTCHours()).toBeGreaterThanOrEqual(8); expect(d.getUTCHours()).toBeLessThan(17);
    }
    const tf = createIran({ seed: 2, weekend: "thursday_friday" });
    for (let i = 0; i < 100; i++) expect([4, 5]).not.toContain(tf.jalali.recentWorkday().getUTCDay());
  });
  it("holiday list", () => {
    const h = f.jalali.holidays(1405);
    expect(h[0]).toMatchObject({ jalali: "1405/01/01", gregorian: "2026-03-21", nameEn: "Nowruz" });
    expect(f.jalali.isHoliday(new Date("2026-03-21T10:00:00Z"))).toBe(true);
    expect(f.jalali.isHoliday(new Date("2026-03-25T10:00:00Z"))).toBe(false);
    expect(h.every((x) => typeof x.weekday === "string")).toBe(true);
  });
  it("dateTime", () => {
    expect(f.jalali.dateTime("2026-10-20T08:30:00Z")).toBe("1405/07/28 08:30");
  });
});

describe("helpers", () => {
  it("deterministic and well-behaved", () => {
    const a = createIran({ seed: 5 }), b = createIran({ seed: 5 });
    expect(a.helpers.shuffle([1, 2, 3, 4, 5])).toEqual(b.helpers.shuffle([1, 2, 3, 4, 5]));
    expect(a.helpers.arrayElements([1, 2, 3, 4], 2)).toHaveLength(2);
    const w = Array.from({ length: 2000 }, () => a.helpers.weightedArrayElement([{ weight: 9, value: "a" }, { weight: 1, value: "b" }]));
    expect(w.filter((x) => x === "a").length).toBeGreaterThan(1600);
    expect(a.helpers.weightedArrayElement([["x", 1]])).toBe("x");
    expect(a.helpers.replaceSymbols("##-??")).toMatch(/^\d\d-[A-Z]{2}$/);
    expect(a.helpers.fromRegExp(/^09[0-3]\d{8}$/)).toMatch(/^09[0-3]\d{8}$/);
    expect(a.helpers.fromRegExp("[A-Z]{3}-(ab|cd)\\d{2,4}")).toMatch(/^[A-Z]{3}-(ab|cd)\d{2,4}$/);
    expect(a.helpers.multiple(() => 1, { count: 4 })).toEqual([1, 1, 1, 1]);
    expect(a.helpers.slugify("گوشی موبایل‌ Pro 12")).toBe("گوشی-موبایل-pro-12");
    const m = Array.from({ length: 1000 }, () => a.helpers.maybe(() => 1, { probability: 0.3 }));
    expect(m.filter(Boolean).length).toBeGreaterThan(200); expect(m.filter(Boolean).length).toBeLessThan(400);
  });
  it("unique store", () => {
    const g = createIran({ seed: 9 });
    const vals = Array.from({ length: 10 }, () => g.helpers.unique(() => g.int(1, 10), { key: "d" }));
    expect(new Set(vals).size).toBe(10);
    expect(() => g.helpers.unique(() => g.int(1, 10), { key: "d", maxRetries: 50 })).toThrow(/unique/);
    g.helpers.resetUnique("d");
    expect(g.helpers.unique(() => g.int(1, 10), { key: "d" })).toBeTypeOf("number");
    expect(g.helpers.uniqueArray(() => g.int(1, 100), 30)).toHaveLength(30);
  });
});
