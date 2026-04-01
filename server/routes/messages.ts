import { Router } from "express";
import { eq, and, or, ne, isNull, lt, gt, desc, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { messages, rooms, roomMembers, botDispatchLog, bots } from "../db/schema/index.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { publishEvent } from "../realtime/ws.js";
import { routeMessageToBots } from "../services/messageRouter.js";

const router = Router({ mergeParams: true });

// List messages (cursor pagination, newest last)
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before as string | undefined;
  const since = req.query.since as string | undefined;

  if (before && since) {
    res.status(400).json({ error: "Cannot use both before and since" });
    return;
  }

  if (since) {
    const result = await db.select().from(messages).where(
      and(
        eq(messages.roomId, req.params.roomId!),
        isNull(messages.deletedAt),
        gt(messages.createdAt, new Date(since)),
        // When a bot polls ?since=, exclude its own messages to prevent self-reply loops
        req.botId ? or(isNull(messages.authorBotId), ne(messages.authorBotId, req.botId)) : undefined,
      )
    ).orderBy(asc(messages.createdAt)).limit(limit);

    res.json({ messages: result });
    return;
  }

  const result = await db.select().from(messages).where(
    and(
      eq(messages.roomId, req.params.roomId!),
      isNull(messages.deletedAt),
      before ? lt(messages.createdAt, new Date(before)) : undefined,
    )
  ).orderBy(desc(messages.createdAt)).limit(limit);

  res.json({ messages: result.reverse() });
});

// Post a message
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    body: z.string().min(1).max(10000),
    messageType: z.enum(["chat", "status_update", "meeting_request", "dispatch", "step_away", "return"]).default("chat"),
    parentMessageId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [room] = await db.select().from(rooms).where(eq(rooms.id, req.params.roomId!)).limit(1);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  // Enforce observer rule: observers in Worker World cannot post
  if (room.world === "worker" && req.user) {
    const [member] = await db.select().from(roomMembers).where(
      and(
        eq(roomMembers.roomId, room.id),
        eq(roomMembers.userId, req.user.id),
        isNull(roomMembers.leftAt),
      )
    ).limit(1);
    if (member?.role === "observer") {
      res.status(403).json({ error: "Observers cannot post messages" });
      return;
    }
  }

  const [message] = await db.insert(messages).values({
    roomId: room.id,
    body: parsed.data.body,
    messageType: parsed.data.messageType,
    parentMessageId: parsed.data.parentMessageId,
    authorType: req.user ? "human" : "bot",
    authorUserId: req.user?.id,
    authorBotId: req.botId,
  }).returning();

  // Publish to WebSocket subscribers
  publishEvent(room.id, { type: "message.new", message });

  // Route to bots in this room (fire-and-forget)
  // In Middle World, only route human messages — bot replies must not re-enter routing
  // (prevents feedback loops when an agent also subscribes to the /ws broadcast)
  const isHumanPost = !!req.user;
  if (isHumanPost || room.world === "worker") {
    void routeMessageToBots(message!, room);
  }

  res.status(201).json({ message });
});

// Edit a message
router.patch("/:messageId", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ body: z.string().min(1).max(10000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [msg] = await db.select().from(messages).where(eq(messages.id, req.params.messageId!)).limit(1);
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (req.user && msg.authorUserId !== req.user.id) {
    res.status(403).json({ error: "Cannot edit another user's message" });
    return;
  }
  const [updated] = await db.update(messages).set({ body: parsed.data.body, editedAt: new Date() }).where(eq(messages.id, msg.id)).returning();
  publishEvent(msg.roomId, { type: "message.edited", message: updated! });
  res.json({ message: updated });
});

// Soft-delete a message
router.delete("/:messageId", requireAuth, async (req: AuthRequest, res) => {
  const [msg] = await db.select().from(messages).where(eq(messages.id, req.params.messageId!)).limit(1);
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (req.user && msg.authorUserId !== req.user.id) {
    res.status(403).json({ error: "Cannot delete another user's message" });
    return;
  }
  await db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, msg.id));
  publishEvent(msg.roomId, { type: "message.deleted", messageId: msg.id });
  res.json({ ok: true });
});

// Dispatch log for debugging — shows which bots received (or failed to receive) messages in this room
router.get("/dispatch-log", requireAuth, async (req: AuthRequest, res) => {
  const botId = req.query.botId as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const logs = await db
    .select({
      id: botDispatchLog.id,
      messageId: botDispatchLog.messageId,
      botId: botDispatchLog.botId,
      botDisplayName: bots.displayName,
      provider: botDispatchLog.provider,
      status: botDispatchLog.status,
      lastError: botDispatchLog.lastError,
      attemptCount: botDispatchLog.attemptCount,
      dispatchedAt: botDispatchLog.dispatchedAt,
      createdAt: botDispatchLog.createdAt,
    })
    .from(botDispatchLog)
    .innerJoin(messages, eq(botDispatchLog.messageId, messages.id))
    .innerJoin(bots, eq(botDispatchLog.botId, bots.id))
    .where(and(
      eq(messages.roomId, req.params.roomId!),
      botId ? eq(botDispatchLog.botId, botId) : undefined,
    ))
    .orderBy(desc(botDispatchLog.createdAt))
    .limit(limit);

  res.json({ logs });
});

export default router;
