import { Router } from "express";
import { eq, isNull, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { randomUUID, createHash } from "crypto";
import { db } from "../db/client.js";
import { rooms, roomMembers, messages, transitions, tickets, ticketActivity, padis, bots } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";
import { publishEvent } from "../realtime/ws.js";

const router = Router();

// Send to work: create a Worker World room and dispatch bots into it
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

  // Look up the padi — needed for hostBotId and llmEnvironment
  let hostBotId: string | null = null;
  let padiLlmConfigured = false;
  if (fromRoom.padiId) {
    const [padi] = await db.select({ hostBotId: padis.hostBotId, llmEnvironment: padis.llmEnvironment })
      .from(padis).where(eq(padis.id, fromRoom.padiId)).limit(1);
    hostBotId = padi?.hostBotId ?? null;
    padiLlmConfigured = !!(padi?.llmEnvironment);
  }

  // Find user's personal bots (OpenClaw bots) in the Middle room — these become CEOs
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
      .where(and(inArray(bots.id, botIds), eq(bots.ownerUserId, req.user!.id)));
    ceoBotIds = personalBots.map((b) => b.id);
  }

  if (ceoBotIds.length === 0 && !hostBotId) {
    res.status(400).json({ error: "Invite your personal OpenClaw agent to this room first, or set up an AI host for the padi." });
    return;
  }

  // Create Worker room
  const [workerRoom] = await db.insert(rooms).values({
    world: "worker",
    name: parsed.data.name || `Task: ${parsed.data.taskDescription.slice(0, 50)}`,
    description: parsed.data.taskDescription,
    padiId: fromRoom.padiId ?? undefined,
    createdByUserId: req.user!.id,
    metadata: { linkedMiddleRoomId: fromRoom.id, dispatchedBy: req.user!.id },
  }).returning();

  // Add CEO bots + AI host to worker room
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

  // If the padi has an LLM environment but no CEO bots, spawn an autonomous padi_lm bot
  if (ceoBotIds.length === 0 && padiLlmConfigured && fromRoom.padiId) {
    const rawKey = `tw_bot_${randomUUID()}`;
    const apiKeyHash = createHash("sha256").update(rawKey).digest("hex");
    const apiKeyPrefix = rawKey.slice(0, 12);
    const [autoBotRecord] = await db.insert(bots).values({
      name: `auto_worker_${Date.now()}`,
      displayName: `Auto Worker`,
      type: "general",
      ownerUserId: req.user!.id,
      apiKey: rawKey,
      apiKeyHash,
      apiKeyPrefix,
      provider: "padi_lm",
      providerConfig: { padiId: fromRoom.padiId },
    }).returning();
    await db.insert(roomMembers).values({
      roomId: workerRoom!.id, memberType: "bot", botId: autoBotRecord!.id, role: "participant",
    });
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

  // Create initial ticket
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

  // Kickoff message activates bots via message router
  const [kickoffMsg] = await db.insert(messages).values({
    roomId: workerRoom!.id,
    authorType: "system",
    body: `**Task dispatched by ${req.user!.displayName}:** ${parsed.data.taskDescription}`,
    messageType: "dispatch",
  }).returning();

  publishEvent(workerRoom!.id, { type: "message.new", message: kickoffMsg });
  publishEvent(fromRoom.id, { type: "transition", transitionType: "send_to_work", message: sysMsg, workerRoomId: workerRoom!.id });

  res.status(201).json({ workerRoom, initialTicket });
});

// Meeting request: bot asks for human input from Worker room
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

  const [middleMsg] = await db.insert(messages).values({
    roomId: linkedMiddleRoomId,
    authorType: req.botId ? "bot" : "system",
    authorBotId: req.botId,
    body: `**Meeting requested from Worker room**: ${parsed.data.reason}`,
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
    messageType: "status_update",
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
