// Seed the Next.js app's database (Drizzle + Postgres).
//   npm i -D farsi-mock tsx
//   "scripts": { "db:seed": "tsx scripts/seed.ts" }
import { drizzle } from "drizzle-orm/node-postgres";
import { createIran } from "farsi-mock";
import { seedDrizzle } from "farsi-mock/seed";
import { users, orders } from "../db/schema";

const db = drizzle(process.env.DATABASE_URL!);
const iran = createIran({ seed: "nextjs-demo" });

const data = iran.dataset({
  users: {
    count: 100,
    schema: {
      id: "id.uuid",
      nationalCode: iran.unique("person.nationalId"),
      fullName: "person.fullName",
      mobile: iran.unique("contact.mobile"),
      email: iran.nullable("contact.email", 0.15),
      city: "address.city",
      isActive: iran.weighted([[true, 9], [false, 1]]),
      createdAt: "date.past",
    },
  },
  orders: {
    count: { per: "users", min: 0, max: 5 }, // 0-5 orders for every user
    schema: {
      id: "id.uuid",
      userId: "parent.id",
      orderNumber: iran.unique("commerce.orderNumber"),
      total: "order.total",
      status: "order.status",
      createdAt: (f) => f.jalali.recentWorkday(90), // working days only
    },
  },
});

// data.users is typed: { id: string; nationalCode: string; fullName: string; ... }[]
await seedDrizzle(db, users, data.users, { batchSize: 500, onConflictDoNothing: true }); // ISO dates become Date objects
await seedDrizzle(db, orders, data.orders, { batchSize: 500 });
console.log(`seeded ${data.users.length} users, ${data.orders.length} orders`);
process.exit(0);
