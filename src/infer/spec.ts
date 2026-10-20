/** Normalized description of a field, produced by every parser (JSON Schema, OpenAPI, Prisma, Mongoose, Zod, samples). */
export type FieldType = "string" | "number" | "integer" | "boolean" | "date" | "datetime" | "objectId" | "object" | "array" | "unknown";

export interface FieldSpec {
  name: string;
  type: FieldType;
  /** JSON-Schema-like format: email, uuid, date-time, date, uri, ipv4, ... */
  format?: string;
  enum?: readonly (string | number | boolean)[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  optional?: boolean;
  /** Unique column/index (Prisma @unique, Mongoose unique: true). */
  unique?: boolean;
  /** Primary key (Prisma @id, Mongo _id). */
  id?: boolean;
  /** Field references another model, e.g. Prisma @relation(fields: [userId]) or Mongoose ref: "User". */
  ref?: { model: string; field?: string };
  /** Array items. */
  items?: FieldSpec;
  /** Nested object fields. */
  fields?: FieldSpec[];
  /** Example value seen in a sample (used for format detection). */
  example?: unknown;
  /** Database-generated (autoincrement, now(), updatedAt). Still generated, but noted. */
  generated?: string;
  /** Observed numeric range in samples (soft hint, used only when no alias matches). */
  range?: [number, number];
}

export interface ModelSpec { name: string; fields: FieldSpec[] }
