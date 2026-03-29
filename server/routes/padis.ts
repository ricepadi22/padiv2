import { Router } from "express";
import { eq, and, isNull, ilike, count } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { db } from "../db/client.js";
import { padis, padiMembers, rooms, users, bots, roomMembers, joinRequests, inviteTokens } from "../db/schema/index.js";
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
  const llmEnvSchema = z.object({
    type: z.enum(["api_key", "oauth"]),
    config: z.record(z.unknown()),
  }).optional();

  const schema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    goals: z.string().optional(),
    isPublic: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
    llmEnvironment: llmEnvSchema,
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { llmEnvironment, ...padiFields } = parsed.data;

  const [padi] = await db.insert(padis).values({
    ...padiFields,
    llmEnvironment: llmEnvironment ?? null,
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

  // Include pending join request count for owners/admins
  const myMembership = members.find((m) => m.userId === req.user!.id);
  let pendingJoinRequestCount = 0;
  if (myMembership && ["owner", "admin"].includes(myMembership.role)) {
    const [pending] = await db
      .select({ count: count() })
      .from(joinRequests)
      .where(and(eq(joinRequests.padiId, padi.id), eq(joinRequests.status, "pending")));
    pendingJoinRequestCount = Number(pending?.count ?? 0);
  }

  res.json({ padi: { ...padi, pendingJoinRequestCount }, members, hostBot });
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    goals: z.string().optional(),
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

// ─── GET LLM ENVIRONMENT (masked) ────────────────────────────────────────────
router.get("/:id/llm-env", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can view LLM environment" }); return;
  }

  const [padi] = await db.select({ llmEnvironment: padis.llmEnvironment }).from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi) { res.status(404).json({ error: "Padi not found" }); return; }

  const llmEnv = padi.llmEnvironment as { type: string; config: Record<string, unknown> } | null;
  if (!llmEnv) { res.json({ llmEnvironment: null }); return; }

  // Mask sensitive fields
  const masked = {
    type: llmEnv.type,
    config: {
      ...llmEnv.config,
      apiKey: llmEnv.config.apiKey ? `...${String(llmEnv.config.apiKey).slice(-4)}` : undefined,
      accessToken: llmEnv.config.accessToken ? "connected" : undefined,
      refreshToken: undefined,
    },
  };
  res.json({ llmEnvironment: masked });
});

// ─── USE CLAUDE.AI SUBSCRIPTION ──────────────────────────────────────────────
// Sets llmEnvironment to type:"subscription" — credentials read from ~/.claude/.credentials.json at dispatch time
router.post("/:id/use-subscription", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({ model: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can update LLM environment" }); return;
  }

  // Verify credentials file is present and has a token before enabling
  const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    const raw = fs.readFileSync(credPath, "utf8");
    const creds = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; subscriptionType?: string } };
    if (!creds.claudeAiOauth?.accessToken) {
      res.status(400).json({ error: "No Claude.ai token found in server credentials. Ensure Claude Code is authenticated on this server." });
      return;
    }
  } catch {
    res.status(400).json({ error: "Claude Code credentials not found on this server. Authenticate with Claude Code first." });
    return;
  }

  await db.update(padis).set({
    llmEnvironment: {
      type: "subscription",
      config: { model: parsed.data.model ?? "claude-sonnet-4-6" },
    },
    updatedAt: new Date(),
  }).where(eq(padis.id, req.params.id!));

  res.json({ ok: true });
});

// ─── SET LLM ENVIRONMENT ─────────────────────────────────────────────────────
router.patch("/:id/llm-env", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    type: z.enum(["api_key", "oauth"]),
    config: z.object({
      apiKey: z.string().optional(),
      model: z.string().optional(),
      systemPrompt: z.string().optional(),
    }),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can update LLM environment" }); return;
  }

  if (parsed.data.type === "api_key" && !parsed.data.config.apiKey) {
    res.status(400).json({ error: "apiKey is required for api_key type" }); return;
  }

  await db.update(padis).set({
    llmEnvironment: parsed.data,
    updatedAt: new Date(),
  }).where(eq(padis.id, req.params.id!));

  res.json({ ok: true });
});

