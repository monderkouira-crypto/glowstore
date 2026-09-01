import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type OrderItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  deviceId: text("device_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  wilaya: text("wilaya").notNull(),
  address: text("address").notNull(),
  deliveryType: text("delivery_type").notNull(),
  deliveryFee: integer("delivery_fee").notNull(),
  total: integer("total").notNull(),
  items: jsonb("items").$type<OrderItem[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;