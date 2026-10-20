# Prisma seed

```bash
npm i -D farsi-mock tsx
npx prisma db push
npx prisma db seed     # with "prisma": { "seed": "tsx prisma/seed.ts" } in package.json
```

Prefer explicit schemas? Write them by hand instead of inferring:

```ts
const User = iran.schema({
  id: "id.uuid", codeMelli: "person.nationalId", first_name: "person.firstName", lastName: "person.lastName",
  mobile: iran.unique("contact.mobile"), email: iran.nullable("contact.email", 0.2), role: iran.weighted([["CUSTOMER", 9], ["ADMIN", 1]]),
  isActive: "helpers.bool", createdAt: "date.past", updatedAt: "date.recent",
});
await seedPrisma(prisma, "user", User.many(50));
```

Or without code: `npx farsi-mock infer prisma/schema.prisma --generate -n 50 --sql --dialect postgres -o seed.sql`.
