import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { rooms, tickets, ticketActivity, bots, padis } from "../db/schema/index.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { publishEvent } from "../realtime/ws.js";

// Note: this router is mounted with mergeParams: true at /api/rooms/:roomId/tickets
const router = Router({ mergeParams: true });

async function getWorkerRoom(roomId: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return room?.world === "worker" ? room : null;
}

async function nextTicketNumber(roomId: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next FROM tickets WHERE room_id = ${roomId}`
  );
  return Number((result.rows[0] as { next: number }).next);
}

async function logActivity(ticketId: string, opts: {
  actorType: string;
  actorUserId?: string;
  actorBotId?: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  comment?: string;
}) {
  await db.insert(ticketActivity).values({ ticketId, ...opts });
}

// GET /api/rooms/:roomId/tickets/next — autonomous bot polls for next available ticket
// Atomically claims (checks out) the next unchecked-out todo/backlog ticket.
// Must be before the /:ticketId route to avoid being treated as a UUID.
router.get("/next", requireAuth, async (req: AuthRequest, res) => {
  if (!req.botId) {
    res.status(403).json({ error: "Only bots can use the /next endpoint" });
    return;
  }

  const room = await getWorkerRoom(req.params.roomId!);
  if (!room) {
    res.status(400).json({ error: "Tickets only available in Worker World rooms" });
    return;
  }

  // Atomic: pick the oldest unchecked-out todo/backlog ticket and immediately check it out
  const result = await db.execute(sql`
    UPDATE tickets
    SET checked_out_by_bot_id = ${req.botId},
        checked_out_at = NOW(),
        status = 'in_progress',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = (
      SELECT id FROM tickets
      WHERE room_id = ${room.id}
        AND status IN ('todo', 'backlog')
        AND checked_out_by_bot_id IS NULL
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  if (result.rows.length === 0) {
    res.json({ ticket: null }); // Nothing available
    return;
  }

  const ticket = result.rows[0] as typeof tickets.$inferSelect;

  await logActivity(ticket.id, {
    actorType: "bot",
    actorBotId: req.botId,
    action: "checked_out",
    toStatus: "in_progress",
    comment: "Auto-claimed via /next poll",
  });

  publishEvent(req.params.roomId!, { type: "ticket.checkout", ticket });

  res.json({ ticket });
});

// GET /api/rooms/:roomId/tickets
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const room = await getWorkerRoom(req.params.roomId!);
  if (!room) {
    res.status(400).json({ error: "Tickets only available in Worker World rooms" });
    return;
  }

  const status = req.query.status as string | undefined;
  const result = await db.select().from(tickets).where(
    and(
      eq(tickets.roomId, room.id),
      status ? eq(tickets.status, status) : undefined,
    )
  );
  res.json({ tickets: result });
});

// POST /api/rooms/:roomId/tickets
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const room = await getWorkerRoom(req.params.roomId!);
  if (!room) {
    res.status(400).json({ error: "Tickets only available in Worker World rooms" });
    return;
  }

  const schema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    assigneeBotId: z.string().uuid().optional(),
    parentTicketId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const ticketNumber = await nextTicketNumber(room.id);

  const [ticket] = await db.insert(tickets).values({
    roomId: room.id,
    ticketNumber,
    createdByUserId: req.user?.id,
    createdByBotId: req.botId,
    ...parsed.data,
  }).returning();

  await logActivity(ticket!.id, {
    actorType: req.user ? "human" : "bot",
    actorUserId: req.user?.id,
    actorBotId: req.botId,
    action: "created",
    toStatus: "backlog",
  });

  publishEvent(room.id, { type: "ticket.created", ticket });

  res.status(201).json({ ticket });
});

// GET /api/rooms/:roomId/tickets/:ticketId
router.get("/:ticketId", requireAuth, async (req: AuthRequest, res) => {
  const [ticket] = await db.select().from(tickets).where(
    and(eq(tickets.id, req.params.ticketId!), eq(tickets.roomId, req.params.roomId!))
  ).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const activity = await db.select().from(ticketActivity)
    .where(eq(ticketActivity.ticketId, ticket.id))
    .orderBy(ticketActivity.createdAt);

  res.json({ ticket, activity });
});

