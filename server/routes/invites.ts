import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { randomUUID, createHash } from "crypto";
import { db } from "../db/client.js";
import { inviteTokens, rooms, roomMembers, messages, bots } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";
import { publishEvent } from "../realtime/ws.js";

const router = Router();

// Generate invite token (human user generates for a Middle World room)
router.post("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({ roomId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [room] = await db.select().from(rooms).where(eq(rooms.id, parsed.data.roomId)).limit(1);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (room.world !== "middle") {
    res.status(400).json({ error: "Invite tokens are only for Middle World rooms" });
    return;
  }

  const token = `padi_invite_${randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const [invite] = await db.insert(inviteTokens).values({
    token,
    roomId: parsed.data.roomId,
    createdByUserId: req.user!.id,
    expiresAt,
  }).returning();

  res.status(201).json({ token: invite!.token, expiresAt: invite!.expiresAt });
});

// Accept invite — no auth required (agent self-registers)
router.post("/accept", async (req: AuthRequest, res) => {
  const schema = z.object({
    token: z.string(),
    agentName: z.string().min(1).max(100),
    provider: z.enum(["http", "openclaw_gateway", "claude_api"]).default("openclaw_gateway"),
    providerConfig: z.record(z.unknown()).default({}),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [invite] = await db.select().from(inviteTokens)
    .where(eq(inviteTokens.token, parsed.data.token))
    .limit(1);

  if (!invite) {
    res.status(404).json({ error: "Invite token not found" });
    return;
  }
  if (invite.status !== "pending") {
    res.status(400).json({ error: `Invite token already ${invite.status}` });
    return;
  }
  if (new Date() > invite.expiresAt) {
    await db.update(inviteTokens).set({ status: "expired" }).where(eq(inviteTokens.id, invite.id));
    res.status(400).json({ error: "Invite token expired" });
    return;
  }

  // Create bot
  const rawKey = `tw_bot_${randomUUID()}`;
  const apiKeyHash = createHash("sha256").update(rawKey).digest("hex");
  const apiKeyPrefix = rawKey.slice(0, 12);

  const [bot] = await db.insert(bots).values({
    name: parsed.data.agentName.toLowerCase().replace(/\s+/g, "_"),
    displayName: parsed.data.agentName,
    type: "general",
    apiKey: rawKey,
    apiKeyHash,
    apiKeyPrefix,
    provider: parsed.data.provider,
    providerConfig: parsed.data.providerConfig,
  }).returning();

  // Add bot to room
  await db.insert(roomMembers).values({
    roomId: invite.roomId,
    memberType: "bot",
    botId: bot!.id,
    role: "participant",
  });

  // Post system message
  const [sysMsg] = await db.insert(messages).values({
    roomId: invite.roomId,
    authorType: "system",
    body: `**${parsed.data.agentName}** joined via invite token.`,
    messageType: "status_update",
  }).returning();

  // Mark token accepted
  await db.update(inviteTokens).set({
    status: "accepted",
    acceptedByBotId: bot!.id,
  }).where(eq(inviteTokens.id, invite.id));

  publishEvent(invite.roomId, { type: "message.new", roomId: invite.roomId, message: sysMsg });

  res.status(201).json({ bot: { ...bot!, apiKey: rawKey }, roomId: invite.roomId });
});

// Check token status
router.get("/:token/status", requireAuth, async (req: AuthRequest, res) => {
  const [invite] = await db.select().from(inviteTokens)
    .where(eq(inviteTokens.token, req.params.token!))
    .limit(1);

  if (!invite) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  // Auto-expire if past expiry
  if (invite.status === "pending" && new Date() > invite.expiresAt) {
    await db.update(inviteTokens).set({ status: "expired" }).where(eq(inviteTokens.id, invite.id));
    res.json({ status: "expired" });
    return;
  }

  let botInfo = null;
  if (invite.acceptedByBotId) {
    const [bot] = await db.select({
      id: bots.id,
      displayName: bots.displayName,
      provider: bots.provider,
    }).from(bots).where(eq(bots.id, invite.acceptedByBotId)).limit(1);
    botInfo = bot ?? null;
  }

  res.json({ status: invite.status, bot: botInfo });
});

export default router;
