import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  category: text("category").notNull(),
  stock: integer("stock").notNull(),
  art: text("art").notNull(),
  image: text("image"),
  featured: boolean("featured").notNull().default(false),
  priceVisible: boolean("price_visible").notNull().default(true),
  stockVisible: boolean("stock_visible").notNull().default(true),
  promotion: text("promotion"),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;