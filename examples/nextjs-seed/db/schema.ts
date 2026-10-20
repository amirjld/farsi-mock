// Drizzle schema (Postgres) for the example.
import { pgTable, text, integer, timestamp, boolean, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  nationalCode: text("national_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  mobile: text("mobile").notNull().unique(),
  email: text("email"),
  city: text("city").notNull(),
  isActive: boolean("is_active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  orderNumber: text("order_number").notNull().unique(),
  total: integer("total").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
