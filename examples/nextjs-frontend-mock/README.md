# Next.js: frontend mock mode

The app calls the API as usual; `NEXT_PUBLIC_API_MODE` decides who answers.

| `NEXT_PUBLIC_API_MODE` | What happens |
| --- | --- |
| `api` (default) | real backend; `src/mocks` is never downloaded |
| `mock` | every call is answered by `src/mocks`, in the exact shape of `openapi.json` |
| `hybrid` | real backend first; mock data when a GET returns an empty list/result or the backend is down |

`openapi.json` is a small synthetic spec (`{ data, meta }` envelope, `allOf` detail, CRUD).

```bash
npm install
npm run mocks          # farsi-mock frontend openapi.json -o src/mocks  (re-run when the spec changes)
npm run dev            # .env.development sets NEXT_PUBLIC_API_MODE=mock
```

Point `npm run mocks` at your backend's spec instead, e.g.
`npx farsi-mock frontend https://api.example.com/swagger/v1/swagger.json -o src/mocks --explain`.

## Files

- `src/mocks/` generated: `spec.ts` and `types.ts` are rewritten by `npm run mocks`; `index.ts` is yours
  (seed, `delay`, `errors`, `persist`, custom `handlers`) and is never overwritten.
- `src/lib/api.ts`: option A, mock in the browser. `createApiFetch` from `farsi-mock/frontend/client`, with the
  mocks behind `() => import("@/mocks")`, plus a small typed `get()` helper.
- `app/products/page.tsx`: TanStack Query with pagination and search; nothing mock-specific in the component.
- `app/api/[...path]/route.ts`: option B, mock on the server (BFF). With `API_MODE=mock` the route answers from
  `src/mocks` with one data set per browser (cookie), otherwise it proxies to `API_URL`. Use this when the
  browser already talks to `/api/...` on the Next.js server. Pick one option; with option B, call `/api/...`
  from the browser and leave `NEXT_PUBLIC_API_MODE=api`.

Try `?__status=500` on any request, or `delay: [300, 900]` in `src/mocks/index.ts`, to see error and loading states.
