// Static types for schema output inference: iran.schema({ id: "id.uuid", name: "person.fullName" }).one()
// is typed as { id: string; name: string }.
import type { Person, Contact, Address, BankAccount, Company, Product, Order } from "./iran.js";
import type { ArrayMarker, Literal, UniqueMarker, OptionalMarker, OneOfMarker, Schema, RecordContext } from "./schema.js";

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

type EntityPaths<N extends string, T> = { [K in keyof T & string as `${N}.${K}`]: T[K] } & { [P in N]: T };

/** Every built-in string path and the type it produces. */
export type PathMap = EntityPaths<"person", Person> & EntityPaths<"contact", Contact> & EntityPaths<"address", Address> &
  EntityPaths<"bank", BankAccount> & EntityPaths<"company", Company> & EntityPaths<"product", Product> & EntityPaths<"order", Order> & {
    "id.uuid": string; "id.objectId": string; "id.index": number; "id.int": number;
    "date.now": string; "date.nowJalali": string; "date.recent": string; "date.recentJalali": string; "date.past": string;
    "date.pastJalali": string; "date.future": string; "date.futureJalali": string; "date.dateTimeJalali": string;
    "date.workday": string; "date.workdayJalali": string; "date.birthDate": string;
    "text.word": string; "text.sentence": string; "text.paragraph": string;
    "number.int": number; "number.float": number; "number.rating": number; "number.percent": number;
    "helpers.bool": boolean;
    "person.education": string; "person.educationEn": string;
    "vehicle.plate": string; "vehicle.plateLatin": string;
    "geo.latitude": number; "geo.longitude": number; "geo.point": [number, number];
    "internet.username": string; "internet.url": string; "internet.slug": string; "internet.password": string; "internet.ip": string;
    "commerce.price": number; "commerce.productName": string; "commerce.sku": string; "commerce.orderNumber": string; "commerce.category": string;
    "company.typeName": string;
    "phone.mobile": string; "phone.landline": string;
    "province.name": string; "province.nameEn": string; "province.iso": string; "province.id": number; "province.areaCode": string;
    "city.name": string; "city.nameEn": string;
  };
export type Path = keyof PathMap;

type FnResult<R> = R extends Date ? string
  : R extends ArrayMarker<any> | Literal<any> | UniqueMarker<any> | OptionalMarker<any, any> | OneOfMarker<any> | Schema<any> ? InferGen<R>
  : R;

/** Output type of one field generator. */
export type InferGen<G> =
  G extends Path ? PathMap[G]
  : G extends string ? unknown
  : G extends number | boolean | null ? G
  : G extends Literal<infer V> ? V
  : G extends UniqueMarker<infer I> ? InferGen<I>
  : G extends OptionalMarker<infer I, infer M> ? (M extends null ? InferGen<I> | null : InferGen<I>)
  : G extends OneOfMarker<infer A> ? InferGen<A[number]>
  : G extends ArrayMarker<infer I> ? InferGen<I>[]
  : G extends Schema<infer T> ? T
  : G extends (f: any, ctx: RecordContext) => infer R ? FnResult<R>
  : G extends readonly unknown[] ? (number extends G["length"] ? unknown[] : { -readonly [K in keyof G]: InferGen<G[K]> })
  : G extends object ? Infer<G>
  : unknown;

type OmitKeys<D> = { [K in keyof D]: D[K] extends OptionalMarker<any, infer M> ? (null extends M ? never : K) : never }[keyof D];

/** Record type produced by a schema definition. Fields wrapped in optional() become optional properties. */
export type Infer<D> = string extends keyof D ? Record<string, unknown> : Simplify<
  { -readonly [K in Exclude<keyof D, OmitKeys<D>>]: InferGen<D[K]> } &
  { -readonly [K in OmitKeys<D>]?: InferGen<D[K]> }
>;

/** Accepted schema definition object. */
export type SchemaInput = { readonly [field: string]: unknown };
