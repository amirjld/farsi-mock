import { describe, it, expect } from "vitest";
import { createIran } from "../src/index.js";
import { validateNationalId, validateCardNumber, validateSheba, normalizeMobile } from "./parsi/validators.js";
import { bankFromCard, bankFromSheba } from "./parsi/banks.js";
import { mobileOperator, landlineProvince, validatePostalCode } from "./parsi/phone.js";
import { validateLegalId } from "./parsi/legal.js";
import { PROVINCES } from "../src/data/places.js";

// Every value is checked with parsi-mcp's validators (copied in test/parsi), not with farsi-mock's own code.
const N = 2000;
const f = createIran({ seed: 1234, referenceDate: "2026-10-20T00:00:00Z" });
const real = createIran({ seed: 1234, referenceDate: "2026-10-20T00:00:00Z", realisticIds: true });

describe("person", () => {
  const people = f.many(() => f.person(), N);
  const realPeople = real.many(() => real.person(), N);
  it("national IDs are valid and safe (000 prefix) by default", () => {
    for (const p of people) { expect(validateNationalId(p.nationalId), p.nationalId).toBe(true); expect(p.nationalId.startsWith("000")).toBe(true); }
  });
  it("realisticIds: valid, and the prefix belongs to the birth city/province", () => {
    for (const p of realPeople) {
      expect(validateNationalId(p.nationalId), p.nationalId).toBe(true);
      const prov = PROVINCES.find((x) => x.fa === p.birthProvince)!;
      const city = prov.cities.find((c) => c.fa === p.birthCity)!;
      const allowed = city.nidPrefixes.length ? city.nidPrefixes : prov.cities[0].nidPrefixes;
      expect(allowed).toContain(p.nationalId.slice(0, 3));
    }
  });
  it("gender matches the first name", async () => {
    const { MALE_NAMES, FEMALE_NAMES, UNISEX_NAMES } = await import("../src/data/names.js");
    for (const p of people) {
      const list = [...(p.gender === "male" ? MALE_NAMES : FEMALE_NAMES), ...UNISEX_NAMES];
      expect(list.some((n) => n[0] === p.firstName && n[1] === p.firstNameEn)).toBe(true);
    }
  });
  it("birth dates: jalali and gregorian agree, age in range", async () => {
    const jalaali = await import("jalaali-js");
    for (const p of people) {
      const [gy, gm, gd] = p.birthDate.split("-").map(Number);
      const j = jalaali.toJalaali(gy, gm, gd);
      expect(p.birthDateJalali).toBe(`${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`);
      expect(p.age).toBeGreaterThanOrEqual(18);
      expect(p.age).toBeLessThanOrEqual(70);
    }
  });
  it("per-call realistic option overrides the instance default", () => {
    for (let i = 0; i < 200; i++) {
      const r = f.nationalId({ realistic: true, province: "Isfahan", city: "اصفهان" });
      expect(["127", "128", "129"]).toContain(r.slice(0, 3));
      expect(validateNationalId(r)).toBe(true);
      const s = real.nationalId({ realistic: false });
      expect(s.startsWith("000")).toBe(true);
      expect(validateNationalId(s)).toBe(true);
    }
  });
  it("province option is respected", () => {
    for (let i = 0; i < 100; i++) expect(f.person({ province: "Isfahan" }).birthProvince).toBe("اصفهان");
  });
});

