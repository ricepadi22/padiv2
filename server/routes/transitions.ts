import { Router } from "express";
import { eq, isNull, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { rooms, roomMembers, messages, transitions, tickets, ticketActivity, padis, bots } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";
import { publishEvent } from "../realtime/ws.js";

const router = Router();

// Step away: human moves from Middle → Higher (creates or returns to a linked Higher room)
router.post("/step-away", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    fromRoomId: z.string().uuid(),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [fromRoom] = await db.select().from(rooms).where(eq(rooms.id, parsed.data.fromRoomId)).limit(1);
  if (!fromRoom || fromRoom.world !== "middle") {
    res.status(400).json({ error: "Step-away must originate from a Middle World room" });
    return;
  }

  // Create a Higher World private room, inheriting padiId from the Middle room
  const [higherRoom] = await db.insert(rooms).values({
    world: "higher",
    name: `Private: ${fromRoom.name}`,
    description: `Private discussion from ${fromRoom.name}`,
    padiId: fromRoom.padiId ?? undefined,
    createdByUserId: req.user!.id,
    metadata: { linkedMiddleRoomId: fromRoom.id },
  }).returning();

  await db.insert(roomMembers).values({
    roomId: higherRoom!.id,
    memberType: "human",
    userId: req.user!.id,
    role: "owner",
  });

  // Post a system message to the Middle room
  const [sysMsg] = await db.insert(messages).values({
    roomId: fromRoom.id,
    authorType: "system",
    body: `**${req.user!.displayName}** stepped away for private discussion.`,
    messageType: "step_away",
  }).returning();

  await db.insert(transitions).values({
    transitionType: "step_away",
    fromRoomId: fromRoom.id,
    toRoomId: higherRoom!.id,
    initiatedByUserId: req.user!.id,
    reason: parsed.data.reason,
  });

  publishEvent(fromRoom.id, { type: "transition", transitionType: "step_away", message: sysMsg, toRoomId: higherRoom!.id });

  res.status(201).json({ higherRoom });
});

// Return from Higher → Middle
router.post("/return", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({ fromRoomId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [higherRoom] = await db.select().from(rooms).where(eq(rooms.id, parsed.data.fromRoomId)).limit(1);
  if (!higherRoom || higherRoom.world !== "higher") {
    res.status(400).json({ error: "Return must originate from a Higher World room" });
    return;
  }

  const linkedMiddleRoomId = (higherRoom.metadata as Record<string, string>)?.linkedMiddleRoomId;

  if (linkedMiddleRoomId) {
    const [sysMsg] = await db.insert(messages).values({
      roomId: linkedMiddleRoomId,
      authorType: "system",
      body: `**${req.user!.displayName}** returned from private discussion.`,
      messageType: "return",
    }).returning();

    await db.insert(transitions).values({
      transitionType: "return",
      fromRoomId: higherRoom.id,
      toRoomId: linkedMiddleRoomId,
      initiatedByUserId: req.user!.id,
    });

    publishEvent(linkedMiddleRoomId, { type: "transition", transitionType: "return", message: sysMsg });
  }

  res.json({ middleRoomId: linkedMiddleRoomId });
});

// Send to work: create a Worker World room with CEO bots (personal) + padi AI host (spawner)
router.post("/send-to-work", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    fromRoomId: z.string().uuid(),
    taskDescription: z.string().min(1),
    name: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [fromRoom] = await db.select().from(rooms).where(eq(rooms.id, parsed.data.fromRoomId)).limit(1);
  if (!fromRoom || fromRoom.world !== "middle") {
    res.status(400).json({ error: "Send to Work must come from a Middle World room" });
    return;
  }

  // Look up the padi's AI host (worker spawner)
  let hostBotId: string | null = null;
  if (fromRoom.padiId) {
    const [padi] = await db.select({ hostBotId: padis.hostBotId }).from(padis).where(eq(padis.id, fromRoom.padiId)).limit(1);
    hostBotId = padi?.hostBotId ?? null;
  }

  // Find user's personal bots in the Middle World room (these become the CEOs)
  const middleBotMembers = await db
    .select({ botId: roomMembers.botId })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, parsed.data.fromRoomId),
      eq(roomMembers.memberType, "bot"),
      isNull(roomMembers.leftAt),
    ));

  let ceoBotIds: string[] = [];
  if (middleBotMembers.length > 0) {
    const botIds = middleBotMembers.map((m) => m.botId).filter(Boolean) as string[];
    const personalBots = await db
      .select({ id: bots.id })
      .from(bots)
      .where(and(
        inArray(bots.id, botIds),
        eq(bots.ownerUserId, req.user!.id),
      ));
    ceoBotIds = personalBots.map((b) => b.id);
  }

  // Require at least one CEO bot or AI host
  if (ceoBotIds.length === 0 && !hostBotId) {
    res.status(400).json({ error: "Add your personal agent to this room first, or set up a padi AI host in Higher World." });
    return;
  }

  // Create a Worker World room
  const [workerRoom] = await db.insert(rooms).values({
    world: "worker",
    name: parsed.data.name || `Task: ${parsed.data.taskDescription.slice(0, 50)}`,
    description: parsed.data.taskDescription,
    padiId: fromRoom.padiId ?? undefined,
    createdByUserId: req.user!.id,
    metadata: { linkedMiddleRoomId: fromRoom.id, dispatchedBy: req.user!.id },
  }).returning();

  // Add personal (CEO) bots and AI host (spawner) to Worker World room
  const memberInserts: { roomId: string; memberType: "bot"; botId: string; role: "participant" }[] = [];
  for (const botId of ceoBotIds) {
    memberInserts.push({ roomId: workerRoom!.id, memberType: "bot", botId, role: "participant" });
  }
  if (hostBotId && !ceoBotIds.includes(hostBotId)) {
    memberInserts.push({ roomId: workerRoom!.id, memberType: "bot", botId: hostBotId, role: "participant" });
  }
  if (memberInserts.length > 0) {
    await db.insert(roomMembers).values(memberInserts);
  }

  // Post system message to Middle room
  const [sysMsg] = await db.insert(messages).values({
    roomId: fromRoom.id,
    authorType: "system",
    body: `**${req.user!.displayName}** dispatched a task to Worker World: *${parsed.data.taskDescription}*`,
    messageType: "dispatch",
  }).returning();

  await db.insert(transitions).values({
    transitionType: "send_to_work",
    fromRoomId: fromRoom.id,
    toRoomId: workerRoom!.id,
    initiatedByUserId: req.user!.id,
    reason: parsed.data.taskDescription,
  });

  // Auto-create initial ticket
  const [initialTicket] = await db.insert(tickets).values({
    roomId: workerRoom!.id,
    ticketNumber: 1,
    title: parsed.data.name || parsed.data.taskDescription.slice(0, 100),
    description: parsed.data.taskDescription,
    createdByUserId: req.user!.id,
    status: "todo",
  }).returning();

  await db.insert(ticketActivity).values({
    ticketId: initialTicket!.id,
    actorType: "system",
    action: "created",
    toStatus: "todo",
    comment: "Auto-created from Send to Work",
  });

  // Post kickoff message to Worker room so CEO bots are activated by message router
  const hostNote = hostBotId ? " The padi AI host is available to spawn worker bots as needed." : "";
  const [kickoffMsg] = await db.insert(messages).values({
    roomId: workerRoom!.id,
    authorType: "system",
    body: `**Task dispatched by ${req.user!.displayName}:** ${parsed.data.taskDescription}${hostNote}`,
    messageType: "dispatch",
  }).returning();

  publishEvent(workerRoom!.id, { type: "message.new", message: kickoffMsg });
  publishEvent(fromRoom.id, { type: "transition", transitionType: "send_to_work", message: sysMsg, workerRoomId: workerRoom!.id });

  res.status(201).json({ workerRoom, initialTicket });
});

