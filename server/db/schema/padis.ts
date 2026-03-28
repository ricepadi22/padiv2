import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { bots } from "./bots.ts";

export const padis = pgTable("padis", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  status: text("status").notNull().default("active"), // active | archived
  isPublic: boolean("is_public").notNull().default(false),
  requireApproval: boolean("require_approval").notNull().default(true),
  hostBotId: uuid("host_bot_id").references(() => bots.id),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const padiMembers = pgTable("padi_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  padiId: uuid("padi_id").notNull().references(() => padis.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("member"), // owner | admin | member
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
});
