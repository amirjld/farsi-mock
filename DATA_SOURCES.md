# Data sources

mock-iran ships small, hand-checked data tables. Nothing in this package was copied
from a real database, a real customer list or any private project.

| Data | Source | Licence / status |
| --- | --- | --- |
| Validation algorithms (national ID, Luhn, Sheba mod-97, mobile, postal code, legal national ID) | [parsi-mcp](https://github.com/amirjld/parsi-mcp) `src/lib` (same author). Legal-ID algorithm as documented by [persian-tools](https://github.com/persian-tools/persian-tools) | MIT |
| Card BINs and Sheba bank codes | parsi-mcp `src/lib/banks.ts` (entries kept only where several public lists agree). Only banks that currently issue both cards and Sheba numbers are used | MIT |
| Mobile operator prefixes | parsi-mcp `src/lib/phone.ts` verified ranges (MCI 0910-0919, 0990-0994; Irancell 0901-0905, 0930, 0933, 0935-0939, 0941; Rightel 0920-0922) | MIT |
| Landline area codes per province | parsi-mcp `src/lib/phone.ts` | MIT |
| Provinces and ISO 3166-2:IR codes | parsi-mcp `src/lib/places.ts`, verified against Wikipedia's ISO 3166-2:IR table | Facts |
| Cities per province (3-6 major cities each) | Hand-curated from general knowledge; spelling cross-checked with Wikipedia province articles | Facts (no text copied) |
| National-ID 3-digit issuing-office prefixes per city | `getPlaceByIranNationalId` table in [@persian-tools/persian-tools](https://github.com/persian-tools/persian-tools) 4.0.4, extracted by `scripts/build-places.cjs`. Only rows whose city name matches our curated list in the same province are used; cities with no match fall back to the province capital's prefixes | MIT |
| Approximate capital coordinates | General knowledge, rounded to 2 decimals and jittered by about 6 km | Facts |
| Given names (50 male, 50 female) and surnames (75) | Hand-curated list of very common Iranian names with standard Latin spellings | Facts (names are not copyrightable) |
| Street, alley, district, company and product words | Written for this project; generic words only, no brands or real business names | MIT (this repo) |
| Jalali calendar algorithm | Port of [jalaali-js](https://github.com/jalaali/jalaali-js) | MIT |

## Safety notes

- Emails use the reserved `example.com / example.org / example.net` domains (RFC 2606) unless you pass your own.
- A short blocklist removes full-name combinations of well-known public figures. Names are common, so ordinary
  people with the same name certainly exist; that is unavoidable and harmless for test data.
- Generated national IDs, cards and Sheba numbers are random and only *algorithmically* valid. Because the
  check-digit space is small, a generated number can coincide with a real one. Never use generated data for
  real transactions or identity checks. For national IDs that can never belong to anyone, use
  `unissuedNationalId: true` (prefix `000`, which is not in any published issuing-office table).
