import { describe, it, expect } from "vitest";
import * as jalaali from "jalaali-js";
import { toJalali, toGregorian, isJalaliLeapYear, jalaliMonthLength, jalaliOf, createIran } from "../src/index.js";

describe("jalali (checked against jalaali-js)", () => {
  it("matches jalaali-js for every day 1900..2100", () => {
    for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2100, 11, 31); t += 86_400_000) {
      const d = new Date(t);
      const [gy, gm, gd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const a = toJalali(gy, gm, gd), b = jalaali.toJalaali(gy, gm, gd);
      if (a.jy !== b.jy || a.jm !== b.jm || a.jd !== b.jd) throw new Error(`mismatch at ${gy}-${gm}-${gd}`);
      const g = toGregorian(a.jy, a.jm, a.jd);
      if (g.gy !== gy || g.gm !== gm || g.gd !== gd) throw new Error(`round trip failed at ${gy}-${gm}-${gd}`);
    }
  });
  it("leap years and month lengths", () => {
    for (let y = 1300; y <= 1500; y++) {
      expect(isJalaliLeapYear(y)).toBe(jalaali.isLeapJalaaliYear(y));
      for (let m = 1; m <= 12; m++) expect(jalaliMonthLength(y, m)).toBe(jalaali.jalaaliMonthLength(y, m));
    }
  });
  it("known date: 2026-10-20 is Tuesday 28 Mehr 1405", () => {
    const j = jalaliOf(new Date("2026-10-20T12:00:00Z"));
    expect(j.formatted).toBe("1405/07/28");
    expect(j.monthName).toBe("مهر");
    expect(j.weekday).toBe("سه‌شنبه");
  });
  it("helpers", () => {
    const f = createIran({ seed: 3, referenceDate: "2026-10-20T00:00:00Z" });
    for (let i = 0; i < 200; i++) {
      const d = f.jalali.inYear(1404);
      expect(jalaliOf(d).year).toBe(1404);
      expect(f.jalali.recent(10)).toMatch(/^140[45]\/\d{2}\/\d{2}$/);
    }
    expect(f.jalali.toGregorian(1405, 1, 1).toISOString().slice(0, 10)).toBe("2026-03-21");
  });
});
