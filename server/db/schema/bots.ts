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
  apiKey: text("api_key").notNull().unique(), // kept during migration window, will be dropped later
  apiKeyHash: text("api_key_hash"),
  apiKeyPrefix: text("api_key_prefix"), // first 12 chars of raw key, safe to display
  provider: text("provider").notNull().default("http"), // http | openclaw_gateway | claude_api
  providerConfig: jsonb("provider_config").default({}),
  status: text("status").notNull().default("active"), // active | paused | offline
  config: jsonb("config").default({}),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
