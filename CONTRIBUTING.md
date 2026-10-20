# Contributing to farsi-mock

Thanks for helping! Bug reports, field aliases, data improvements and docs fixes are all welcome.
Persian or English, both fine. / فارسی یا انگلیسی، هر دو اوکیه.

## Setup

```bash
git clone https://github.com/amirjld/farsi-mock.git
cd farsi-mock
npm install
npm run typecheck && npm run build && npm test
```

Node 18+ is required. The CLI tests run against `dist/`, so build before testing.

## Ground rules

- **No runtime dependencies.** Optional integrations (zod, Prisma, mongoose, drizzle, mongodb) are read
  structurally or taken as arguments, never imported.
- **No real personal data.** Never commit real national IDs, phones, card numbers, emails or addresses, and
  no names of real private people or famous people/companies in name lists. Tests use generated values
  or well-known public test vectors.
- **Licensed data only.** New lists (names, places, coordinates, catalogs) need a source whose licence
  allows redistribution. Add it to `DATA_SOURCES.md`.
- **Safe defaults stay safe.** National IDs keep the `000` prefix unless `realisticIds` is set; emails use
  `example.*` domains.
- **Deterministic.** Everything random must go through the seeded RNG (`iran.int`, `iran.pick`, ...), never
  `Math.random()`.
- Files are UTF-8 without BOM, LF line endings. Persian text uses the zero-width non-joiner (U+200C)
  where it belongs (می‌شود, کریم‌پور).

## Where things live

| Path | What |
| --- | --- |
| `src/iran.ts` | generators (`Iran` class) |
| `src/schema.ts`, `src/types.ts` | schemas, markers, datasets, type inference |
| `src/infer/` | parsers (Prisma, Zod, Mongoose, OpenAPI, JSON Schema, samples), alias dictionary, mapper |
| `src/output.ts`, `src/seed.ts`, `src/server.ts` | outputs, seed adapters, mock server |
| `src/ai.ts` | MCP tools and stdio server |
| `src/data/` | data tables (see DATA_SOURCES.md); `scripts/` rebuild generated tables |
| `test/parsi/` | validators copied from parsi-mcp, used as an independent oracle |

## Adding a field alias

Add keys to the right entry in `src/infer/aliases.ts` (lowercase, no separators: `shomaremobile`), then add
the real-world spelling to the table in `test/infer.test.ts`. Accuracy must stay at 95% or higher.

## Commits and PRs

Small, focused commits with a clear message. Update `CHANGELOG.md` under "Unreleased".
