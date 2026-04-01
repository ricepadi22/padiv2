import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { randomUUID, createHash } from "crypto";
import { db } from "../db/client.js";
import { inviteTokens, rooms, roomMembers, messages, bots, padiMembers } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";
import { publishEvent } from "../realtime/ws.js";


const router = Router();

// Generate room-level invite token (Middle World room)
router.post("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({ roomId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [room] = await db.select().from(rooms).where(eq(rooms.id, parsed.data.roomId)).limit(1);
  if (!room) { res.status(404).json({ error: "Room not found" }); return; }
  if (room.world !== "middle") {
    res.status(400).json({ error: "Invite tokens are only for Middle World rooms" });
    return;
  }

  const token = `padi_invite_${randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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
    provider: z.enum(["http", "openclaw_gateway", "claude_api", "padi_lm", "websocket", "poll"]).default("poll"),
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

  if (!invite) { res.status(404).json({ error: "Invite token not found" }); return; }
  if (invite.status !== "pending") {
    res.status(400).json({ error: `Invite token already ${invite.status}` });
    return;
  }
  if (new Date() > invite.expiresAt) {
    await db.update(inviteTokens).set({ status: "expired" }).where(eq(inviteTokens.id, invite.id));
    res.status(400).json({ error: "Invite token expired" });
    return;
  }

  const isAvatarBot = parsed.data.provider === "websocket" || parsed.data.provider === "poll";

  // For avatar bots: reuse existing one with the SAME display name (rotate key, keep identity stable).
  // Scoped by name so inviting "Chongi" won't hijack "Saniel"'s bot record.
  let existingAvatarId: string | null = null;
  if (isAvatarBot) {
    const [existing] = await db
      .select({ id: bots.id })
      .from(bots)
      .where(and(
        eq(bots.ownerUserId, invite.createdByUserId),
        eq(bots.type, "avatar"),
        eq(bots.status, "active"),
        eq(bots.displayName, parsed.data.agentName),
      ))
      .limit(1);
    existingAvatarId = existing?.id ?? null;
  }

  // If no active avatar found by name, look for a paused one to resurrect (same name only)
  if (isAvatarBot && !existingAvatarId) {
    const [oldBot] = await db
      .select({ id: bots.id })
      .from(bots)
      .where(and(
        eq(bots.displayName, parsed.data.agentName),
        eq(bots.type, "avatar"),
        eq(bots.status, "paused"),
      ))
      .limit(1);
    if (oldBot) existingAvatarId = oldBot.id;
  }

  // Rotate API key (always fresh on each invite acceptance)
  const rawKey = `tw_bot_${randomUUID()}`;
  const apiKeyHash = createHash("sha256").update(rawKey).digest("hex");
  const apiKeyPrefix = rawKey.slice(0, 12);

  let bot: typeof bots.$inferSelect;

  if (existingAvatarId) {
    // Reuse existing avatar — update key and provider, keep identity
    const [updated] = await db.update(bots)
      .set({
        apiKey: rawKey,
        apiKeyHash,
        apiKeyPrefix,
        provider: parsed.data.provider,
        providerConfig: parsed.data.providerConfig,
        displayName: parsed.data.agentName,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(bots.id, existingAvatarId))
      .returning();
    bot = updated!;
  } else {
    // Create new bot
    const [created] = await db.insert(bots).values({
      name: parsed.data.agentName.toLowerCase().replace(/\s+/g, "_"),
      displayName: parsed.data.agentName,
      type: isAvatarBot ? "avatar" : "general",
      ownerUserId: invite.createdByUserId,
      apiKey: rawKey,
      apiKeyHash,
      apiKeyPrefix,
      provider: parsed.data.provider,
      providerConfig: parsed.data.providerConfig,
    }).returning();
    bot = created!;
  }

  // Room-level invite: add bot to room (rejoin if previously removed)
  if (invite.roomId) {
    const [existing] = await db.select({ id: roomMembers.id })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, invite.roomId), eq(roomMembers.botId, bot.id)))
      .limit(1);

    if (existing) {
      await db.update(roomMembers)
        .set({ leftAt: null, role: "participant" })
        .where(eq(roomMembers.id, existing.id));
    } else {
      await db.insert(roomMembers).values({
        roomId: invite.roomId,
        memberType: "bot",
        botId: bot.id,
        role: "participant",
      });
    }

    const [sysMsg] = await db.insert(messages).values({
      roomId: invite.roomId,
      authorType: "system",
      body: `**${parsed.data.agentName}** joined via invite token.`,
      messageType: "status_update",
    }).returning();

    publishEvent(invite.roomId, { type: "message.new", roomId: invite.roomId, message: sysMsg });

    // Notify subscribers that a new member joined (updates member count in real time)
    publishEvent(invite.roomId, {
      type: "member.joined",
      roomId: invite.roomId,
      member: {
        memberType: "bot",
        botId: bot.id,
        displayName: bot.displayName,
        role: "participant",
      },
    });
  }

  // Padi-level invite: link as personal bot on the creator's padi membership
  if (invite.padiId) {
    await db.update(padiMembers)
      .set({ personalBotId: bot.id })
      .where(
        and(
          eq(padiMembers.padiId, invite.padiId),
          eq(padiMembers.userId, invite.createdByUserId),
        )
      );
  }

  // Mark token accepted
  await db.update(inviteTokens).set({
    status: "accepted",
    acceptedByBotId: bot.id,
  }).where(eq(inviteTokens.id, invite.id));

  res.status(201).json({
    bot: { ...bot, apiKey: rawKey },
    roomId: invite.roomId ?? null,
    padiId: invite.padiId ?? null,
  });
});

// Check token status
router.get("/:token/status", requireAuth, async (req: AuthRequest, res) => {
  const [invite] = await db.select().from(inviteTokens)
    .where(eq(inviteTokens.token, req.params.token!))
    .limit(1);

  if (!invite) { res.status(404).json({ error: "Token not found" }); return; }

  if (invite.status === "pending" && new Date() > invite.expiresAt) {
    await db.update(inviteTokens).set({ status: "expired" }).where(eq(inviteTokens.id, invite.id));
    res.json({ status: "expired" });
    return;
  }

  let botInfo = null;
  if (invite.acceptedByBotId) {
    const [bot] = await db.select({
      id: bots.id, displayName: bots.displayName, provider: bots.provider,
    }).from(bots).where(eq(bots.id, invite.acceptedByBotId)).limit(1);
    botInfo = bot ?? null;
  }

  res.json({ status: invite.status, bot: botInfo });
});

export default router;
