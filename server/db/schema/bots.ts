import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.ts";

export const bots = pgTable("bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  type: text("type").notNull().default("general"), // coder | researcher | reviewer | general
  avatarUrl: text("avatar_url"),
  description: text("description"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  apiKey: text("api_key").notNull().unique(),
  status: text("status").notNull().default("active"), // active | paused | offline
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
