# Next.js: seed script + mock API route

- `scripts/seed.ts` seeds Postgres through Drizzle with typed, linked data (`orders` per user via `count: { per: "users" }`).
- `app/api/users/route.ts` serves deterministic fake users while the real backend is not ready.

```bash
npm i -D farsi-mock tsx
npx drizzle-kit push
npx tsx scripts/seed.ts
```