// PATCH /api/rooms/:roomId/tickets/:ticketId
router.patch("/:ticketId", requireAuth, async (req: AuthRequest, res) => {
  const [ticket] = await db.select().from(tickets).where(
    and(eq(tickets.id, req.params.ticketId!), eq(tickets.roomId, req.params.roomId!))
  ).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    assigneeBotId: z.string().uuid().nullable().optional(),
    comment: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { comment, ...updates } = parsed.data;
  const now = new Date();
  const extraUpdates: Record<string, unknown> = {};

  if (updates.status === "in_progress" && !ticket.startedAt) {
    extraUpdates.startedAt = now;
  }
  if (updates.status === "done" && !ticket.completedAt) {
    extraUpdates.completedAt = now;
  }
  if (updates.status === "cancelled" && !ticket.cancelledAt) {
    extraUpdates.cancelledAt = now;
  }

  const [updated] = await db.update(tickets)
    .set({ ...updates, ...extraUpdates, updatedAt: now })
    .where(eq(tickets.id, ticket.id))
    .returning();

  const actorType = req.user ? "human" : "bot";

  if (updates.status && updates.status !== ticket.status) {
    await logActivity(ticket.id, {
      actorType,
      actorUserId: req.user?.id,
      actorBotId: req.botId,
      action: "status_changed",
      fromStatus: ticket.status,
      toStatus: updates.status,
      comment,
    });
  } else if (comment) {
    await logActivity(ticket.id, {
      actorType,
      actorUserId: req.user?.id,
      actorBotId: req.botId,
      action: "commented",
      comment,
    });
  }

  if (updates.assigneeBotId !== undefined) {
    await logActivity(ticket.id, {
      actorType,
      actorUserId: req.user?.id,
      actorBotId: req.botId,
      action: "assigned",
    });
  }

  publishEvent(req.params.roomId!, { type: "ticket.updated", ticket: updated });

  res.json({ ticket: updated });
});

// POST /api/rooms/:roomId/tickets/:ticketId/checkout — atomic checkout
router.post("/:ticketId/checkout", requireAuth, async (req: AuthRequest, res) => {
  if (!req.botId) {
    res.status(403).json({ error: "Only bots can checkout tickets" });
    return;
  }

  const result = await db.execute(sql`
    UPDATE tickets
    SET checked_out_by_bot_id = ${req.botId},
        checked_out_at = NOW(),
        status = CASE WHEN status = 'todo' OR status = 'backlog' THEN 'in_progress' ELSE status END,
        started_at = CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END,
        updated_at = NOW()
    WHERE id = ${req.params.ticketId!}
      AND room_id = ${req.params.roomId!}
      AND (checked_out_by_bot_id IS NULL OR checked_out_by_bot_id = ${req.botId})
    RETURNING *
  `);

  if (result.rows.length === 0) {
    res.status(409).json({ error: "Ticket already checked out by another bot" });
    return;
  }

  const ticket = result.rows[0] as typeof tickets.$inferSelect;

  await logActivity(ticket.id, {
    actorType: "bot",
    actorBotId: req.botId,
    action: "checked_out",
    toStatus: ticket.status,
  });

  publishEvent(req.params.roomId!, { type: "ticket.checkout", ticket });

  res.json({ ticket });
});

// POST /api/rooms/:roomId/tickets/:ticketId/checkin — release checkout
router.post("/:ticketId/checkin", requireAuth, async (req: AuthRequest, res) => {
  if (!req.botId) {
    res.status(403).json({ error: "Only bots can checkin tickets" });
    return;
  }

  const [ticket] = await db.update(tickets)
    .set({ checkedOutByBotId: null, checkedOutAt: null, updatedAt: new Date() })
    .where(and(eq(tickets.id, req.params.ticketId!), eq(tickets.checkedOutByBotId, req.botId)))
    .returning();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found or not checked out by this bot" });
    return;
  }

  await logActivity(ticket.id, {
    actorType: "bot",
    actorBotId: req.botId,
    action: "checked_in",
  });

  publishEvent(req.params.roomId!, { type: "ticket.updated", ticket });

  res.json({ ticket });
});

