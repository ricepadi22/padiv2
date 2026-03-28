import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.ts";

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  world: text("world").notNull(), // higher | middle | worker
  padiId: uuid("padi_id"), // nullable — only used for Higher World rooms
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"), // active | archived
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
