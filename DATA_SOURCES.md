# Data sources

farsi-mock ships small, hand-checked data tables. Nothing in this package was copied
from a real database, a real customer list or any private project.

| Data | Source | Licence / status |
| --- | --- | --- |
| Validation algorithms (national ID, Luhn, Sheba mod-97, mobile, postal code, legal national ID) | [parsi-mcp](https://github.com/amirjld/parsi-mcp) `src/lib` (same author). Legal-ID algorithm as documented by [persian-tools](https://github.com/persian-tools/persian-tools) | MIT |
| Card BINs and Sheba bank codes | parsi-mcp `src/lib/banks.ts` (entries kept only where several public lists agree). Only banks that currently issue both cards and Sheba numbers are used | MIT |
| Mobile operator prefixes | parsi-mcp `src/lib/phone.ts` verified ranges (MCI 0910-0919, 0990-0994; Irancell 0901-0905, 0930, 0933, 0935-0939, 0941; Rightel 0920-0922) | MIT |
| Landline area codes per province | parsi-mcp `src/lib/phone.ts` | MIT |
| Provinces and ISO 3166-2:IR codes | parsi-mcp `src/lib/places.ts`, verified against Wikipedia's ISO 3166-2:IR table | Facts |
| Cities per province (3-6 major cities each) | Hand-curated from general knowledge; spelling cross-checked with Wikipedia province articles | Facts (no text copied) |
| National-ID 3-digit issuing-office prefixes per city (only with `realisticIds`) | `getPlaceByIranNationalId` table in [@persian-tools/persian-tools](https://github.com/persian-tools/persian-tools) 4.0.4, extracted by `scripts/build-places.cjs`. Only rows whose city name matches our curated list in the same province are used; cities with no match fall back to the province capital's prefixes | MIT |
| City coordinates (132 cities) | [GeoNames](https://www.geonames.org/) `IR.zip` dump (populated places), matched to our city list by `scripts/build-geo.cjs`. Generated points are random within a radius derived from population (`clamp(sqrt(pop)/60, 2, 25)` km), so they are approximate and can fall outside real city limits | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), attribution: GeoNames |
| Approximate province-capital coordinates (fallback) | General knowledge, rounded to 2 decimals | Facts |
| Given names (99 male, 100 female, 7 unisex), surnames (75) and surname roots/suffixes for compound surnames | Hand-curated list of very common Iranian names with standard Latin spellings | Facts (names are not copyrightable) |
| Street, alley, district, company and product words; company legal types; education levels; plate letters by vehicle type | Written for this project from general knowledge (Iranian Commercial Code company types, common street naming patterns); generic words only, no brands or real business names | MIT (this repo) |
| Product catalogs and toman price ranges (digital, wood/MDF, food, fashion, appliance, home, beauty, stationery) | Written for this project; brand-free item names, price ranges are rough 1405 retail estimates for realism, not market data | MIT (this repo) |
| Fixed solar public holidays | parsi-mcp `src/lib/dates2.ts`, which follows Wikipedia "Public holidays in Iran". Lunar holidays are not included | MIT / facts |
| Field-name alias dictionary (inference) | Written for this project (English, Finglish and common abbreviations) | MIT (this repo) |
| Jalali calendar algorithm | Port of [jalaali-js](https://github.com/jalaali/jalaali-js) | MIT |

## Not included (and why)

- **Postal codes consistent with the province.** Generated postal codes pass the format rules, but their
  first digits are not tied to the province: no province-to-postal-range table with a licence that allows
  redistribution was found (the persian-tools source for this was unavailable and nothing equivalent is
  published by Iran Post under an open licence).
- **Vehicle makes and models.** Real makes are brand names and the market changes quickly; only plate
  formats are generated, and plate region codes are random, not mapped to provinces.
- **Lunar (Hijri) holidays.** They move every year and depend on the official calendar announcement.

## Safety notes

- Emails use the reserved `example.com / example.org / example.net` domains (RFC 2606) unless you pass your own.
- A short blocklist removes full-name combinations of well-known public figures. Names are common, so ordinary
  people with the same name certainly exist; that is unavoidable and harmless for test data.
- National IDs are safe by default: valid checksum, prefix `000`, which is not in any published
  issuing-office table. Real city prefixes (from the persian-tools table above) are used only with
  `realisticIds: true` / `--realistic-ids`.
- Inference reads only the *shape* of sample files (types, formats, short code-like enum values); sample
  values are never copied into generated data.
- URLs use `example.com` and IP addresses use the private `10.0.0.0/8` range. Image fields in frontend mock
  mode are SVG placeholders generated on the fly (a coloured box with the size or initials), so no image
  files or external image services are involved.
- Frontend mock mode reads only the *structure* of your OpenAPI spec (paths, schemas, parameter names,
  enums, limits, defaults/examples of envelope codes). It never copies example values of record fields; the
  test fixture `test/fixtures/shop.openapi.json` is a synthetic spec written for this project.
- Card and Sheba numbers are random and only *algorithmically* valid. There is no published Shetab test
  range, so a generated card can coincide with a real one. Never use generated data for real transactions
  or identity checks.
