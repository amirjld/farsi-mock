// Validators, copied from parsi-mcp (same algorithms) so users can check generated data.
import { BANKS } from "./data/banks.js";
import { PROVINCES } from "./data/places.js";

const clean = (s: string) => toAsciiDigits(String(s)).replace(/[\s-]/g, "");

export function toAsciiDigits(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** کد ملی: 10 digits, mod-11 check digit, not all the same digit. */
export function isValidNationalId(input: string): boolean {
  const id = clean(input);
  if (!/^\d{10}$/.test(id) || /^(\d)\1{9}$/.test(id)) return false;
  const sum = [...id.slice(0, 9)].reduce((a, d, i) => a + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return Number(id[9]) === (r < 2 ? r : 11 - r);
}

/** Bank card: 16 digits, Luhn. */
export function isValidCardNumber(input: string): boolean {
  const n = clean(input);
  if (!/^\d{16}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(n[15 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** شبا: IR + 24 digits, ISO 13616 mod-97. */
export function isValidSheba(input: string): boolean {
  const s = clean(input).toUpperCase();
  if (!/^IR\d{24}$/.test(s)) return false;
  const r = s.slice(4) + "1827" + s.slice(2, 4);
  let rem = 0;
  for (const ch of r) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

/** Mobile: 09 + 9 digits (also accepts +98 / 0098 / 98 / 9xxxxxxxxx). */
export function isValidMobile(input: string): boolean {
  let s = clean(input).replace(/^\+/, "");
  if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98")) s = "0" + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = "0" + s;
  return /^09\d{9}$/.test(s);
}

/** کد پستی: 10 digits, no 0/2 in the first five, no 2 at all, 5th digit not 5, first four not identical. */
export function isValidPostalCode(input: string): boolean {
  return /^(?!(\d)\1{3})[13-9]{4}[1346-9][013-9]{5}$/.test(clean(input));
}

/** شناسه ملی اشخاص حقوقی: 11 digits with checksum (algorithm as documented by persian-tools). */
export function isValidLegalId(input: string): boolean {
  const s = clean(input);
  if (!/^\d{11}$/.test(s) || /^0+$/.test(s) || /^0{6}$/.test(s.slice(3, 9))) return false;
  return legalCheckDigit(s.slice(0, 10)) === Number(s[10]);
}

export function legalCheckDigit(first10: string): number {
  const d = first10.split("").map(Number);
  const z = [29, 27, 23, 19, 17];
  const dec = d[9] + 2;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (dec + d[i]) * z[i % 5];
  const r = sum % 11;
  return r === 10 ? 0 : r;
}

export function nationalIdCheckDigit(first9: string): number {
  const sum = [...first9].reduce((a, d, i) => a + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return r < 2 ? r : 11 - r;
}

export function luhnCheckDigit(first15: string): number {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(first15[14 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function shebaCheckDigits(bban: string): string {
  let rem = 0;
  for (const ch of bban + "182700") rem = (rem * 10 + Number(ch)) % 97;
  return String(98 - rem).padStart(2, "0");
}

/** Bank from card BIN, or null. */
export function bankOfCard(card: string) {
  const bin = clean(card).slice(0, 6);
  return BANKS.find((b) => b.bins.includes(bin)) ?? null;
}

/** Bank from the Sheba bank code (digits 5-7), or null. */
export function bankOfSheba(sheba: string) {
  const code = clean(sheba).toUpperCase().slice(4, 7);
  return BANKS.find((b) => b.shebaCode === code) ?? null;
}

/** Province from a landline area code, or null. */
export function provinceOfLandline(phone: string) {
  const d = clean(phone).replace(/^\+?98/, "0");
  if (!/^0[1-8]\d{9}$/.test(d)) return null;
  return PROVINCES.find((p) => p.areaCode === d.slice(1, 3)) ?? null;
}

export const validate = {
  nationalId: isValidNationalId,
  cardNumber: isValidCardNumber,
  sheba: isValidSheba,
  mobile: isValidMobile,
  postalCode: isValidPostalCode,
  legalId: isValidLegalId,
  bankOfCard, bankOfSheba, provinceOfLandline,
};