// ─── CLEAR LLM ENVIRONMENT ───────────────────────────────────────────────────
router.delete("/:id/llm-env", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership || membership.role !== "owner") {
    res.status(403).json({ error: "Only the padi owner can clear the LLM environment" }); return;
  }

  await db.update(padis).set({ llmEnvironment: null, updatedAt: new Date() }).where(eq(padis.id, req.params.id!));
  res.json({ ok: true });
});

// ─── GENERATE PERSONAL BOT INVITE TOKEN (padi-level) ─────────────────────────
// The token recipient (OpenClaw bot) accepts it → gets linked as the member's personalBotId
router.post("/:id/personal-bot-invite", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [padi] = await db.select().from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi) { res.status(404).json({ error: "Padi not found" }); return; }

  const [membership] = await db.select().from(padiMembers).where(
    and(eq(padiMembers.padiId, req.params.id!), eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt))
  ).limit(1);
  if (!membership) { res.status(403).json({ error: "You must be a padi member to generate a personal bot invite" }); return; }

  const token = `padi_invite_${crypto.randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const [invite] = await db.insert(inviteTokens).values({
    token,
    padiId: padi.id,
    createdByUserId: req.user!.id,
    expiresAt,
  }).returning();

  res.status(201).json({ token: invite!.token, expiresAt: invite!.expiresAt });
});

// ─── SET UP / REPLACE AI HOST ─────────────────────────────────────────────────
router.post("/:id/host", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    displayName: z.string().min(1).max(100),
    systemPrompt: z.string().optional(),
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

  const systemPrompt = parsed.data.systemPrompt ??
    `You are ${parsed.data.displayName}, the AI host of the "${padi.name}" padi. ` +
    `Spawn and manage worker bots on behalf of the team. Use the spawn-worker API to create sub-agents for tasks. ` +
    `Coordinate work, track progress, and report status. Be concise and action-oriented.`;

  // Generate API key
  const rawKey = `tw_bot_${crypto.randomUUID()}`;
  const apiKeyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const apiKeyPrefix = rawKey.slice(0, 12);
  const botName = parsed.data.displayName.toLowerCase().replace(/\s+/g, "_") + "_host";

  // Host bot uses padi_lm provider — LLM credentials come from padi.llmEnvironment
  const [bot] = await db.insert(bots).values({
    name: botName,
    displayName: parsed.data.displayName,
    description: `AI host for the ${padi.name} padi`,
    ownerUserId: req.user!.id,
    apiKey: rawKey,
    apiKeyHash,
    apiKeyPrefix,
    provider: "padi_lm",
    providerConfig: { padiId: padi.id, systemPrompt },
    status: "active",
    type: "general",
  }).returning();

  // Update padi's hostBotId
  await db.update(padis).set({ hostBotId: bot!.id, updatedAt: new Date() }).where(eq(padis.id, padi.id));

  // Auto-add host bot to existing Middle + Worker rooms in this padi
  const padiRooms = await db.select().from(rooms).where(
    and(eq(rooms.padiId, padi.id), eq(rooms.status, "active"))
  );
  const agentRooms = padiRooms.filter((r) => r.world === "middle" || r.world === "worker");
  if (agentRooms.length > 0) {
    await db.insert(roomMembers).values(
      agentRooms.map((r) => ({
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
    systemPrompt: z.string().optional(),
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

  const { systemPrompt, ...directUpdates } = parsed.data;
  const updateSet: Record<string, unknown> = { ...directUpdates, updatedAt: new Date() };

  // If systemPrompt changed, update it inside providerConfig
  if (systemPrompt !== undefined) {
    const [currentBot] = await db.select({ providerConfig: bots.providerConfig }).from(bots).where(eq(bots.id, padi.hostBotId)).limit(1);
    const currentConfig = (currentBot?.providerConfig ?? {}) as Record<string, unknown>;
    updateSet.providerConfig = { ...currentConfig, systemPrompt };
  }

  const [updated] = await db.update(bots)
    .set(updateSet)
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
