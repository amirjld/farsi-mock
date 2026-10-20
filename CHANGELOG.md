# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.0] - 2026-10-20

### Added

- **Schema inference**: `iran.fromZod`, `fromJsonSchema`, `fromOpenAPI`, `fromPrisma`, `fromMongoose`,
  `fromSample` and auto-detecting `iran.infer`, plus `farsi-mock infer` (`--from`, `--model`,
  `--override`, `--overrides`, `--null-rate`, `--explain`, `--write`, `--generate`).
  - Multilingual alias dictionary (English, Finglish, abbreviations) for camelCase, snake_case,
    PascalCase and kebab-case names; model-aware disambiguation; foreign-key detection.
  - Respects enums, formats (email, uuid, uri, date, date-time, ...), min/max, maxLength, regex patterns,
    unique indexes, nullable/optional fields; detects Iranian formats in samples by checksum.
  - Mapping report with a confidence score and reason per field (`explain()`, `lowConfidence()`).
  - zod is an optional peer and read structurally (v3 and v4); Prisma is parsed as text.
- **Outputs**: `toSql` (Postgres, MySQL, SQLite; batching, CREATE TABLE, conflict skipping),
  `toMongoJson` / `toExtendedJson` (`$oid`, `$date`, relaxed or canonical), `toTs` (typed fixtures).
  CLI formats `sql`, `mongo`, `ts` with `--dialect`, `--table`, `--create-table`, `--ignore-conflicts`,
  `--batch-size`.
- **Seed helpers** (`farsi-mock/seed`): `seedPrisma`, `seedDrizzle`, `seedMongoose`, `seedMongo`,
  `seedBatches`, `seedDataset`, `reviveDates`. They take your client; no ORM dependency.
- **Mock REST server** (`farsi-mock/server`, `farsi-mock serve`): list/get, pagination with meta and
  `X-Total-Count`/`Link`, filters, ranges, search, sort, CORS, optional in-memory writes, mountable handler.
- **Constraints**: `iran.unique`, `iran.nullable`, `iran.optional`, `iran.weighted`, `iran.oneOf`,
  schema option `uniqueBy`, unique refs (`iran.ref("users", { unique: true })`), dataset counts per parent
  (`count: { per: "users", min, max }`) with `parent.<field>` paths. JSON schema files gain `$unique`,
  `$nullable`, `$optional`, `$oneOf`, `$weighted`, `$regex`, `$ref`.
- **Faker-style helpers** (`iran.helpers`): `arrayElement(s)`, `shuffle`, `weightedArrayElement`, `maybe`,
  `unique` (with `resetUnique`), `uniqueArray`, `multiple`, `replaceSymbols`, `fromRegExp`, `slugify`.
- **Types**: output types inferred from `schema()` and `dataset()` definitions (paths, markers, nested
  objects, arrays, functions); typed `extend`/`omit`/`pick`/`rename`.
- **Data**: more given names (male, female, unisex), compound surnames with correct ZWNJ, street patterns
  (شهید، بلوار، متری، بن‌بست), city coordinates from GeoNames (CC BY 4.0), company legal types,
  brand-free catalogs with toman ranges (digital, wood/MDF, food, fashion, appliance, home, beauty,
  stationery), car plates, education levels.
- **Jalali**: `jalali.between`, `dateTime`, `holidays`, `isHoliday`, `isWeekend`, `isOffDay`,
  `recentWorkday` (fixed solar holidays from parsi-mcp; `weekend: "thursday_friday"` option).
- **Locale**: `digits: "fa" | "latin"` on instances and schemas (`--digits` on the CLI).
- New paths: `vehicle.plate`, `person.education`, `geo.*`, `internet.*`, `date.workday`,
  `date.dateTimeJalali`, `commerce.category`, and more.
- **AI**: `farsi-mock/ai` (`tools`, `callTool`, `handleMcpMessage`, `serveMcpStdio`), dependency-free MCP
  stdio server (`farsi-mock mcp`), `skills/farsi-mock/SKILL.md`, `llms.txt`, docs/AI.md.
- **Packaging**: subpath exports (`/infer`, `/output`, `/seed`, `/server`, `/validate`, `/jalali`, `/ai`,
  `/browser`), shared chunks so classes are not duplicated across subpaths, browser IIFE build
  (`FarsiMock` global, unpkg/jsdelivr).
- CLI commands `plate`, `categories`, `holidays`.
- GitHub Actions CI (typecheck, build, test on Node 18/20/22), CONTRIBUTING.md, issue and PR templates,
  docs/API.md, examples (Prisma seed, Next.js + Drizzle seed and mock route, Express mock server).

### Changed

- `company().name` starts with «موسسه» for non-commercial institutes; `company()` adds `typeEn`.
- `product()` items come from the new catalogs and add `baseName` and `variant`.
- Address coordinates are spread around the real city centre instead of the province capital.
- A small share of first names are unisex and about 30% of surnames are compound.
- `seed()` also resets the `helpers.unique` store.

### Notes

- **Seeded output differs from 0.1.0** for the same seed (new data tables and generators). Snapshot tests
  based on 0.1.0 output need updating; this is the main reason for the major version.
- The v1 API is unchanged apart from the data changes above; existing schemas, presets and CLI flags work as before.
- Postal codes are still not tied to provinces (no openly licensed range table); see DATA_SOURCES.md.

## [0.1.0] - 2026-10-20

### Added

- First release: generators for people, contacts, addresses, bank accounts, companies, products and
  orders; flexible schemas with shared per-record context; presets; datasets with refs; JSON/CSV/JSONL
  output; CLI; safe national IDs (`000` prefix) with opt-in `realisticIds`.

[Unreleased]: https://github.com/amirjld/farsi-mock/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/amirjld/farsi-mock/compare/74fced3...v2.0.0
[0.1.0]: https://github.com/amirjld/farsi-mock/tree/74fced3
