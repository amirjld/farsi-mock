# farsi-mock

Realistic, **algorithmically valid** Iranian test data. Like Faker, but the national IDs pass the
checksum, cards pass Luhn, Sheba numbers pass mod-97 and point at the same bank as the card, mobile
prefixes belong to real operators, landlines carry the right province code, and every field of a record
agrees with the others (same person, same province).

- Zero runtime dependencies, ESM + CommonJS, TypeScript types
- Deterministic with `seed()`
- Your field names, your shape: a flexible schema API, plus JSON schema files for the CLI
- JSON, CSV and JSONL output

[فارسی](./README.fa.md)

> **For testing only.** Values are random and only *algorithmically* valid. A generated number can
> still coincide with a real person's ID or card, so never use this data for real payments, identity
> checks or messaging. Emails use the reserved `example.*` domains.

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
// { gender: "female", firstName: "شادی", lastName: "جعفری", fullName: "شادی جعفری",
//   firstNameEn: "Shadi", lastNameEn: "Jafari", fullNameEn: "Shadi Jafari", fatherName: "سعید",
//   birthDate: "1985-07-21", birthDateJalali: "1364/04/30", age: 41,
//   nationalId: "1298949270", birthProvince: "اصفهان", birthCity: "اصفهان" }

iran.mobile({ operator: "Irancell" }); // "09059498357"
iran.landline({ province: "Fars" });   // "07128222530"
iran.bank();                           // { bankName: "بانک ملت", cardNumber: "6104...", sheba: "IR..12..", accountNumber }
iran.company();                        // { name: "شرکت ... (سهامی خاص)", legalNationalId, economicCode, ... }
iran.address();                        // { province, city, street, alley, plaque, unit, postalCode, formatted: "تهران، ..." }
iran.many(() => iran.person(), 100);
```

Use `createIran({ seed, referenceDate })` for an independent instance. `referenceDate` fixes "now", so
dates are reproducible too.

## Generators

| Area | Methods |
| --- | --- |
| person | `person()`, `firstName({ gender })`, `lastName()`, `nationalId({ province, city, unissued })`, `birthDate({ minAge, maxAge })`, `gender()` |
| contact | `contact()`, `mobile({ operator, format })`, `landline({ province })`, `email()`, `postalCode({ dashed })` |
| address | `address({ province, city, persianDigits })`, `province()`, `city()`, `provinces()` |
| bank | `bank({ bank })`, `cardNumber({ bank, dashed })`, `sheba({ bank })`, `accountNumber()`, `banks()` |
| company | `company()`, `legalNationalId()`, `companyName()` |
| commerce | `product({ category })`, `productName()`, `price({ min, max, psychological })`, `order({ items, taxRate })`, `sku()`, `orderNumber()`, `categories()` |
| dates | `recentDate()`, `pastDate()`, `futureDate()`, `betweenDates()`, `jalali.of() / format() / inYear() / recent() / past() / future() / toGregorian()` |
| misc | `uuid()`, `objectId()`, `int()`, `float()`, `bool()`, `pick()`, `word()`, `sentence()`, `paragraph()` |

Details worth knowing:

- **National ID**: the first 3 digits are a real issuing-office code of the person's birth city (or the
  province capital when the city is not in the table). Pass `unissued: true` (or the schema context option
  `unissuedNationalId`) to use the `000` prefix instead.
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
  { "nationalCode": "1299492738", "full_name": "سارا محمودی", "phone_number": "09414983570",
    "city": "اصفهان", "landline": "03143707723", "createdAt": "1405/07/26" },
  { "nationalCode": "1137700998", "full_name": "امید افشار", "phone_number": "09037552061",
    "city": "خمینی‌شهر", "landline": "03186932434", "createdAt": "1405/07/27" }
]
```

**One record, one story.** Each record gets a shared context: `person.*`, `contact.*`, `address.*`,
`bank.*`, `company.*`, `product.*` and `order.*` are created once per record, so `full_name`, `email`,
`nationalCode`, landline and postal code all describe the same person in the same province, and the
first name matches the gender. Options: `context: { province, city, gender, operator, bank, category,
minAge, maxAge, unissuedNationalId, emailDomains }`, also as the first argument of `.one()` / `.many()`.

Field values can be:

| Value | Meaning |
| --- | --- |
| `"person.fullName"` | a path. Run `npx farsi-mock paths` for all of them |
| `"person"` | the whole entity object |
| `(f, ctx) => ...` | a function. `f` is the generator, `ctx` has `person`, `contact`, `address`, `bank`, `company`, `product`, `order`, `province`, `city`, `gender`, `index` and `record` (fields generated so far) |
| `{ ... }` | a nested object |
| `iran.array(n \| [min, max], gen)` | an array. Each item keeps the record's person and province but gets a fresh product, address, bank and contact |
| `iran.ref(schemaOrArray, "id")` | a value from a record generated earlier |
| `literal("text")` | a fixed string (plain strings are paths) |
| `42`, `true`, `null` | literals |

Unknown paths fail immediately with suggestions.

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

## Output

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
npx farsi-mock paths | banks | provinces
```

Types: `user`, `seller`, `address`, `product`, `order` (presets) and `person`, `contact`, `bank`,
`company` (raw generators). Options: `-n`, `--format json|csv|jsonl`, `--csv`, `--jsonl`, `--seed`,
`--province`, `--gender`, `--operator`, `--case`, `--ref-date`, `--unissued-ids`, `-o`, `--bom`, `--compact`.

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
"orders": { "count": 50, "fields": { "userId": "ref:users.id" } } } }`. See [`examples/`](./examples).

## Validators

The same checks used in the tests are exported: `validate.nationalId`, `.cardNumber`, `.sheba`, `.mobile`,
`.postalCode`, `.legalId`, `.bankOfCard`, `.bankOfSheba`, `.provinceOfLandline`.

## Data

See [DATA_SOURCES.md](./DATA_SOURCES.md). The tests check every generated value with the validators
from [parsi-mcp](https://github.com/amirjld/parsi-mcp).

## License

MIT
