import { Router } from "express";
import { eq, and, isNull, ne, ilike, sql, count } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../db/client.js";
import { padis, padiMembers, rooms, users, bots, roomMembers, joinRequests } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// ─── DISCOVER: public padis the current user is NOT in ───────────────────────
// Must be registered BEFORE /:id to avoid Express treating "discover" as UUID
router.get("/discover", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const search = req.query.search as string | undefined;
  const sort = (req.query.sort as string) || "newest";

  // Get all padis the user is already a member of
  const myMemberships = await db
    .select({ padiId: padiMembers.padiId })
    .from(padiMembers)
    .where(and(eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt)));
  const myPadiIds = myMemberships.map((m) => m.padiId);

  // Get all public active padis
  const allPublic = await db.select().from(padis).where(
    and(
      eq(padis.isPublic, true),
      eq(padis.status, "active"),
      search ? ilike(padis.name, `%${search}%`) : undefined,
    )
  );

  // Exclude padis the user is already in
  const discoverable = allPublic.filter((p) => !myPadiIds.includes(p.id));

  // Enrich with counts
  const enriched = await Promise.all(
    discoverable.map(async (p) => {
      const [memberCount] = await db
        .select({ count: count() })
        .from(padiMembers)
        .where(and(eq(padiMembers.padiId, p.id), isNull(padiMembers.leftAt)));
      const [roomCount] = await db
        .select({ count: count() })
        .from(rooms)
        .where(and(eq(rooms.padiId, p.id), eq(rooms.status, "active")));
      return {
        ...p,
        memberCount: memberCount?.count ?? 0,
        roomCount: roomCount?.count ?? 0,
        hasHost: !!p.hostBotId,
      };
    })
  );

  // Sort
  if (sort === "members") enriched.sort((a, b) => Number(b.memberCount) - Number(a.memberCount));
  else if (sort === "name") enriched.sort((a, b) => a.name.localeCompare(b.name));
  else enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ padis: enriched });
});

// ─── LIST: padis the current user is a member of ─────────────────────────────
router.get("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const memberships = await db
    .select({ padiId: padiMembers.padiId, role: padiMembers.role })
    .from(padiMembers)
    .where(and(eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt)));

  if (memberships.length === 0) {
    res.json({ padis: [] });
    return;
  }

  const padiIds = memberships.map((m) => m.padiId);
  const allPadis = await db.select().from(padis).where(eq(padis.status, "active"));
  const userPadis = allPadis.filter((p) => padiIds.includes(p.id));

  // Enrich with counts + pending join requests for owners/admins
  const enriched = await Promise.all(
    userPadis.map(async (p) => {
      const [memberCount] = await db
        .select({ count: count() })
        .from(padiMembers)
        .where(and(eq(padiMembers.padiId, p.id), isNull(padiMembers.leftAt)));
      const [roomCount] = await db
        .select({ count: count() })
        .from(rooms)
        .where(and(eq(rooms.padiId, p.id), eq(rooms.status, "active")));
      const myRole = memberships.find((m) => m.padiId === p.id)?.role ?? "member";
      let pendingJoinRequestCount = 0;
      if (["owner", "admin"].includes(myRole)) {
        const [pending] = await db
          .select({ count: count() })
          .from(joinRequests)
          .where(and(eq(joinRequests.padiId, p.id), eq(joinRequests.status, "pending")));
        pendingJoinRequestCount = Number(pending?.count ?? 0);
      }
      return {
        ...p,
        memberCount: Number(memberCount?.count ?? 0),
        roomCount: Number(roomCount?.count ?? 0),
        hasHost: !!p.hostBotId,
        myRole,
        pendingJoinRequestCount,
      };
    })
  );

  res.json({ padis: enriched });
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [padi] = await db.insert(padis).values({
    ...parsed.data,
    createdByUserId: req.user!.id,
  }).returning();

  await db.insert(padiMembers).values({ padiId: padi!.id, userId: req.user!.id, role: "owner" });

  res.status(201).json({ padi });
});

