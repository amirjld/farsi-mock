# Mock REST API

No code at all:

```bash
npx farsi-mock serve ../shop.json --port 4000 --seed 1
npx farsi-mock serve prisma/schema.prisma --port 4000     # infers the resources first
```

Inside Express (or any node:http server): see `server.mjs`.

| Request | Result |
| --- | --- |
| `GET /api` | resources and counts |
| `GET /api/users?page=2&limit=20` | `{ data, meta: { page, limit, total, pages } }`, plus `X-Total-Count` and `Link` headers |
| `GET /api/users?_page=1&_limit=10` | bare array (json-server style) |
| `GET /api/users?city=شیراز&age_gte=30&sort=-createdAt&q=رضا` | filters, ranges, sort, search |
| `GET /api/users/:id` | one record by `id` / `_id` |
| `POST/PUT/PATCH/DELETE` | only with `writable: true` / `--writable` |
