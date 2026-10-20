---
name: farsi-mock
description: Generate realistic, algorithmically valid Iranian test data (کد ملی, Sheba, card numbers, mobiles, postal codes, Persian names, addresses, products in toman, Jalali dates) and seed databases or mock APIs with it. Use when the user needs Iranian/Persian fake data, fixtures, seed scripts, SQL inserts, or a mock REST API, or wants to infer test data from a Prisma/Zod/Mongoose/OpenAPI schema.
---

# farsi-mock

Synthetic Iranian test data. Every ID passes its checksum, but national IDs start with `000` by default
(valid, never issued), emails use `example.*` domains, and no real people or companies are in the data.

## Pick the right tool

| Need | Do this |
| --- | --- |
| A few quick records | `npx farsi-mock user -n 20` (also `person`, `contact`, `bank`, `company`, `address`, `product`, `order`, `seller`, `plate`) |
| Data shaped like the user's DB | `npx farsi-mock infer prisma/schema.prisma --explain --write farsi-mock.json` then `npx farsi-mock schema farsi-mock.json -n 100 --sql` |
| SQL / Mongo / TS fixtures | add `--sql --dialect postgres`, `--mongo`, or `--ts` |
| Mock REST API | `npx farsi-mock serve farsi-mock.json --port 4000 --seed 1` |
| Inside code | `import { createIran } from "farsi-mock"` |
| As MCP tools | `npx farsi-mock mcp` (tools: farsi_mock_generate, farsi_mock_schema, farsi_mock_infer, farsi_mock_validate, farsi_mock_paths) |

## Workflow for "seed my database"

1. Find the schema: `prisma/schema.prisma`, zod schemas, mongoose models, an OpenAPI file, or a sample JSON.
2. Run `npx farsi-mock infer <file> --explain` and read the report. Fields under 50% confidence are guesses.
3. Fix guesses with `--override Model.field=path` (see `npx farsi-mock paths`) or edit the written JSON.
4. Generate with a seed so results are reproducible: `npx farsi-mock schema farsi-mock.json --seed 1 -n 50 --sql --dialect postgres -o seed.sql`.
   Or in a seed script use `seedPrisma` / `seedDrizzle` / `seedMongoose` from `farsi-mock/seed`.

## Schema cheat sheet (code)

```ts
import { createIran } from "farsi-mock";
const iran = createIran({ seed: 1 });
const User = iran.schema({
  id: "id.uuid",
  name: "person.fullName",          // same person across fields of a record
  nationalId: "person.nationalId",  // 000-prefixed, valid checksum
  mobile: iran.unique("contact.mobile"),
  email: iran.nullable("contact.email", 0.1),
  role: iran.weighted([["user", 9], ["admin", 1]]),
  address: { city: "address.city", postalCode: "address.postalCode" },
});
const data = iran.dataset({
  users: [User, 20],
  orders: { schema: { id: "id.uuid", userId: "parent.id", total: "order.total" }, count: { per: "users", min: 0, max: 3 } },
});
```

## Rules

- Never present generated values as real. Do not use `realisticIds: true` unless the user asks for real city prefixes.
- Card numbers pass Luhn with real bank BINs; they are fake but may collide with real cards. Keep them in test systems.
- Prices are toman. Dates are UTC; Jalali helpers live under `iran.jalali`.
- Lunar (Hijri) holidays are not included; only fixed solar holidays.
