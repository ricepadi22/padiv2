import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.ts";
import { users } from "./users.ts";
import { bots } from "./bots.ts";

export const presence = pgTable("presence", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  memberType: text("member_type").notNull(), // human | bot
  userId: uuid("user_id").references(() => users.id),
  botId: uuid("bot_id").references(() => bots.id),
  status: text("status").notNull().default("active"), // active | idle | typing | observing
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});
