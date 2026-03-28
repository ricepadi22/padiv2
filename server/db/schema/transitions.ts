import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.ts";
import { users } from "./users.ts";
import { bots } from "./bots.ts";

export const transitions = pgTable("transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  transitionType: text("transition_type").notNull(), // step_away | return | send_to_work | meeting_request | meeting_accepted | meeting_declined
  fromRoomId: uuid("from_room_id").references(() => rooms.id),
  toRoomId: uuid("to_room_id").references(() => rooms.id),
  initiatedByUserId: uuid("initiated_by_user_id").references(() => users.id),
  initiatedByBotId: uuid("initiated_by_bot_id").references(() => bots.id),
  reason: text("reason"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
