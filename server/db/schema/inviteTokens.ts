import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.ts";
import { users } from "./users.ts";
import { bots } from "./bots.ts";
import { padis } from "./padis.ts";

export const inviteTokens = pgTable("invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  // Room-level invite (Middle World) — nullable when padiId is set
  roomId: uuid("room_id").references(() => rooms.id),
  // Padi-level invite — links personal bot to padi membership
  padiId: uuid("padi_id").references(() => padis.id),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending | accepted | expired | revoked
  acceptedByBotId: uuid("accepted_by_bot_id").references(() => bots.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
