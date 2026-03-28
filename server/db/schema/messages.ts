import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.ts";
import { users } from "./users.ts";
import { bots } from "./bots.ts";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  authorType: text("author_type").notNull(), // human | bot | system
  authorUserId: uuid("author_user_id").references(() => users.id),
  authorBotId: uuid("author_bot_id").references(() => bots.id),
  body: text("body").notNull(),
  messageType: text("message_type").notNull().default("chat"), // chat | status_update | meeting_request | dispatch | step_away | return
  parentMessageId: uuid("parent_message_id"),
  metadata: jsonb("metadata").default({}),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