// POST /api/rooms/:roomId/tickets/:ticketId/activity — add comment
router.post("/:ticketId/activity", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ comment: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [entry] = await db.insert(ticketActivity).values({
    ticketId: req.params.ticketId!,
    actorType: req.user ? "human" : "bot",
    actorUserId: req.user?.id,
    actorBotId: req.botId,
    action: "commented",
    comment: parsed.data.comment,
  }).returning();

  res.status(201).json({ activity: entry });
});

// POST /api/rooms/:roomId/tickets/:ticketId/spawn-worker
router.post("/:ticketId/spawn-worker", requireAuth, async (req: AuthRequest, res) => {
  if (!req.botId) {
    res.status(403).json({ error: "Only bots can spawn workers" });
    return;
  }

  const schema = z.object({
    subTaskTitle: z.string().min(1).max(200),
    subTaskDescription: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Get parent bot config to inherit provider
  const [parentBot] = await db.select().from(bots).where(eq(bots.id, req.botId)).limit(1);
  if (!parentBot) {
    res.status(404).json({ error: "Parent bot not found" });
    return;
  }

  // Determine provider for spawned bot:
  // - If parent uses padi_lm, inherit it (padiId stays the same)
  // - If room has a padiId with llmEnvironment, use padi_lm
  // - Otherwise inherit parent's provider
  const { randomUUID, createHash } = await import("crypto");
  const rawKey = `tw_bot_${randomUUID()}`;
  const apiKeyHash = createHash("sha256").update(rawKey).digest("hex");
  const apiKeyPrefix = rawKey.slice(0, 12);

  let spawnProvider = parentBot.provider ?? "http";
  let spawnProviderConfig = (parentBot.providerConfig ?? {}) as Record<string, unknown>;

  if (spawnProvider !== "padi_lm") {
    // Check if room belongs to a padi with an LLM environment
    const [parentRoom] = await db.select({ padiId: rooms.padiId }).from(rooms)
      .where(eq(rooms.id, req.params.roomId!)).limit(1);
    if (parentRoom?.padiId) {
      const [padi] = await db.select({ llmEnvironment: padis.llmEnvironment })
        .from(padis).where(eq(padis.id, parentRoom.padiId)).limit(1);
      if (padi?.llmEnvironment) {
        spawnProvider = "padi_lm";
        spawnProviderConfig = { padiId: parentRoom.padiId };
      }
    }
  }

  const [childBot] = await db.insert(bots).values({
    name: `worker_${Date.now()}`,
    displayName: `Worker (spawned by ${parentBot.displayName})`,
    type: "general",
    ownerUserId: parentBot.ownerUserId,
    parentBotId: parentBot.id,
    apiKey: rawKey,
    apiKeyHash,
    apiKeyPrefix,
    provider: spawnProvider,
    providerConfig: spawnProviderConfig,
  }).returning();

  // Create sub-ticket
  const ticketNumber = await nextTicketNumber(req.params.roomId!);
  const [subTicket] = await db.insert(tickets).values({
    roomId: req.params.roomId!,
    parentTicketId: req.params.ticketId!,
    title: parsed.data.subTaskTitle,
    description: parsed.data.subTaskDescription,
    ticketNumber,
    createdByBotId: req.botId,
    assigneeBotId: childBot!.id,
  }).returning();

  await logActivity(req.params.ticketId!, {
    actorType: "bot",
    actorBotId: req.botId,
    action: "sub_task_created",
    comment: `Spawned sub-task #${ticketNumber}: ${parsed.data.subTaskTitle}`,
  });

  publishEvent(req.params.roomId!, { type: "ticket.updated", ticket: subTicket });

  res.status(201).json({ childBot: { ...childBot!, apiKey: rawKey }, subTicket });
});

export default router;
