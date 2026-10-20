import { Iran, type IranOptions } from "./iran.js";

export { Iran };
export type { IranOptions, Gender, Person, Contact, Address, BankAccount, Company, Product, Order, OrderItem, Province, Operator, Plate, PlateType, Holiday, DigitsMode } from "./iran.js";
export { Schema, RecordContext, literal, listPaths, fromJson, convertKey, ArrayMarker, Literal, UniqueMarker, OptionalMarker, OneOfMarker, GEN_ALLOW } from "./schema.js";
export type { Gen, GenFn, SchemaDef, SchemaOptions, ContextOptions, KeyCase, DatasetSpec, DatasetEntry, DatasetCount, DatasetResult, RefSource, RefOptions } from "./schema.js";
export type { Infer, InferGen, Path, PathMap, Simplify } from "./types.js";
export { createHelpers, genRegex } from "./helpers.js";
export type { Helpers } from "./helpers.js";
export { toCsv, toJson, toJsonl, format, flatten } from "./output.js";
export type { Format, CsvOptions } from "./output.js";
export { validate, isValidNationalId, isValidCardNumber, isValidSheba, isValidMobile, isValidPostalCode, isValidLegalId, bankOfCard, bankOfSheba, provinceOfLandline, toAsciiDigits } from "./validate.js";
export { toJalali, toGregorian, isJalaliLeapYear, jalaliMonthLength, jalaliOf, toPersianDigits, toLatinDigits, parseJalali, JALALI_MONTHS, WEEKDAYS_FA } from "./jalali.js";

/** Create an independent generator (own seed, own reference date). */
export function createIran(opts: IranOptions = {}): Iran { return new Iran(opts); }

/** Shared default instance. Call iran.seed(n) for reproducible output. */
export const iran = new Iran();
export default iran;
