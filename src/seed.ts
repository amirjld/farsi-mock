// Seed helpers: batched inserts through the client YOU pass in. No ORM is imported or required.
type Rows = Record<string, unknown>[];

export interface SeedOptions {
  /** Rows per insert call (default 500). */
  batchSize?: number;
  /** Turn ISO date-time strings into Date objects before inserting (default true). */
  dates?: boolean;
  /** Called after every batch. */
  onBatch?: (info: { done: number; total: number }) => void;
}
export interface SeedResult { inserted: number; batches: number }

const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Deep-copy records, converting ISO date-time strings to Date objects. */
export function reviveDates<T>(value: T): T {
  if (typeof value === "string" && ISO_DT.test(value)) return new Date(value) as unknown as T;
  if (Array.isArray(value)) return value.map(reviveDates) as unknown as T;
  if (value && typeof value === "object" && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, reviveDates(v)])) as T;
  return value;
}

/** Run `insert` for each batch, sequentially. The building block for every adapter. */
export async function seedBatches<R>(records: readonly R[], insert: (batch: R[], index: number) => Promise<unknown> | unknown, opts: SeedOptions = {}): Promise<SeedResult> {
  const size = Math.max(1, opts.batchSize ?? 500);
  let batches = 0, done = 0;
  for (let i = 0; i < records.length; i += size) {
    const batch = records.slice(i, i + size);
    await insert(batch, batches++);
    done += batch.length;
    opts.onBatch?.({ done, total: records.length });
  }
  return { inserted: done, batches };
}

const prep = (records: Rows, opts: SeedOptions) => (opts.dates === false ? records : reviveDates(records));

interface PrismaDelegate { createMany?: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<unknown>; create: (args: { data: unknown }) => Promise<unknown> }

/**
 * Prisma: `await seedPrisma(prisma, "user", users)`. Uses createMany when the database supports it
 * (falls back to create per row, e.g. on SQLite with old Prisma versions).
 */
export async function seedPrisma(prisma: unknown, model: string, records: Rows, opts: SeedOptions & { skipDuplicates?: boolean } = {}): Promise<SeedResult> {
  const client = prisma as Record<string, PrismaDelegate>;
  const key = model[0].toLowerCase() + model.slice(1);
  const delegate = client[key] ?? client[model];
  if (!delegate || typeof delegate.create !== "function") throw new Error(`farsi-mock: prisma.${key} not found. Pass the model name as used on the client, e.g. "user"`);
  const data = prep(records, opts);
  return seedBatches(data, async (batch) => {
    if (typeof delegate.createMany === "function") {
      try { return await delegate.createMany({ data: batch, ...(opts.skipDuplicates ? { skipDuplicates: true } : {}) }); }
      catch (e) { if (!/createMany|not supported|Unknown argument.*skipDuplicates/i.test(String((e as Error).message))) throw e; }
    }
    for (const row of batch) await delegate.create({ data: row });
  }, opts);
}

interface DrizzleInsert { values: (rows: unknown[]) => DrizzleValues }
interface DrizzleValues extends PromiseLike<unknown> { onConflictDoNothing?: () => PromiseLike<unknown> }

/** Drizzle: `await seedDrizzle(db, usersTable, users)`. */
export async function seedDrizzle(db: unknown, table: unknown, records: Rows, opts: SeedOptions & { onConflictDoNothing?: boolean } = {}): Promise<SeedResult> {
  const d = db as { insert: (t: unknown) => DrizzleInsert };
  if (typeof d?.insert !== "function") throw new Error("farsi-mock: seedDrizzle expects a drizzle db instance");
  return seedBatches(prep(records, opts), async (batch) => {
    const q = d.insert(table).values(batch);
    return opts.onConflictDoNothing && q.onConflictDoNothing ? q.onConflictDoNothing() : q;
  }, opts);
}

/** Mongoose: `await seedMongoose(User, users)` (insertMany, unordered by default). */
export async function seedMongoose(model: unknown, records: Rows, opts: SeedOptions & { ordered?: boolean } = {}): Promise<SeedResult> {
  const m = model as { insertMany: (docs: unknown[], o?: object) => Promise<unknown> };
  if (typeof m?.insertMany !== "function") throw new Error("farsi-mock: seedMongoose expects a mongoose Model");
  return seedBatches(prep(records, opts), (batch) => m.insertMany(batch, { ordered: opts.ordered ?? false }), opts);
}

/**
 * MongoDB driver: `await seedMongo(db.collection("users"), users, { objectId: (hex) => new ObjectId(hex) })`.
 * Pass `objectId` so _id / *Id fields become real ObjectIds (the driver is not imported here).
 */
export async function seedMongo(collection: unknown, records: Rows, opts: SeedOptions & { ordered?: boolean; objectId?: (hex: string) => unknown; objectIdFields?: (key: string) => boolean } = {}): Promise<SeedResult> {
  const c = collection as { insertMany: (docs: unknown[], o?: object) => Promise<unknown> };
  if (typeof c?.insertMany !== "function") throw new Error("farsi-mock: seedMongo expects a MongoDB collection");
  const isOid = opts.objectIdFields ?? ((k: string) => k === "_id" || /(Id|_id|Ids|_ids)$/.test(k));
  const conv = (v: unknown, k: string): unknown => {
    if (opts.objectId && typeof v === "string" && /^[0-9a-f]{24}$/i.test(v) && isOid(k)) return opts.objectId(v);
    if (Array.isArray(v)) return v.map((x) => conv(x, k));
    if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, conv(x, kk)]));
    return v;
  };
  const data = prep(records, opts).map((r) => conv(r, "") as Record<string, unknown>);
  return seedBatches(data, (batch) => c.insertMany(batch, { ordered: opts.ordered ?? false }), opts);
}

/** Seed a whole dataset in order (parents before children): `await seedDataset(data, (entity, rows) => seedPrisma(prisma, entity, rows))`. */
export async function seedDataset(dataset: Record<string, Rows>, seed: (entity: string, records: Rows) => Promise<SeedResult | unknown>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [entity, rows] of Object.entries(dataset)) { await seed(entity, rows); out[entity] = rows.length; }
  return out;
}
