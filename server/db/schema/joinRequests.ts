import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { padis } from "./padis.ts";
import { users } from "./users.ts";

export const joinRequests = pgTable("join_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  padiId: uuid("padi_id").notNull().references(() => padis.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  message: text("message"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