describe("contact", () => {
  it("mobiles are valid and the operator is right", () => {
    for (let i = 0; i < N; i++) {
      const c = f.contact();
      expect(normalizeMobile(c.mobile)).toBe(c.mobile);
      expect(mobileOperator(c.mobile)?.operator).toBe(c.operator);
      expect(validatePostalCode(c.postalCode).valid, c.postalCode).toBe(true);
      expect(c.email).toMatch(/^[a-z0-9._]+@example\.(com|org|net)$/);
    }
  });
  it("operator option", () => {
    for (const op of ["MCI", "Irancell", "Rightel"] as const)
      for (let i = 0; i < 200; i++) expect(mobileOperator(f.mobile({ operator: op }))?.operator).toBe(op);
    expect(f.mobile({ operator: "irancell", format: "e164" })).toMatch(/^\+989\d{9}$/);
  });
  it("landline area code matches the province", () => {
    for (const p of PROVINCES) for (let i = 0; i < 20; i++) {
      const l = f.landline({ province: p.iso });
      expect(l).toMatch(/^0\d{10}$/);
      expect(landlineProvince(l).province?.en).toBe(p.en);
    }
  });
});

describe("bank", () => {
  it("cards pass Luhn, Shebas pass mod-97, both point at the same bank", () => {
    for (let i = 0; i < N; i++) {
      const b = f.bank();
      expect(validateCardNumber(b.cardNumber), b.cardNumber).toBe(true);
      expect(validateSheba(b.sheba), b.sheba).toBe(true);
      const fromCard = bankFromCard(b.cardNumber).bank;
      const fromSheba = bankFromSheba(b.sheba).bank;
      expect(fromCard?.en).toBe(b.bankNameEn);
      expect(fromSheba?.en).toBe(b.bankNameEn);
      expect(b.sheba.endsWith(b.accountNumber)).toBe(true);
    }
  });
  it("bank option by id / Persian name", () => {
    expect(bankFromCard(f.cardNumber({ bank: "mellat" })).bank?.en).toBe("Bank Mellat");
    expect(bankFromSheba(f.sheba({ bank: "ملی ایران" })).bank?.en).toBe("Bank Melli Iran");
    expect(() => f.cardNumber({ bank: "nope" })).toThrow(/unknown bank/);
  });
});

describe("company", () => {
  it("legal national IDs are valid", () => {
    for (let i = 0; i < N; i++) {
      const c = f.company();
      expect(validateLegalId(c.legalNationalId), c.legalNationalId).toEqual({ valid: true });
      expect(c.economicCode).toBe(c.legalNationalId);
      expect(/^(شرکت|موسسه) /.test(c.name)).toBe(true);
      expect(landlineProvince(c.landline).province?.fa).toBe(c.province);
    }
  });
});

describe("address", () => {
  it("postal codes valid, city belongs to province, Persian-digit formatting", () => {
    for (let i = 0; i < N; i++) {
      const a = f.address();
      expect(validatePostalCode(a.postalCode).valid).toBe(true);
      const prov = PROVINCES.find((p) => p.fa === a.province)!;
      expect(prov.cities.map((c) => c.fa)).toContain(a.city);
      expect(a.formatted).toContain(`پلاک ${a.plaque.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d])}`);
      expect(a.formatted).not.toMatch(/[0-9]/);
      expect(Math.abs(a.latitude - prov.lat)).toBeLessThan(5);
    }
  });
});

describe("commerce", () => {
  it("prices are rounded toman within range", () => {
    for (let i = 0; i < N; i++) {
      const p = f.price({ min: 10_000, max: 50_000_000 });
      expect(p).toBeGreaterThanOrEqual(10_000);
      expect(p).toBeLessThanOrEqual(50_000_000);
      expect(p % 1000).toBe(0);
      if (p >= 1_000_000) expect(p % 10_000).toBe(0);
    }
    expect(f.price({ min: 100_000, max: 900_000, psychological: true }) % 10_000).toBe(9_000);
  });
  it("order totals add up", () => {
    for (let i = 0; i < 300; i++) {
      const o = f.order();
      const sub = o.items.reduce((a, x) => a + x.unitPrice * x.quantity, 0);
      expect(o.subtotal).toBe(sub);
      expect(o.total).toBe(o.subtotal - o.discount + o.shipping + o.tax);
      expect(o.orderNumber).toMatch(/^ORD-1405-\d{6}$/);
    }
  });
});
