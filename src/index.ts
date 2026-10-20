import { Iran, type IranOptions } from "./iran.js";

export { Iran };
export type { IranOptions, Gender, Person, Contact, Address, BankAccount, Company, Product, Order, OrderItem, Province, Operator } from "./iran.js";
export { Schema, RecordContext, literal, listPaths, fromJson, convertKey } from "./schema.js";
export type { Gen, GenFn, SchemaDef, SchemaOptions, ContextOptions, KeyCase, DatasetSpec, DatasetEntry, RefSource } from "./schema.js";
export { toCsv, toJson, toJsonl, format, flatten } from "./output.js";
export type { Format, CsvOptions } from "./output.js";
export { validate, isValidNationalId, isValidCardNumber, isValidSheba, isValidMobile, isValidPostalCode, isValidLegalId, bankOfCard, bankOfSheba, provinceOfLandline, toAsciiDigits } from "./validate.js";
export { toJalali, toGregorian, isJalaliLeapYear, jalaliMonthLength, jalaliOf, toPersianDigits } from "./jalali.js";

/** Create an independent generator (own seed, own reference date). */
export function createIran(opts: IranOptions = {}): Iran { return new Iran(opts); }

/** Shared default instance. Call iran.seed(n) for reproducible output. */
export const iran = new Iran();
export default iran;
