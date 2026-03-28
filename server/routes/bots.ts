import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "../db/client.js";
import { bots } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const result = await db.select().from(bots).where(eq(bots.status, "active"));
  // Don't expose API keys
  res.json({ bots: result.map(safeBotObj) });
});

router.post("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(50),
    displayName: z.string().min(1).max(100),
    type: z.enum(["coder", "researcher", "reviewer", "general"]).default("general"),
    avatarUrl: z.string().url().optional(),
    description: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const apiKey = `tw_bot_${randomUUID().replace(/-/g, "")}`;
  const [bot] = await db.insert(bots).values({
    ...parsed.data,
    ownerUserId: req.user!.id,
    apiKey,
  }).returning();

  res.status(201).json({ bot: bot!, apiKey }); // Return apiKey once on creation
});

router.patch("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    status: z.enum(["active", "paused", "offline"]).optional(),
    description: z.string().optional(),
    avatarUrl: z.string().url().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [updated] = await db.update(bots).set({ ...parsed.data, updatedAt: new Date() }).where(eq(bots.id, req.params.id!)).returning();
  if (!updated) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json({ bot: safeBotObj(updated) });
});

function safeBotObj(bot: typeof bots.$inferSelect) {
  const { apiKey: _, ...safe } = bot;
  return safe;
}

export default router;