// ─── GET SINGLE ───────────────────────────────────────────────────────────────
router.get("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [padi] = await db.select().from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi) { res.status(404).json({ error: "Padi not found" }); return; }

  const members = await db
    .select({
      id: padiMembers.id,
      padiId: padiMembers.padiId,
      userId: padiMembers.userId,
      role: padiMembers.role,
      joinedAt: padiMembers.joinedAt,
      displayName: users.displayName,
      email: users.email,
    })
    .from(padiMembers)
    .innerJoin(users, eq(padiMembers.userId, users.id))
    .where(and(eq(padiMembers.padiId, padi.id), isNull(padiMembers.leftAt)));

  let hostBot = null;
  if (padi.hostBotId) {
    const [bot] = await db.select({
      id: bots.id, displayName: bots.displayName, status: bots.status,
      provider: bots.provider, apiKeyPrefix: bots.apiKeyPrefix,
    }).from(bots).where(eq(bots.id, padi.hostBotId)).limit(1);
    hostBot = bot ?? null;
  }

  res.json({ padi, members, hostBot });
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    status: z.enum(["active", "archived"]).optional(),
    isPublic: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can update" }); return;
  }

  const [updated] = await db.update(padis)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(padis.id, req.params.id!))
    .returning();
  res.json({ padi: updated });
});

// ─── JOIN (public padis) ──────────────────────────────────────────────────────
router.post("/:id/join", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({ message: z.string().max(500).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [padi] = await db.select().from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi || padi.status !== "active") { res.status(404).json({ error: "Padi not found" }); return; }
  if (!padi.isPublic) { res.status(403).json({ error: "This padi is private" }); return; }

  // Check not already a member
  const [existing] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, padi.id), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (existing) { res.status(409).json({ error: "Already a member" }); return; }

  if (!padi.requireApproval) {
    // Direct join
    const [member] = await db.insert(padiMembers).values({
      padiId: padi.id, userId: req.user!.id, role: "member",
    }).returning();
    res.json({ joined: true, member });
  } else {
    // Check for existing pending request
    const [pendingReq] = await db.select().from(joinRequests).where(
      and(eq(joinRequests.padiId, padi.id), eq(joinRequests.userId, req.user!.id), eq(joinRequests.status, "pending"))
    ).limit(1);
    if (pendingReq) { res.status(409).json({ error: "Request already pending" }); return; }

    const [request] = await db.insert(joinRequests).values({
      padiId: padi.id, userId: req.user!.id, message: parsed.data.message,
    }).returning();
    res.status(201).json({ requested: true, joinRequest: request });
  }
});

// ─── LIST JOIN REQUESTS (owner/admin) ─────────────────────────────────────────
router.get("/:id/join-requests", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can view join requests" }); return;
  }

  const statusFilter = (req.query.status as string) || "pending";
  const requests = await db
    .select({
      id: joinRequests.id,
      padiId: joinRequests.padiId,
      userId: joinRequests.userId,
      status: joinRequests.status,
      message: joinRequests.message,
      reviewedByUserId: joinRequests.reviewedByUserId,
      createdAt: joinRequests.createdAt,
      displayName: users.displayName,
      email: users.email,
    })
    .from(joinRequests)
    .innerJoin(users, eq(joinRequests.userId, users.id))
    .where(and(eq(joinRequests.padiId, req.params.id!), eq(joinRequests.status, statusFilter)));

  res.json({ joinRequests: requests });
});

// ─── REVIEW JOIN REQUEST (owner/admin) ────────────────────────────────────────
router.patch("/:id/join-requests/:requestId", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({ status: z.enum(["approved", "rejected"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can review requests" }); return;
  }

  const [request] = await db.select().from(joinRequests).where(
    and(eq(joinRequests.id, req.params.requestId!), eq(joinRequests.padiId, req.params.id!))
  ).limit(1);
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const [updated] = await db.update(joinRequests)
    .set({ status: parsed.data.status, reviewedByUserId: req.user!.id, updatedAt: new Date() })
    .where(eq(joinRequests.id, request.id))
    .returning();

  if (parsed.data.status === "approved") {
    // Add to padi members
    await db.insert(padiMembers).values({
      padiId: req.params.id!, userId: request.userId, role: "member",
    });
  }

  res.json({ joinRequest: updated });
});

// ─── ADD MEMBER (by userId, owner/admin only) ─────────────────────────────────
router.post("/:id/members", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    userId: z.string().uuid(),
    role: z.enum(["admin", "member"]).default("member"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [myMembership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can add members" }); return;
  }

  const [member] = await db.insert(padiMembers).values({
    padiId: req.params.id!, userId: parsed.data.userId, role: parsed.data.role,
  }).returning();
  res.status(201).json({ member });
});

// ─── LEAVE / REMOVE MEMBER ────────────────────────────────────────────────────
router.delete("/:id/members/:memberId", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [updated] = await db.update(padiMembers)
    .set({ leftAt: new Date() })
    .where(eq(padiMembers.id, req.params.memberId!))
    .returning();
  if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
  res.json({ ok: true });
});

// ─── LIST ROOMS IN PADI ───────────────────────────────────────────────────────
router.get("/:id/rooms", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const result = await db.select().from(rooms).where(
    and(eq(rooms.padiId, req.params.id!), eq(rooms.status, "active"))
  );
  res.json({ rooms: result });
});