// Meeting request: bot asks for human input
router.post("/meeting-request", requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    workerRoomId: z.string().uuid(),
    reason: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [workerRoom] = await db.select().from(rooms).where(eq(rooms.id, parsed.data.workerRoomId)).limit(1);
  if (!workerRoom || workerRoom.world !== "worker") {
    res.status(400).json({ error: "Meeting request must come from a Worker World room" });
    return;
  }

  const linkedMiddleRoomId = (workerRoom.metadata as Record<string, string>)?.linkedMiddleRoomId;
  if (!linkedMiddleRoomId) {
    res.status(400).json({ error: "Worker room has no linked Middle room" });
    return;
  }

  // Post meeting request to Middle room
  const [middleMsg] = await db.insert(messages).values({
    roomId: linkedMiddleRoomId,
    authorType: req.botId ? "bot" : "system",
    authorBotId: req.botId,
    body: `🤝 **Meeting requested from Worker room**: ${parsed.data.reason}`,
    messageType: "meeting_request",
    metadata: { workerRoomId: workerRoom.id },
  }).returning();

  await db.insert(transitions).values({
    transitionType: "meeting_request",
    fromRoomId: workerRoom.id,
    toRoomId: linkedMiddleRoomId,
    initiatedByBotId: req.botId,
    reason: parsed.data.reason,
  });

  publishEvent(linkedMiddleRoomId, { type: "transition", transitionType: "meeting_request", message: middleMsg, workerRoomId: workerRoom.id });

  res.status(201).json({ message: middleMsg });
});

// Respond to a meeting request
router.post("/meeting-respond", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    workerRoomId: z.string().uuid(),
    accept: z.boolean(),
    response: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const verb = parsed.data.accept ? "accepted" : "declined";
  const [sysMsg] = await db.insert(messages).values({
    roomId: parsed.data.workerRoomId,
    authorType: "system",
    body: `**${req.user!.displayName}** ${verb} the meeting request.${parsed.data.response ? ` "${parsed.data.response}"` : ""}`,
    messageType: parsed.data.accept ? "return" : "step_away",
  }).returning();

  await db.insert(transitions).values({
    transitionType: parsed.data.accept ? "meeting_accepted" : "meeting_declined",
    fromRoomId: parsed.data.workerRoomId,
    initiatedByUserId: req.user!.id,
    reason: parsed.data.response,
  });

  publishEvent(parsed.data.workerRoomId, { type: "transition", transitionType: verb, message: sysMsg });

  res.json({ ok: true, message: sysMsg });
});

export default router;
