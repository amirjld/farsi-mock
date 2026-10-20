# Vite + React: frontend mock mode

Same idea with `VITE_API_MODE`, a .NET-style envelope (`{ isSuccess, statusCode, message, result }` with
`{ items, totalCount, page, pageSize, totalPages, hasNextPage }` pages) and both fetch and axios.

```bash
npm install
npm run mocks          # farsi-mock frontend openapi.json -o src/mocks
npm run dev:mock       # vite --mode mock     -> .env.mock:        VITE_API_MODE=mock (no backend)
npm run dev            # vite                 -> .env.development: VITE_API_MODE=hybrid
VITE_API_MODE=api npm run build   # production: the mocks chunk is never loaded
```

- `src/api.ts`: `createApiFetch` (fetch, TanStack Query, SWR).
- `src/http.ts`: an axios instance whose `adapter` is `createAxiosAdapter` in `mock`/`hybrid` mode and the
  normal axios adapter in `api` mode. Interceptors and error handling work the same: errors reject with an
  AxiosError-shaped object (`error.response.status`, `error.response.data`).
- `src/App.tsx`: list with `PageNumber` / `PageSize` / `Search`, and a POST that really adds a book to the mock store.
- `src/mocks/`: generated; `types.ts` gives `ResponseOf<"GET /api/Books">`.

`openapi.json` is synthetic. Only import adapters from `farsi-mock/frontend/client` in app code; that keeps the
runtime and data inside the lazily loaded mocks chunk (about 52 KB gzip) instead of the main bundle.
