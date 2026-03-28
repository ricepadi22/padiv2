import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.ts";
import { users } from "./users.ts";
import { bots } from "./bots.ts";

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  parentTicketId: uuid("parent_ticket_id"), // self-ref for sub-tasks
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("backlog"),
  // backlog | todo | in_progress | in_review | done | blocked | cancelled
  priority: text("priority").notNull().default("medium"),
  // low | medium | high | urgent
  assigneeBotId: uuid("assignee_bot_id").references(() => bots.id),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdByBotId: uuid("created_by_bot_id").references(() => bots.id),
  ticketNumber: integer("ticket_number").notNull(),
  checkedOutByBotId: uuid("checked_out_by_bot_id").references(() => bots.id),
  checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketActivity = pgTable("ticket_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(), // human | bot | system
  actorUserId: uuid("actor_user_id").references(() => users.id),
  actorBotId: uuid("actor_bot_id").references(() => bots.id),
  action: text("action").notNull(),
  // created | status_changed | assigned | checked_out | checked_in | commented | sub_task_created
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  comment: text("comment"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
