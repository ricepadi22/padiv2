import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messages } from "./messages.ts";
import { bots } from "./bots.ts";

export const botDispatchLog = pgTable("bot_dispatch_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id),
  botId: uuid("bot_id").notNull().references(() => bots.id),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("pending"), // pending | delivered | failed | skipped
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
