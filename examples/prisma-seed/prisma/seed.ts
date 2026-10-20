// Seed a Prisma database with farsi-mock.
//   npm i -D farsi-mock tsx
//   package.json: "prisma": { "seed": "tsx prisma/seed.ts" }
//   npx prisma db seed
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createIran } from "farsi-mock";
import { seedPrisma, seedDataset } from "farsi-mock/seed";

const prisma = new PrismaClient();
const iran = createIran({ seed: 1405 }); // same data on every run

// 1. Infer generators from schema.prisma (field names like codeMelli, mobile, zipCode are recognised).
const inferred = iran.fromPrisma(readFileSync(new URL("./schema.prisma", import.meta.url), "utf8"), {
  overrides: { "Product.tags[]": "text.word" }, // fix anything the report marks as low confidence
});
console.log(inferred.explain());

// 2. Generate linked data (Order.userId points at generated users) and insert it in batches.
const data = inferred.dataset({ User: 50, Product: 30, Order: 200 });

// Autoincrement ids are generated as 1..n; drop them if you prefer the database to assign them
// (only safe when nothing references them).
await seedDataset(data, (model, rows) => seedPrisma(prisma, model, rows, { skipDuplicates: true }));

await prisma.$disconnect();
