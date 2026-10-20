# farsi-mock

[![CI](https://github.com/amirjld/farsi-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/amirjld/farsi-mock/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/farsi-mock.svg)](https://www.npmjs.com/package/farsi-mock)
[![license](https://img.shields.io/npm/l/farsi-mock.svg)](./LICENSE)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![types](https://img.shields.io/badge/types-TypeScript-blue)

Realistic, **algorithmically valid** Iranian test data. Like Faker, but the national IDs pass the
checksum, cards pass Luhn, Sheba numbers pass mod-97 and point at the same bank as the card, mobile
prefixes belong to real operators, landlines carry the right province code, and every field of a record
agrees with the others (same person, same province).

- **Point it at your schema**: infers generators from Prisma, Zod, Mongoose, OpenAPI, JSON Schema or a
  sample JSON, with a confidence score per field (`codeMelli`, `shomare_mobile`, `zipCode`... all recognised)
- **Typed schemas**: `iran.schema({...}).one()` is fully typed; constraints like `unique`, `nullable`,
  `weighted`, `uniqueBy`; linked datasets with per-parent counts
- **Outputs**: JSON, CSV, JSONL, SQL (Postgres/MySQL/SQLite), MongoDB extended JSON, TypeScript fixtures
- **Seed and mock**: batched seed helpers for Prisma, Drizzle, Mongoose and the Mongo driver; a mock REST
  server (`farsi-mock serve`); an MCP server for AI assistants (`farsi-mock mcp`)
- Zero runtime dependencies, ESM + CommonJS + browser build, tree-shakable subpaths, deterministic with a seed

[فارسی](./README.fa.md) · [API reference](./docs/API.md) · [AI / MCP](./docs/AI.md) · [Changelog](./CHANGELOG.md)

> **For testing only.** Values are random and only *algorithmically* valid. National IDs are safe by
> default (see below), but card and Sheba numbers can still coincide with real ones, so never use this
> data for real payments, identity checks or messaging. Emails use the reserved `example.*` domains.

## Install

```bash
npm i -D farsi-mock
```

## Quick start

```ts
import { iran } from "farsi-mock";

iran.setReferenceDate("2026-10-20T00:00:00Z");
iran.seed(42);                         // same output every run
iran.person({ gender: "female", province: "اصفهان" });
// { gender: "female", firstName: "کوثر", lastName: "اصفهانی", fullName: "کوثر اصفهانی",
//   firstNameEn: "Kowsar", lastNameEn: "Esfahani", fullNameEn: "Kowsar Esfahani", fatherName: "حامد",
//   birthDate: "1964-09-03", birthDateJalali: "1343/06/12", age: 62,
//   nationalId: "0009492739", birthProvince: "اصفهان", birthCity: "اصفهان" }

iran.mobile({ operator: "Irancell" }); // "09414983570"
iran.landline({ province: "Fars" });   // "07172225309"
iran.bank();                           // { bankName: "بانک ملت", cardNumber: "6104...", sheba: "IR..12..", accountNumber }
iran.company();                        // { name: "شرکت ... (سهامی خاص)", type, typeEn, legalNationalId, economicCode, ... }
iran.address();                        // { province, city, street, alley, plaque, unit, postalCode, formatted: "تهران، ..." }
iran.many(() => iran.person(), 100);
```

Use `createIran({ seed, referenceDate, realisticIds })` for an independent instance. `referenceDate` fixes
"now", so dates are reproducible too.

## Safe national IDs by default

Every generated national ID has a valid checksum but starts with `000`. That prefix is in no published
issuing-office table, so the ID cannot belong to a real person.

Some systems reject the `000` prefix. When you need IDs that look fully real, turn on real prefixes and
the first 3 digits become the issuing-office code of the person's birth city (or the province capital
when the city is not in the table):

```ts
createIran({ realisticIds: true });                  // whole instance
iran.schema(def, { context: { realisticIds: true } }); // one schema
iran.nationalId({ realistic: true, province: "Fars" }); // one call
```

On the CLI: `--realistic-ids`.

Card and Sheba numbers are **not** safe by default. The Shetab network publishes no test range, and
any 16-digit number with a real BIN and a valid Luhn digit could be an issued card. They are random,
so a match is unlikely, but it is possible.

## Generators

| Area | Methods |
| --- | --- |
| person | `person()`, `firstName({ gender })`, `lastName()`, `nationalId({ province, city, realistic })`, `birthDate({ minAge, maxAge })`, `gender()` |
| contact | `contact()`, `mobile({ operator, format })`, `landline({ province })`, `email()`, `postalCode({ dashed })` |
| address | `address({ province, city, persianDigits })`, `province()`, `city()`, `provinces()` |
| bank | `bank({ bank })`, `cardNumber({ bank, dashed })`, `sheba({ bank })`, `accountNumber()`, `banks()` |
| company | `company()`, `legalNationalId()`, `companyName()` |
| commerce | `product({ category })`, `productName()`, `price({ min, max, psychological })`, `order({ items, taxRate })`, `sku()`, `orderNumber()`, `categories()` |
| dates | `recentDate()`, `pastDate()`, `futureDate()`, `betweenDates()`, `jalali.of() / format() / inYear() / recent() / past() / future() / toGregorian()` |
| vehicle, education | `plate({ type })`, `education()` |
| jalali | `jalali.between()`, `dateTime()`, `holidays()`, `isHoliday()`, `isWeekend()`, `recentWorkday()` |
| misc | `uuid()`, `objectId()`, `int()`, `float()`, `bool()`, `pick()`, `word()`, `sentence()`, `paragraph()`, `helpers.*` |

Details worth knowing:

- **National ID**: valid checksum, safe `000` prefix by default. With `realisticIds` the prefix matches
  the birth city (see above).
- **Card and Sheba**: real BIN, random body, Luhn check digit. The Sheba uses the same bank's code and
  ends with the account number.
- **Prices** are in toman, rounded to 1,000 (10,000 above 1M). `psychological: true` gives `...9,000` prices.
- **Orders**: VAT defaults to 10%. Totals always add up.
- **Economic code** equals the 11-digit legal national ID (the current rule for legal entities).

## Schemas: your field names

Apps name things differently (`nationalCode`, `codeMelli`, `national_id`, `nid`...). Describe your shape
and map each field to a path or a function:

```ts
import { iran, literal } from "farsi-mock";

const User = iran.schema({
  _id: "id.objectId",
  nationalCode: "person.nationalId",
  full_name: "person.fullName",
  phone_number: (f) => f.mobile({ operator: "irancell" }),
  isActive: () => true,
  address: { city: "address.city", zip: "address.postalCode" },
  tags: iran.array([1, 3], "text.word"),
  createdAt: "date.recentJalali",
}, { context: { province: "اصفهان" } });

User.one();
User.many(50);
```

Output of a smaller schema (seed 42; fields nationalCode, full_name, phone_number, city, landline, createdAt):

```json
[
  { "nationalCode": "0004927397", "full_name": "نسرین وکیلی", "phone_number": "09309835708",
    "city": "اصفهان", "landline": "03127723159", "createdAt": "1405/07/14" },
  { "nationalCode": "0000991759", "full_name": "ناصر شجاعی", "phone_number": "09352061371",
    "city": "اصفهان", "landline": "03134347984", "createdAt": "1405/07/07" }
]
```

**One record, one story.** Each record gets a shared context: `person.*`, `contact.*`, `address.*`,
`bank.*`, `company.*`, `product.*` and `order.*` are created once per record, so `full_name`, `email`,
`nationalCode`, landline and postal code all describe the same person in the same province, and the
first name matches the gender. Options: `context: { province, city, gender, operator, bank, category,
minAge, maxAge, realisticIds, emailDomains }`, also as the first argument of `.one()` / `.many()`.

Field values can be:

| Value | Meaning |
| --- | --- |
| `"person.fullName"` | a path. Run `npx farsi-mock paths` for all of them |
| `"person"` | the whole entity object |
| `(f, ctx) => ...` | a function. `f` is the generator, `ctx` has `person`, `contact`, `address`, `bank`, `company`, `product`, `order`, `province`, `city`, `gender`, `index` and `record` (fields generated so far) |
| `{ ... }` | a nested object |
| `iran.array(n \| [min, max], gen)` | an array. Each item keeps the record's person and province but gets a fresh product, address, bank and contact |
| `iran.ref(schemaOrArray, "id")` | a value from a record generated earlier (`{ field, unique: true }` for one-to-one) |
| `iran.unique / nullable / optional / weighted / oneOf` | constraints (see below) |
| `literal("text")` | a fixed string (plain strings are paths) |
| `42`, `true`, `null` | literals |

Unknown paths fail immediately with suggestions. Full list of options and paths: [docs/API.md](./docs/API.md).

### Reshaping

```ts
const Seller = iran.presets.seller
  .rename({ mobile: "phone_number" })
  .omit("email")
  .extend({ wallet: (f) => f.price({ max: 10_000_000 }) })
  .withCase("snake");             // camel | snake | pascal | kebab | preserve
```

### Relations

```ts
const Users = iran.schema({ id: "id.uuid", name: "person.fullName" });
const Orders = iran.schema({ id: "id.uuid", userId: iran.ref(Users), total: "order.total" });
Users.many(20);
Orders.many(100);                 // every userId is one of the 20 users

// or in one go:
const db = iran.dataset({
  users: [Users, 20],
  orders: { schema: { id: "id.uuid", userId: "ref:users.id" }, count: 100 },
});
```

## Presets

`iran.presets.user`, `.seller`, `.address`, `.product`, `.order`: common shapes from Iranian apps
(customer address with `recipientFirstName / provinceId / plaque / unit / postalCode`, seller with
`legalNationalId / economicCode / sheba`, order with items and toman totals). They are normal schemas,
so `rename`, `extend` and `withCase` work on them.

## CSV and JSON

```ts
import { toCsv, toJson, toJsonl } from "farsi-mock";
toCsv(User.many(10));             // RFC 4180, nested keys become "address.city", arrays become JSON
toCsv(rows, { bom: true });       // add a BOM so Excel opens Persian text correctly
```

Excel may strip leading zeros from mobiles and IDs; import those columns as text.

## CLI

```bash
npx farsi-mock person -n 50 --csv
npx farsi-mock user -n 100 --seed 42 --province اصفهان --case snake
npx farsi-mock schema ./schema.json -n 100 --format csv -o users.csv
npx farsi-mock schema ./shop.json --seed 1          # multi-entity file with refs
npx farsi-mock user -n 1000 --sql --dialect mysql --table users --create-table -o users.sql
npx farsi-mock infer prisma/schema.prisma --explain
npx farsi-mock serve ./shop.json --port 4000
npx farsi-mock mcp
npx farsi-mock paths | banks | provinces | categories | holidays 1405
```

Types: `user`, `seller`, `address`, `product`, `order` (presets) and `person`, `contact`, `bank`,
`company`, `plate` (raw generators). Formats: `json`, `jsonl`, `csv`, `sql`, `mongo`, `ts`. Run
`npx farsi-mock --help` for every option.

### Schema files

```json
{
  "context": { "province": "اصفهان" },
  "fields": {
    "_id": "id.objectId",
    "full_name": { "fa": "person.fullName", "en": "person.fullNameEn" },
    "national_id": "person.nationalId",
    "phone_number": "contact.mobile",
    "code": { "$template": "U-{id.index}" },
    "role": { "$pick": ["student", "teacher"] },
    "score": { "$int": [0, 100] },
    "is_verified": { "$bool": 0.8 },
    "status": { "$literal": "active" },
    "mobile2": { "$gen": "mobile", "args": { "operator": "Rightel" } },
    "tags": { "$array": [1, 3], "of": "text.word" }
  }
}
```

A file can also be just the field map, or `{ "entities": { "users": { "count": 20, "fields": {...} },
"orders": { "count": { "per": "users", "min": 1, "max": 3 }, "fields": { "userId": "parent.id" } } } }`.
v2 adds `$unique`, `$nullable`, `$optional`, `$oneOf`, `$weighted`, `$regex` and `$ref`. See [`examples/`](./examples).

## Infer from your schema

```bash
npx farsi-mock infer prisma/schema.prisma --explain
```

```
field                  type      generator                                         conf  why
---------------------  --------  ------------------------------------------------  ----  ----------------------------------------------
User.codeMelli         string    {"$unique":{"$truncate":"person.nationalId","ma…  95%   national ID (کد ملی) (exact match "codemelli")
User.first_name        string    person.firstName                                  95%   first name (exact match "firstname")
User.role              string    {"$pick":["ADMIN","CUSTOMER","SELLER"]}           90%   enum values
User.isActive          boolean   {"$bool":0.85}                                    90%   boolean (mostly true)
User.zipCode           string    address.postalCode                                95%   postal code (exact match "zipcode")
Product.tags[]         string    text.word                                         95%   tag (exact match "tag")
Order.userId           string    ref:User.id                                       95%   reference to User
Order.productId        integer   ref:Product.id                                    85%   foreign key to Product (by name)
Order.shebaNumber      string    bank.sheba                                        95%   IBAN / Sheba (exact match "shebanumber")
...
source: prisma, models: User, Product, Order, fields: 31, average confidence: 94%
```

```bash
npx farsi-mock infer prisma/schema.prisma --write farsi-mock.json     # save, tweak, commit
npx farsi-mock schema farsi-mock.json -n 50 --seed 1 --sql --dialect postgres -o seed.sql
npx farsi-mock infer openapi.json --model User,Order --generate -n 20
npx farsi-mock infer src/schemas/user.mjs --export User --generate    # zod or mongoose module
npx farsi-mock infer sample.json --override customer_code=person.nationalId --generate
```

In code:

```ts
const r = iran.fromPrisma(schemaText);            // or fromZod / fromMongoose / fromOpenAPI / fromJsonSchema / fromSample / infer
r.explain();                                      // the table above
r.lowConfidence();                                // fields worth an override
const data = r.dataset({ User: 20, Order: 100 }); // linked: Order.userId is a real User.id
```

The alias dictionary covers English, Finglish and common abbreviations in any key style
(`nationalCode`, `national_code`, `NationalCode`, `code-melli`, `nid`, `kodMelli`; `mobile`, `phone`,
`tel`, `shomare_tamas`; `sheba`, `iban`, `shaba`; `card`, `pan`, `shomareKart`; `postalCode`, `zip`,
`codePosti`; `ostan`, `shahr`, `tavalod`, `nam`, `family`, ...). The model name breaks ties (`name` is a
product name in `Product`, a company name in `Company`). Formats, enums, min/max, maxLength, regex
patterns and unique indexes are respected. Zod is read structurally (v3 and v4) and Prisma is parsed as
text, so neither is a dependency.

## Constraints

```ts
const User = iran.schema({
  id: "id.uuid",
  mobile: iran.unique("contact.mobile"),             // no repeats in this batch
  email: iran.nullable("contact.email", 0.1),        // 10% null
  bio: iran.optional("text.sentence", 0.5),          // key missing half the time
  role: iran.weighted([["user", 90], ["admin", 10]]),
  contact: iran.oneOf("contact.mobile", "contact.landline"),
}, { uniqueBy: [["role", "mobile"]] });

const db = iran.dataset({
  users: [User, 20],
  orders: { schema: { id: "id.uuid", userId: "parent.id", total: "order.total" }, count: { per: "users", min: 0, max: 5 } },
  profiles: { schema: { userId: iran.ref("users", { unique: true }) }, count: 20 },
});
```

Types follow: `db.orders[0].total` is `number`, `User.one().email` is `string | null`, `bio` is optional.
Faker-style `iran.helpers` (`arrayElement`, `weightedArrayElement`, `maybe`, `unique`, `multiple`,
`replaceSymbols`, `fromRegExp`, `shuffle`, `slugify`, ...) are seeded too.

## More realistic data

- 200+ given names (male, female and a few unisex), common surnames plus compound ones joined with the
  zero-width non-joiner only where Persian needs it (کریم‌پور، بهرام‌زاده, but داودزاده and رضایی)
- Streets in common patterns (خیابان آزادی، بلوار شهید …، خیابان بیست‌متری، بن‌بست …)
- City coordinates from GeoNames (CC BY 4.0) with a population-based radius
- Company types (سهامی خاص، مسئولیت محدود، تعاونی، … and موسسه)
- Brand-free catalogs with toman price ranges: digital, wood/MDF (MDF ۱۶ میل، نئوپان، HDF، چندلایی), food,
  fashion, appliances, home, beauty, stationery
- Car plates, education levels, Jalali ranges with workdays and fixed holidays
  (`iran.jalali.between("1405/01/01", "1405/06/31", { workdaysOnly: true })`)
- Digits: `digits: "fa" | "latin"` on an instance or schema

## Outputs, seeding, mock API

```ts
import { toSql, toMongoJson, toTs } from "farsi-mock/output";
import { seedPrisma, seedDrizzle, seedMongoose } from "farsi-mock/seed";
import { createMockServer } from "farsi-mock/server";

toSql(db, { dialect: "postgres", createTable: true });       // or "mysql" / "sqlite"
toMongoJson(rows);                                           // [{ "_id": { "$oid": ... }, "createdAt": { "$date": ... } }]
toTs(db);                                                    // export interface User {...}; export const users: User[] = [...]
await seedPrisma(prisma, "user", db.users, { batchSize: 500 });
await seedDrizzle(drizzleDb, usersTable, db.users);
await createMockServer({ iran, resources: { users: User } }).listen(4000);
```

```bash
npx farsi-mock serve farsi-mock.json --port 4000 --seed 1
curl "localhost:4000/users?page=2&limit=10&city=شیراز&sort=-createdAt"
```

See [`examples/`](./examples): Prisma seed, Next.js seed (Drizzle) + mock route, Express mock server.

## AI assistants

`npx farsi-mock mcp` is a dependency-free MCP server (tools: generate, schema, infer, validate, paths).
Other MCP servers can reuse `tools` and `callTool` from `farsi-mock/ai`. There is also an agent skill at
[`skills/farsi-mock/SKILL.md`](./skills/farsi-mock/SKILL.md) and an [`llms.txt`](./llms.txt). Details in
[docs/AI.md](./docs/AI.md).

## Browser

```html
<script src="https://unpkg.com/farsi-mock"></script>
<script>const f = FarsiMock.createIran({ seed: 1 }); console.log(f.person());</script>
```

## Validators

The same checks used in the tests are exported: `validate.nationalId`, `.cardNumber`, `.sheba`, `.mobile`,
`.postalCode`, `.legalId`, `.bankOfCard`, `.bankOfSheba`, `.provinceOfLandline`.

## Data

See [DATA_SOURCES.md](./DATA_SOURCES.md). The tests check every generated value with the validators
from [parsi-mcp](https://github.com/amirjld/parsi-mcp).

## License

MIT
