# Frontend mock mode

Your frontend is wired to real endpoints, but the backend has no data yet (or is not running), so you
cannot see or test the design. Frontend mock mode answers those requests **inside the app**, in exactly
the shape of the real API: same envelopes (`{ data, meta }`, `{ isSuccess, result }`, ...), same
pagination wrappers, same field names. One environment variable switches between the real API and the mock.

```bash
NEXT_PUBLIC_API_MODE=mock   # or VITE_API_MODE=mock; "api" = real backend, "hybrid" = real, mock when empty
```

Three entry points:

- `farsi-mock/frontend/client`: the API_MODE switch and adapters (fetch, axios, MSW, Next.js). Import this in app code.
- `farsi-mock/frontend/runtime`: the mock runtime for pre-compiled specs (what `src/mocks` imports), plus the adapters.
- `farsi-mock/frontend`: everything, including the OpenAPI compiler (for specs loaded at runtime, tests, scripts).

Import the adapters from `/client` and keep `src/mocks` behind a lazy `import()`: bundlers then put the runtime
and data in the mocks chunk, which is never downloaded in `api` mode. Zero dependencies, no Node APIs: browsers, Next.js (node and edge),
Vite, MSW, workers and tests.

- [1. Get a mock API](#1-get-a-mock-api)
- [2. Plug it into the app](#2-plug-it-into-the-app)
- [3. What the mock does](#3-what-the-mock-does)
- [4. Options](#4-options)
- [5. Without OpenAPI](#5-without-openapi)
- [6. Bundle size](#6-bundle-size)
- [7. Limits](#7-limits)

## 1. Get a mock API

**Recommended: snapshot the spec once** (no OpenAPI parsing in the browser, typed responses):

```bash
npx farsi-mock frontend https://api.example.com/swagger/v1/swagger.json -o src/mocks --base-url /api
# or a local file:  npx farsi-mock frontend openapi.json -o src/mocks --explain
```

It writes three files:

| File | What | Re-generated? |
| --- | --- | --- |
| `spec.ts` | the compiled mock spec (routes, envelopes, field generators) | yes |
| `types.ts` | one type per component schema + an `Endpoints` map (`"GET /products/{id}"` -> response/body/query/params) | yes |
| `index.ts` | `export const api = createMockRuntime<Endpoints>(spec, { ... })`: your options and custom handlers | only created when missing (`--force` to overwrite) |

`--explain` prints what every route will return:

```
GET /v1/products              list Product    200  { data: Product[], meta: { page: $page, perPage: $pageSize, total: $total, totalPages: $pages } }
GET /v1/products/{productId}  detail Product  200  { data: Product }
GET /v1/orders                list Order      200  { isSuccess, message: $message, errors, result: { items: Order[], totalCount: $total, ... } }
POST /v1/auth/login           other           200  { accessToken, refreshToken, expiresIn }
```

Other flags: `--lang js|json`, `--seed`, `--count 50`, `--id`, `--override Product.title=product.name`,
`--images url` (default: offline SVG placeholders), `--null-rate 0.2`. The spec must be JSON (convert
YAML with `npx js-yaml openapi.yaml > openapi.json`).

**Or compile at runtime** (handy for prototypes; adds the compiler to the mock chunk):

```ts
import { createMockApi } from "farsi-mock/frontend";
export const api = createMockApi({ spec: "/swagger/v1/swagger.json" });   // URL, object, JSON text or a promise
```

## 2. Plug it into the app

### fetch (works for TanStack Query, SWR, ky, ofetch, server components...)

```ts
// src/lib/api-fetch.ts
import { createApiFetch } from "farsi-mock/frontend/client";

export const apiFetch = createApiFetch({
  mode: process.env.NEXT_PUBLIC_API_MODE,          // Vite: import.meta.env.VITE_API_MODE
  mock: () => import("@/mocks"),                   // lazy: never loaded in "api" mode
});

// usage stays the same as fetch
const res = await apiFetch(`${API_URL}/products?page=2`);
```

Write the env var out literally (`process.env.NEXT_PUBLIC_API_MODE`, `import.meta.env.VITE_API_MODE`):
bundlers only inline env vars written that way. Values: `mock`, `api`, `hybrid` (case-insensitive).

TanStack Query needs nothing special: its `queryFn` calls `apiFetch`. To mock *every* fetch in the page
(third-party SDKs included) use `installMockFetch(() => import("@/mocks"))` once at startup; it returns an
uninstall function.

### hybrid mode

`hybrid` calls the real backend first and answers from the mock only when a GET comes back empty
(`[]`, `{ data: [] }`, `{ result: { items: [] } }`, `null`...) or fails on the network. Auth routes
(`/auth`, `/login`, `/token`, `/otp`) always stay real. Change the rule with `hybridFallback`:

```ts
createApiFetch({ mode: "hybrid", mock: () => import("@/mocks"), hybridFallback: ({ method, status, body, error }) => method === "GET" && (!!error || status === 404) });
```

### axios (axios is not a dependency)

```ts
import axios from "axios";
import { apiMode, createAxiosAdapter } from "farsi-mock/frontend/client";

const mode = apiMode(process.env.NEXT_PUBLIC_API_MODE);
export const http = axios.create({
  baseURL: "/api",
  adapter: mode === "api" ? undefined : createAxiosAdapter(() => import("@/mocks"), {
    mode: mode === "hybrid" ? "hybrid" : "mock",
    fallback: axios.getAdapter(["xhr", "http", "fetch"]),     // real requests (unknown routes / hybrid)
  }),
});
```

Errors reject with an AxiosError-shaped object (`isAxiosError`, `code`, `response.status`, `response.data`),
so interceptors and `axios.isAxiosError()` keep working.

### MSW (optional peer; pass its `http`)

```ts
import { http } from "msw";
import { setupWorker } from "msw/browser";
import { createMswHandlers } from "farsi-mock/frontend/client";
import { api } from "@/mocks";

await setupWorker(...createMswHandlers(api, { http })).start({ onUnhandledRequest: "bypass" });
```

One handler per route (`*/v1/products/:productId`, any origin), or `{ catchAll: true }` for a single
handler. Unknown requests fall through to the network.

### Next.js

Mock backend on the Next.js server itself (works for server components, route handlers and the browser):

```ts
// app/api/[...path]/route.ts   (only mounted in mock mode; see the example for the toggle)
import { createNextRouteHandlers } from "farsi-mock/frontend/client";
export const { GET, POST, PUT, PATCH, DELETE } = createNextRouteHandlers(() => import("@/mocks"), {
  mount: "/api",       // URL prefix of this catch-all, replaced by the spec's basePath
  session: true,       // each browser (cookie) gets its own copy of the data
});
```

Or answer from `middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createMockMiddleware, isMockMode } from "farsi-mock/frontend/client";
const mock = createMockMiddleware(() => import("./src/mocks"), { prefix: "/api" });
export async function middleware(req: NextRequest) {
  if (isMockMode(process.env.NEXT_PUBLIC_API_MODE)) { const r = await mock(req); if (r) return r; }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
```

### Several backends

```ts
import { combineMockApis } from "farsi-mock/frontend/client";
export const api = combineMockApis(shopApi, sellerApi, adminApi);   // first matching route answers
```

### Typed calls (tests, Storybook, scripts)

```ts
const r = await api.request("GET /products/{productId}", { params: { productId: 3 } });
//    ^? { data?: ProductDetail }  (from types.ts)
```

## 3. What the mock does

**Envelopes.** Each response schema is walked (`$ref`, `allOf`, `oneOf`/`anyOf`, nullable). The list
array (`data`, `items`, `results`, `content`, `rows`, ... or a bare array) and the record (`data`,
`result`, `item`, ... or the body itself) are found, and the fields around them are filled from the
request:

| Field names (any case, `_`/`-` ignored) | Value |
| --- | --- |
| `total`, `totalCount`, `totalElements`, `totalRow`, `count`, `recordsTotal` | total after filters |
| `page`, `pageNumber`, `currentPage`, `pageIndex`, `number` | current page |
| `pageSize`, `perPage`, `limit`, `size`, `take` | page size |
| `totalPages`, `pages`, `pageCount`, `lastPage` | page count |
| `hasNext`, `hasNextPage`, `hasMore` / `hasPrev`, `hasPreviousPage` | booleans |
| `next`, `prev` (string) / `nextPage` (number) | URL / page number |
| `first`, `last`, `empty`, `numberOfElements`, `offset` | Spring-style page fields |
| `isSuccess`, `success`, `ok` | `true` (`false` in error bodies) |
| `status` (string), `statusCode`/`code` (number) | `"success"` / HTTP status (or the schema's `default`/`example`, e.g. `0`) |
| `message`, `msg` | Persian message (`عملیات با موفقیت انجام شد`, `مورد درخواستی پیدا نشد`, ...) |
| `errors` | `[]` / `null` on success, filled on errors |
| `timestamp`, `traceId` | now / a uuid |

**Records.** Fields are generated with farsi-mock's name inference (`nationalCode` -> valid 000-prefixed
code, `mobile` -> `09...`, `price` -> toman, `createdAt` -> recent date, `categoryId` -> an existing
category's id, `avatarUrl` -> offline SVG avatar...). Enums, min/max, formats and patterns from the
schema are respected. Response shapes contain only fields that are in the spec.

**Resources.** Routes that share a path (`/products`, `/products/{id}`) or a schema share one store.
The list item and the detail record are the same object; detail-only fields (`ProductDetail allOf
Product`) are generated once per record. Nested lists (`/categories/{categoryId}/products`) only return
records whose `categoryId` matches.

**Path params.** `GET /products/9999` for an id that is not in the store generates a record with that
id, deterministic by seed (same id, same record). Use `notFound: "404"` to get the spec's 404 body instead.

**Query params.** Read from the operation's parameters, with common fallbacks:

- pagination: `page`/`pageNumber`/`pageIndex` (0-based when the param's minimum/default is 0),
  `pageSize`/`limit`/`perPage`/`size`/`take`, `offset`/`skip`
- search: `q`, `search`, `query`, `keyword`, `term` (all text fields, Persian ی/ك normalized)
- sort: `sort=-price`, `sort=price:desc`, `sortBy=price&order=desc`, several keys with commas
- filters: any param named like a field (`status=paid`, `status=paid,shipped`, `inStock=true`),
  ranges (`minPrice`, `maxPrice`, `price_gte`, `createdAt_lte`), `field_like`, `field_ne`

**Writes.** `POST` creates (body fields over a generated record, id = max+1 or a new uuid/ObjectId,
`createdAt`/`updatedAt` set to now, newest first, `Location` header). `PUT`/`PATCH` update, `DELETE`
removes (then 404). Unknown body fields are dropped, deep (`strict: false` keeps them). Other POSTs
(`/auth/login`) just return their response shape.

**Errors and latency.** `?__status=500` or the `x-mock-status: 500` header forces an error;
`errors: { "GET /orders": 503, "POST /products": { status: 422, rate: 0.3 } }` and `errorRate: 0.05`
simulate failures; error bodies use the spec's error schema (`404`, `4XX`, `default`). `delay: [200, 800]`,
`?__delay=2000` or `x-mock-delay` add latency so loading states show.

## 4. Options

```ts
createMockRuntime(spec, {           // same options for createMockApi({ spec, ... })
  id: "shop",                       // keeps data across hot reloads (store on globalThis); localStorage key
  seed: 1,                          // same seed => same data
  referenceDate: "2026-10-01",      // "now" for generated dates (default: today 00:00)
  count: { Product: 120 },          // records per resource (default 30)
  baseUrl: "/api",                  // where the app calls the API (default: the spec's servers[0] path)
  pageSize: 20, maxPageSize: 100,
  delay: [150, 600], errorRate: 0, errors: {},
  persist: true,                    // localStorage | "sessionStorage" | { storage, key }
  strict: true,                     // drop body fields that are not in the spec
  notFound: "generate",             // or "404"
  iran: { digits: "fa" },           // generator options (Persian digits in text, weekend, ...)
  handlers: {                       // custom logic first; return a body or ctx.reply(status, body)
    "GET /me": ({ headers, f }) => ({ data: { fullName: f.person().fullName, role: headers.authorization ? "admin" : "guest" } }),
    "POST /auth/login": ({ body, reply }) => body?.password ? { accessToken: "mock" } : reply(401, { message: "رمز اشتباه است" }),
  },
  onRequest: ({ method, url, status, ms }) => console.debug("[mock]", method, url, status, ms),
});
```

Compile-time options (`farsi-mock frontend` flags or `createMockApi`): `overrides`
(`{ "Product.title": "product.name", "slug": "internet.slug" }`), `count`, `images` (`"svg"`/`"url"`),
`nullRate` (share of nullable fields that are `null`, default 0.1 so empty states show up).

Also on the API object: `api.fetch(input, init)` (a `Response`), `api.handle(req)` (plain object or
`Request`; `undefined` when no route matches), `api.matches(method, url)`, `api.rows("Product")`,
`api.reset()`, `api.fork()` (fresh store, same spec), `api.routes()`.

## 5. Without OpenAPI

```ts
import { createMockApi } from "farsi-mock/frontend";   // defineMockSpec is in /runtime too

export const api = createMockApi({
  basePath: "/api",
  envelope: "result",               // raw | data | items | result (.NET) | spring, or { list, record, error } templates
  crud: true,                       // GET/POST /products, GET/PUT/PATCH/DELETE /products/{id}
  resources: {
    Product: { fields: { id: "id.index", title: "product.name", price: "product.price", city: "address.city" }, count: 40 },
    Customer: { fields: { _id: "id.objectId", fullName: "person.fullName", mobile: "contact.mobile" } },
  },
  routes: {
    "GET /shop/products": { list: "Product", envelope: { ok: true, rows: "$items", paging: { page: "$page", total: "$total" } } },
    "GET /banner": { body: { title: "gen:product.name", badge: "ویژه", count: { $int: [1, 3] } } },
  },
});
```

Templates: `$items`, `$record`, `$total`, `$page`, `$pageSize`, `$pages`, `$count`, `$offset`, `$hasNext`,
`$hasPrev`, `$next`, `$prev`, `$first`, `$last`, `$empty`, `$ok`, `$status`, `$statusText`, `$message`,
`$now`; `"gen:<path>"` and `{ $int | $pick | ... }` generate; anything else is literal. Field definitions
use the [schema file format](./API.md#schema-files-json); `iran.fromPrisma(...).fields("User")` output
works too.

## 6. Bundle size

| Import | min | min+gzip |
| --- | --- | --- |
| `farsi-mock/frontend/client` (`createApiFetch`, `apiMode`; mocks lazy-imported) | ~3 KB | ~1.4 KB |
| `farsi-mock/frontend/runtime` (runtime + generators + data) | ~166 KB | ~52 KB |
| `farsi-mock/frontend` (+ OpenAPI compiler and name inference) | ~187 KB | ~59 KB |

Keep the mock behind `() => import("@/mocks")` and import adapters from `farsi-mock/frontend/client`: production
bundles then only carry the switch. (Importing the adapters from `/runtime` in app code works, but bundlers then
put the runtime in the main chunk because the lazy chunk shares that module.)

## 7. Limits

- JSON specs only (convert YAML first). `oneOf`/`anyOf` use the first non-null branch;
  discriminators, `additionalProperties` maps and `multipart` bodies are not modelled.
- Cursor pagination returns `next`/`prev` URLs with `page=`; real opaque cursors are not emulated.
- Business rules (stock, carts, permissions, state machines) are not inferred: add `handlers`.
- Persistence keeps changed resources only; changing the spec, seed or counts starts fresh.
- Data is random and for testing only (see the main README): national IDs use the safe `000` prefix,
  emails `example.*`, images are generated SVGs.