// ─── SET UP / REPLACE AI HOST ─────────────────────────────────────────────────
router.post("/:id/host", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    displayName: z.string().min(1).max(100),
    provider: z.enum(["claude_api", "http", "openclaw_gateway"]).default("claude_api"),
    providerConfig: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Owner-only
  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || membership.role !== "owner") {
    res.status(403).json({ error: "Only the padi owner can set up an AI host" }); return;
  }

  const [padi] = await db.select().from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi) { res.status(404).json({ error: "Padi not found" }); return; }

  // Build default system prompt if not provided
  const config = (parsed.data.providerConfig ?? {}) as Record<string, unknown>;
  if (!config.systemPrompt) {
    config.systemPrompt = `You are ${parsed.data.displayName}, the AI host of the "${padi.name}" community in Higher World. You help community members, answer questions, and foster a welcoming environment. Be concise, friendly, and helpful.`;
  }

  // Generate API key
  const rawKey = `tw_bot_${crypto.randomUUID()}`;
  const apiKeyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const apiKeyPrefix = rawKey.slice(0, 12);
  const botName = parsed.data.displayName.toLowerCase().replace(/\s+/g, "_") + "_host";

  const [bot] = await db.insert(bots).values({
    name: botName,
    displayName: parsed.data.displayName,
    description: `AI host for the ${padi.name} padi`,
    ownerUserId: req.user!.id,
    apiKey: rawKey,
    apiKeyHash,
    apiKeyPrefix,
    provider: parsed.data.provider,
    providerConfig: config,
    status: "active",
    type: "general",
  }).returning();

  // Update padi's hostBotId
  await db.update(padis).set({ hostBotId: bot!.id, updatedAt: new Date() }).where(eq(padis.id, padi.id));

  // Auto-add host bot to all existing active rooms in this padi
  const padiRooms = await db.select().from(rooms).where(
    and(eq(rooms.padiId, padi.id), eq(rooms.status, "active"))
  );
  if (padiRooms.length > 0) {
    await db.insert(roomMembers).values(
      padiRooms.map((r) => ({
        roomId: r.id, memberType: "bot" as const, botId: bot!.id, role: "participant" as const,
      }))
    );
  }

  res.status(201).json({ bot: { ...bot, apiKey: rawKey } });
});

// ─── UPDATE AI HOST ────────────────────────────────────────────────────────────
router.patch("/:id/host", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    providerConfig: z.record(z.unknown()).optional(),
    status: z.enum(["active", "paused"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can update the host" }); return;
  }

  const [padi] = await db.select().from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi?.hostBotId) { res.status(404).json({ error: "No AI host configured" }); return; }

  const [updated] = await db.update(bots)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(bots.id, padi.hostBotId))
    .returning();

  res.json({ bot: updated });
});

// ─── REMOVE AI HOST ────────────────────────────────────────────────────────────
router.delete("/:id/host", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || membership.role !== "owner") {
    res.status(403).json({ error: "Only the padi owner can remove the host" }); return;
  }

  const [padi] = await db.select().from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi?.hostBotId) { res.status(404).json({ error: "No AI host configured" }); return; }

  // Remove from all padi rooms (soft-delete)
  const padiRooms = await db.select().from(rooms).where(eq(rooms.padiId, padi.id));
  for (const r of padiRooms) {
    await db.update(roomMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(roomMembers.roomId, r.id), eq(roomMembers.botId, padi.hostBotId)));
  }

  // Set bot offline
  await db.update(bots).set({ status: "offline", updatedAt: new Date() }).where(eq(bots.id, padi.hostBotId));

  // Clear hostBotId
  await db.update(padis).set({ hostBotId: null, updatedAt: new Date() }).where(eq(padis.id, padi.id));

  res.json({ ok: true });
});

export default router;
