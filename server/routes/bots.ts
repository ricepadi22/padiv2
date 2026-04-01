import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { createHash } from "crypto";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "../db/client.js";
import { bots, roomMembers } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";
import { listProviders, getProvider, PROVIDER_NAMES } from "../providers/index.js";
import { getOnlineBotIds, disconnectBot } from "../realtime/botRegistry.js";

const router = Router();

// List all available providers + their config schemas
router.get("/providers", requireAuth, requireHuman, (_req, res) => {
  res.json({ providers: listProviders() });
});

// Online bots (connected via /bot-ws)
router.get("/online", requireAuth, (_req, res) => {
  res.json({ onlineBotIds: getOnlineBotIds() });
});

// Bot self-identity — lets a bot verify its API key and see what rooms it's in
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  if (!req.botId) {
    res.status(403).json({ error: "This endpoint requires bot authentication (X-TW-Bot-Key header)" });
    return;
  }
  const [bot] = await db.select().from(bots).where(eq(bots.id, req.botId)).limit(1);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

  const memberships = await db
    .select({ roomId: roomMembers.roomId, role: roomMembers.role, joinedAt: roomMembers.joinedAt })
    .from(roomMembers)
    .where(and(eq(roomMembers.botId, bot.id), isNull(roomMembers.leftAt)));

  res.json({
    bot: safeBotObj(bot),
    rooms: memberships,
    online: getOnlineBotIds().includes(bot.id),
  });
});

// List bots — only the current user's own bots
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const result = await db.select().from(bots).where(
    and(eq(bots.status, "active"), eq(bots.ownerUserId, req.user!.id))
  );
  res.json({ bots: result.map(safeBotObj) });
});

// Get single bot — owner only
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const [bot] = await db.select().from(bots)
    .where(and(eq(bots.id, req.params.id!), eq(bots.ownerUserId, req.user!.id)))
    .limit(1);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json({ bot: safeBotObj(bot) });
});

// Create bot
router.post("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(50),
    displayName: z.string().min(1).max(100),
    type: z.enum(["coder", "researcher", "reviewer", "general"]).default("general"),
    avatarUrl: z.string().url().optional(),
    description: z.string().optional(),
    provider: z.enum(PROVIDER_NAMES).default("http"),
    providerConfig: z.record(z.unknown()).default({}),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { provider, providerConfig, ...rest } = parsed.data;

  // Validate provider config if non-empty
  if (Object.keys(providerConfig).length > 0) {
    const providerAdapter = getProvider(provider);
    const configError = providerAdapter?.validateConfig(providerConfig);
    if (configError) {
      res.status(400).json({ error: `Provider config invalid: ${configError}` });
      return;
    }
  }

  const rawKey = `tw_bot_${randomUUID().replace(/-/g, "")}`;
  const apiKeyHash = createHash("sha256").update(rawKey).digest("hex");
  const apiKeyPrefix = rawKey.slice(0, 12);

  const [bot] = await db.insert(bots).values({
    ...rest,
    ownerUserId: req.user!.id,
    apiKey: rawKey, // kept during migration window
    apiKeyHash,
    apiKeyPrefix,
    provider,
    providerConfig,
  }).returning();

  res.status(201).json({ bot: safeBotObj(bot!), apiKey: rawKey });
});

// Update bot
router.patch("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    status: z.enum(["active", "paused", "offline"]).optional(),
    description: z.string().optional(),
    avatarUrl: z.string().url().optional(),
    provider: z.enum(PROVIDER_NAMES).optional(),
    providerConfig: z.record(z.unknown()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Validate provider config if being updated
  if (parsed.data.providerConfig && parsed.data.provider) {
    const providerAdapter = getProvider(parsed.data.provider);
    const configError = providerAdapter?.validateConfig(parsed.data.providerConfig);
    if (configError) {
      res.status(400).json({ error: `Provider config invalid: ${configError}` });
      return;
    }
  }

  const [updated] = await db
    .update(bots)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(bots.id, req.params.id!), eq(bots.ownerUserId, req.user!.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json({ bot: safeBotObj(updated) });
});

// Rotate API key
router.post("/:id/rotate-key", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [bot] = await db.select().from(bots)
    .where(and(eq(bots.id, req.params.id!), eq(bots.ownerUserId, req.user!.id)))
    .limit(1);

  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const rawKey = `tw_bot_${randomUUID().replace(/-/g, "")}`;
  const apiKeyHash = createHash("sha256").update(rawKey).digest("hex");
  const apiKeyPrefix = rawKey.slice(0, 12);

  await db.update(bots)
    .set({ apiKey: rawKey, apiKeyHash, apiKeyPrefix, updatedAt: new Date() })
    .where(eq(bots.id, bot.id));

  res.json({ apiKey: rawKey });
});

// Remove (soft-delete) a bot
router.delete("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [bot] = await db.select().from(bots).where(eq(bots.id, req.params.id!)).limit(1);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (bot.ownerUserId !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

  disconnectBot(bot.id);

  await db.update(roomMembers)
    .set({ leftAt: new Date() })
    .where(and(eq(roomMembers.botId, bot.id), isNull(roomMembers.leftAt)));

  await db.update(bots)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(bots.id, bot.id));

  res.json({ ok: true });
});

function safeBotObj(bot: typeof bots.$inferSelect) {
  const { apiKey: _, apiKeyHash: __, ...safe } = bot;
  return safe;
}

export default router;
