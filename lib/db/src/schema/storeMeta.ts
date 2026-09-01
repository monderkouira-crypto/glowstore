import { pgTable, text } from "drizzle-orm/pg-core";

export const storeMetaTable = pgTable("store_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});