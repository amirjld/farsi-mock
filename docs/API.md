# farsi-mock API reference (2.0)

All randomness goes through one seeded PRNG per instance, so `createIran({ seed })` plus a fixed
`referenceDate` gives identical output on every machine.

- [Instances](#instances)
- [Generators](#generators)
- [Jalali dates and holidays](#jalali-dates-and-holidays)
- [helpers](#helpers)
- [Schemas](#schemas)
- [Constraint markers](#constraint-markers)
- [Datasets](#datasets)
- [Paths](#paths)
- [Schema files (JSON)](#schema-files-json)
- [Inference](#inference)
- [Outputs](#outputs)
- [Seeding](#seeding)
- [Mock server](#mock-server)
- [AI / MCP](#ai--mcp)
- [Validators](#validators)
- [Subpath exports](#subpath-exports)

## Instances

```ts
import iran, { createIran } from "farsi-mock";
const f = createIran({
  seed: 42,                          // number or string
  referenceDate: "2026-10-20T00:00:00Z", // fixed "now"
  realisticIds: false,               // true = real city prefixes in national IDs
  digits: undefined,                 // "fa" | "latin": digits in formatted text (address.formatted, plate.formatted)
  weekend: "friday",                 // or "thursday_friday" for workday helpers
});
f.seed(7);                           // reseed (also clears helpers.unique stores)
f.setReferenceDate("2027-01-01T00:00:00Z");
```

## Generators

| Method | Returns |
| --- | --- |
| `person({ province, city, gender, minAge, maxAge, realisticIds })` | `{ gender, firstName, lastName, fullName, firstNameEn, lastNameEn, fullNameEn, fatherName, birthDate, birthDateJalali, age, nationalId, birthProvince, birthCity }` |
| `firstName({ gender, en })`, `lastName({ en })` | names; ~4% unisex first names, ~30% compound surnames (کریم‌پور، رضایی‌نژاد) with correct ZWNJ |
| `nationalId({ province, city, realistic })` | 10 digits, valid checksum, `000` prefix unless realistic |
| `birthDate({ minAge, maxAge })`, `gender()` | |
| `contact()` | `{ mobile, operator, landline, email, postalCode }` |
| `mobile({ operator, format })`, `mobileWithOperator()` | `09xxxxxxxxx` (format: `local`, `international`, `e164`, `short`) |
| `landline({ province })`, `email({ firstNameEn, lastNameEn, domains })`, `postalCode({ dashed })` | |
| `address({ province, city, persianDigits })` | `{ province, provinceEn, provinceIso, provinceId, city, cityEn, district, street, alley, plaque, floor, unit, postalCode, latitude, longitude, line, formatted }` |
| `street()`, `alley()` | «خیابان آزادی»، «بلوار شهید …»، «خیابان بیست‌متری»، «کوچه ۱۲»، «بن‌بست …» |
| `cityPoint(province, city)` | random point within the city (GeoNames centre + population-based radius) |
| `province()`, `city()`, `provinces()` | |
| `bank({ bank })`, `cardNumber({ bank, dashed })`, `sheba({ bank })`, `accountNumber()`, `banks()` | card and Sheba of the same bank; Sheba ends with the account number |
| `company({ province })`, `companyName()`, `legalNationalId()` | `{ name, nameEn, type, typeEn, legalNationalId, economicCode, registrationNumber, landline, province, city }`; types include سهامی خاص/عام، مسئولیت محدود، تعاونی، تضامنی، … and موسسه غیرتجاری |
| `product({ category, minPrice, maxPrice })` | `{ sku, name, baseName, variant, category, categoryEn, categoryId, price, unit, color, description }` |
| `productName({ category })`, `price({ min, max, psychological })`, `sku()`, `categories()` | categories: `digital` (electronics), `wood` (MDF/HDF/نئوپان/چندلایی), `food`, `fashion` (clothes), `appliance`, `home`, `beauty`, `stationery`; brand-free items with rough 1405 toman ranges |
| `order({ items, taxRate })`, `orderNumber()` | totals always add up; VAT 10% by default |
| `plate({ type, persianDigits })` | `{ formatted: "۱۲ ب ۳۴۵ ایران ۶۷", twoDigits, letter, threeDigits, regionCode, type }`; types `private`, `taxi`, `government`, `public`, `disabled` |
| `education({ en })` | زیر دیپلم … دکتری, weighted |
| `uuid()`, `objectId()`, `int(a, b)`, `float(a, b, decimals)`, `bool(p)`, `pick(list)`, `digits(n)`, `many(fn, n)` | |
| `recentDate({ days })`, `pastDate({ years })`, `futureDate({ days })`, `betweenDates(a, b)` | `Date` |
| `word()`, `sentence({ words })`, `paragraph()` | Persian filler text |

## Jalali dates and holidays

```ts
f.jalali.of(date)                          // { year, month, day, monthName, weekday, formatted, dateTime, ... }
f.jalali.format(date)                      // "1405/07/28"
f.jalali.dateTime(date)                    // "1405/07/28 14:30"
f.jalali.toGregorian(1405, 1, 1)           // Date (UTC)
f.jalali.between("1405/01/01", "1405/06/31", { workdaysOnly: true, hours: [8, 17] }) // Date (hours are UTC)
f.jalali.recentWorkday(30)                 // not Friday (or Thu+Fri), not a fixed holiday
f.jalali.holidays(1405)                    // [{ jalali, gregorian, name, nameEn, weekday }]
f.jalali.isHoliday(date); f.jalali.isWeekend(date); f.jalali.isOffDay(date)
f.jalali.inYear(1404); f.jalali.recent(); f.jalali.past(); f.jalali.future()
```

Only fixed solar holidays are included (Nowruz, 12 and 13 Farvardin, 14 and 15 Khordad, 22 Bahman,
29 Esfand). Lunar holidays move every year and need the official calendar.

## helpers

Faker-style utilities on every instance (`f.helpers`), all seeded:

| Helper | |
| --- | --- |
| `arrayElement(list)`, `arrayElements(list, count?)`, `shuffle(list)` | |
| `weightedArrayElement([{ weight, value }])` or `([[value, weight]])` | |
| `maybe(fn, { probability })` | value or `undefined` |
| `unique(fn, { key, maxRetries })`, `resetUnique(key?)` | shared store per instance |
| `uniqueArray(fn, n)`, `multiple(fn, { count })` | |
| `replaceSymbols("##-??")` | `#` digit, `?` letter, `*` either, `@` Persian letter |
| `fromRegExp(/^[A-Z]{2}\d{4}$/)` | simple regex patterns (classes, `\d \w`, `{m,n}`, `? * +`, `(a\|b)`) |
| `rangeToNumber({ min, max })`, `slugify(text)` | |

## Schemas

```ts
const User = f.schema({
  id: "id.uuid",
  name: "person.fullName",
  age: "person.age",
  address: { city: "address.city", zip: "address.postalCode" },
  tags: f.array([1, 3], "text.word"),
  score: (x, ctx) => x.int(0, 100),
}, { context: { province: "اصفهان" }, case: "snake", digits: "fa", uniqueBy: ["name"] });

User.one();            // typed: { id: string; name: string; age: number; address: { city: string; zip: string }; tags: string[]; score: number }
User.many(100, { gender: "female" });
User.extend({ email: "contact.email" }).omit("age").pick("id", "name", "email").rename({ name: "fullName" });
User.withContext({ city: "کاشان" }).withCase("camel").withOptions({ digits: "latin" });
type UserRow = ReturnType<typeof User.one>;
```

Options: `context` (`province, city, gender, operator, bank, category, minAge, maxAge, realisticIds,
emailDomains`), `case` (`preserve | camel | snake | pascal | kebab`; static types keep the original keys),
`uniqueBy` (field name, or list of names and name tuples), `digits` (`fa` converts digits in text values and
leaves emails, URLs, UUIDs, ISO dates and digit-only IDs/phones alone; `digitsAll: true` converts those too;
`latin` converts everything to ASCII).

Field values: path string, whole entity (`"person"`), function `(f, ctx) => value` (`ctx.person`,
`ctx.contact`, `ctx.address`, `ctx.bank`, `ctx.company`, `ctx.product`, `ctx.order`, `ctx.plate`,
`ctx.province`, `ctx.city`, `ctx.gender`, `ctx.index`, `ctx.record`, `ctx.parentRecord`), nested object,
`f.array(n | [min, max], gen)`, `f.ref(source, field | { field, unique })`, `literal("text")`, number /
boolean / null, a nested `Schema`, or a constraint marker. Functions may return `Date` (becomes an ISO
string) or another marker.

## Constraint markers

| Marker | Effect |
| --- | --- |
| `f.unique(gen, { maxRetries })` | no repeats within one `many()` / dataset entity (throws if impossible) |
| `f.nullable(gen, rate = 0.2)` | `null` with probability `rate`; type `T \| null` |
| `f.optional(gen, rate = 0.2)` | key left out with probability `rate`; type `key?: T` |
| `f.weighted([["a", 8], ["b", 2]])` | weighted literal pick; type `"a" \| "b"` |
| `f.oneOf(genA, genB, ...)` | one of several generators, uniformly |

## Datasets

```ts
const db = f.dataset({
  users: [User, 20],
  profiles: { schema: { userId: f.ref("users", { unique: true }) }, count: 20 },          // one-to-one
  orders: { schema: { userId: "parent.id", buyer: "parent.name" }, count: { per: "users", min: 0, max: 4 } },
  reviews: { schema: { orderId: "ref:orders.id" }, count: 50, uniqueBy: "orderId" },
});
db.orders[0].buyer; // typed
```

Entities are generated in order; refs and `parent.*` paths see entities defined earlier.
`count: { per, min, max }` (or `{ per, count }`) creates children for every parent record.

## Paths

Run `npx farsi-mock paths` for the full list. Groups: `person.*`, `contact.*`, `address.*`, `bank.*`,
`company.*`, `product.*`, `order.*`, `id.*` (`uuid`, `objectId`, `index`, `int`), `date.*` (`now`,
`recent`, `past`, `future`, each with a `Jalali` variant, plus `dateTimeJalali`, `workday`,
`workdayJalali`, `birthDate`), `text.*`, `number.*` (`int`, `float`, `rating`, `percent`), `helpers.bool`,
`person.education`, `vehicle.plate`, `vehicle.plateLatin`, `geo.latitude`, `geo.longitude`, `geo.point`,
`internet.*` (`username`, `url`, `slug`, `password`, `ip`; URLs use example.com, IPs the 10.x range),
`commerce.*`, `phone.*`, `province.*`, `city.*`, `ref:<entity>.<field>`, `parent.<field>`.

## Schema files (JSON)

Used by the CLI, `fromJson`, the mock server and the MCP tools.

| JSON | Meaning |
| --- | --- |
| `"person.fullName"` | path |
| `{ "$literal": "active" }` | fixed value |
| `{ "$pick": ["a", "b"] }`, `{ "$weighted": [["a", 9], ["b", 1]] }` | pick |
| `{ "$int": [1, 10] }`, `{ "$float": [0, 1, 2] }`, `{ "$bool": 0.8 }` | numbers / booleans |
| `{ "$template": "U-{id.index}" }`, `{ "$regex": "^[A-Z]{2}\\d{3}$" }` | strings |
| `{ "$array": [1, 3], "of": ... }` | array |
| `{ "$unique": ... }`, `{ "$nullable": ..., "rate": 0.2 }`, `{ "$optional": ..., "rate": 0.2 }`, `{ "$oneOf": [...] }` | constraints |
| `{ "$ref": "users.id", "unique": true }` | reference |
| `{ "$clamp": ..., "min": 0, "max": 100 }`, `{ "$truncate": ..., "max": 20 }`, `{ "$string": ... }`, `{ "$number": ... }`, `{ "$dateOnly": ... }`, `{ "$dateTime": ... }` | post-processing (used by inference) |
| `{ "$gen": "mobile", "args": { "operator": "Rightel" } }` | allowed generator call |

A file is a field map, `{ "fields": {...}, "count": 10, "context": {...}, "uniqueBy": [...], "digits": "fa" }`,
or `{ "entities": { "users": { "count": 20, "fields": {...} }, "orders": { "count": { "per": "users", "min": 1, "max": 3 }, "fields": {...} } } }`.

## Inference

```ts
const r = f.fromPrisma(text, { model: "User", overrides: { "User.code": "person.nationalId" }, nullRate: 0.1, optionalRate: 0 });
// also: f.fromZod(schema), f.fromMongoose(schemaOrDefinition), f.fromOpenAPI(doc), f.fromJsonSchema(json), f.fromSample(json), f.infer(anything)
r.explain();            // table: field, type, generator, confidence, reason
r.report;               // [{ model, field, type, generator, confidence, reason }]
r.confidence;           // average 0..1
r.lowConfidence(0.5);   // fields to override
r.fields("User");       // schema-file JSON for one model
r.schema("User").many(10);
r.dataset({ User: 20, Order: 100 });
r.toJSON();             // file for `farsi-mock schema`
```

How fields are mapped, in order: overrides (1.0) → primary keys → explicit relations (Prisma
`@relation`, Mongoose `ref`) → enums → booleans (`isDeleted` rarely true, `isActive` mostly true) →
strong formats (email, uuid, Iranian formats detected in samples) → alias dictionary (exact 0.95, without
prefix words like `user_`/`customer` 0.88, suffix 0.8, whole word 0.75, prefix 0.7, one-letter typo 0.65;
the model name disambiguates `name`, `title`, `code`, `status`, `description`) → foreign-key names
(`userId` → `ref:User.id`) → regex patterns → type fallbacks (dates, numbers within min/max, strings).
Names ending in words like `Verified`, `Id`, `Count`, `At` only match exactly (`emailVerified` is not an email).
`min/max` clamp numeric aliases, `maxLength` truncates strings, `@unique` / `unique: true` adds `$unique`.

Parsers: JSON Schema (draft 4 to 2020-12: `$ref`, `$defs`/`definitions`, `allOf`, `oneOf`/`anyOf`,
nullable types, formats, bounds), OpenAPI 3.x `components.schemas` and Swagger 2 `definitions` (YAML must
be converted to JSON first), Prisma text (models, enums, composite types, `@id`, `@unique`, `@default`,
`@db.*`, `@map` with `useDbNames`, `@relation`, lists, optional), Mongoose (Schema instance or definition:
types, arrays, nested objects and sub-schemas, `required`, `enum`, `min/max`, `minlength/maxlength`,
`match`, `unique`, `ref`, `timestamps`), Zod v3 and v4 (objects, strings with formats/lengths/regex,
numbers with int/bounds, enums, native enums, literals, optional/nullable/default, arrays, unions, effects
and pipes, dates), samples (records or `{ entity: [...] }`; Mongo extended JSON; Iranian formats by
checksum; code-like enums). Sample values are never copied into the output.

## Outputs

```ts
import { toCsv, toJson, toJsonl, toSql, toMongoJson, toExtendedJson, toTs, format } from "farsi-mock/output";
toSql(rows, { dialect: "postgres", table: "users", createTable: true, ignoreConflicts: true, batchSize: 500, transaction: true, nested: "json" });
toSql(dataset, { dialect: "mysql" });     // one table per entity, in order
toMongoJson(rows, { mode: "relaxed", layout: "array" }); // { $oid }, { $date }; canonical adds $numberInt/$numberLong
toTs(dataset);                            // interfaces + typed consts, compiles under strict
toCsv(rows, { bom: true, delimiter: ";" });
```

`createTable` guesses column types (BOOLEAN / TINYINT(1), INTEGER / BIGINT, DOUBLE, TIMESTAMPTZ /
DATETIME(3), DATE, JSONB / JSON, TEXT / VARCHAR(255)) and makes `id` / `_id` the primary key.

## Seeding

```ts
import { seedPrisma, seedDrizzle, seedMongoose, seedMongo, seedBatches, seedDataset, reviveDates } from "farsi-mock/seed";
await seedPrisma(prisma, "user", rows, { batchSize: 500, skipDuplicates: true });
await seedDrizzle(db, usersTable, rows, { onConflictDoNothing: true });
await seedMongoose(UserModel, rows, { ordered: false });
await seedMongo(db.collection("users"), rows, { objectId: (hex) => new ObjectId(hex) });
await seedDataset(data, (entity, rows) => seedPrisma(prisma, entity, rows));
```

ISO date strings become `Date` objects first (`dates: false` to keep strings). `onBatch` reports progress.
No ORM is imported; you pass your own client.

## Mock server

```ts
import { createMockServer } from "farsi-mock/server";
const mock = createMockServer({ iran: f, resources: { users: User, orders: { fields: {...}, count: 200 } }, count: 50,
  basePath: "/api", pageSize: 20, cors: true, writable: false, delay: [50, 300] });
const url = await mock.listen(3000);   // port 0 = random
app.use(mock.handler);                 // or mount in express / node:http
await mock.close();
```

Routes: `GET /` (index), `GET /:resource` (`page`, `limit`, `_page`, `_limit`, `offset`, `sort=-a,b`,
`_sort`/`_order`, `field=value`, `nested.field=value`, `field_gte`, `field_lte`, `field_ne`,
`field_like`, `q`, `envelope=false`), `GET /:resource/:id` (by `id`, `_id` or `uuid`), and with
`writable` `POST`, `PUT`, `PATCH`, `DELETE`. Responses carry `X-Total-Count` and `Link`.

## AI / MCP

```ts
import { tools, callTool, handleMcpMessage, serveMcpStdio } from "farsi-mock/ai";
```

See [AI.md](./AI.md).

## Validators

```ts
import { validate, isValidNationalId, isValidCardNumber, isValidSheba, isValidMobile, isValidPostalCode, isValidLegalId,
  bankOfCard, bankOfSheba, provinceOfLandline, toAsciiDigits } from "farsi-mock/validate";
```

## Subpath exports

| Import | Contents | Node-only |
| --- | --- | --- |
| `farsi-mock` | everything except server/seed/ai | no |
| `farsi-mock/infer` | parsers, alias dictionary, `matchAlias` | no |
| `farsi-mock/output` | CSV, JSON, JSONL, SQL, Mongo, TS | no |
| `farsi-mock/seed` | seed adapters | no |
| `farsi-mock/server` | mock server | yes (`node:http`) |
| `farsi-mock/validate`, `farsi-mock/jalali` | small, dependency-free helpers | no |
| `farsi-mock/ai` | MCP tools and stdio server | stdio part only |
| `farsi-mock/browser` | IIFE bundle, global `FarsiMock` (`<script src="https://unpkg.com/farsi-mock">`) | no |
