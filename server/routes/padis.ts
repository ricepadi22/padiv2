import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { padis, padiMembers, rooms, users } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// List padis the current user is a member of
router.get("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const memberships = await db.select({ padiId: padiMembers.padiId })
    .from(padiMembers)
    .where(and(eq(padiMembers.userId, req.user!.id), isNull(padiMembers.leftAt)));

  if (memberships.length === 0) {
    res.json({ padis: [] });
    return;
  }

  const padiIds = memberships.map((m) => m.padiId);
  const result = await db.select().from(padis).where(
    and(
      eq(padis.status, "active"),
    )
  );
  // Filter to only padis the user belongs to
  const userPadis = result.filter((p) => padiIds.includes(p.id));
  res.json({ padis: userPadis });
});

// Create a padi
router.post("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [padi] = await db.insert(padis).values({
    ...parsed.data,
    createdByUserId: req.user!.id,
  }).returning();

  // Auto-join creator as owner
  await db.insert(padiMembers).values({
    padiId: padi!.id,
    userId: req.user!.id,
    role: "owner",
  });

  res.status(201).json({ padi });
});

// Get padi details + members
router.get("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [padi] = await db.select().from(padis).where(eq(padis.id, req.params.id!)).limit(1);
  if (!padi) {
    res.status(404).json({ error: "Padi not found" });
    return;
  }

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

  res.json({ padi, members });
});

// Update padi (owner/admin only)
router.patch("/:id", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    status: z.enum(["active", "archived"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Check ownership
  const [membership] = await db.select().from(padiMembers).where(
    and(
      eq(padiMembers.padiId, req.params.id!),
      eq(padiMembers.userId, req.user!.id),
      isNull(padiMembers.leftAt),
    )
  ).limit(1);

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can update" });
    return;
  }

  const [updated] = await db.update(padis)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(padis.id, req.params.id!))
    .returning();

  res.json({ padi: updated });
});

// Add member to padi (by userId)
router.post("/:id/members", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    userId: z.string().uuid(),
    role: z.enum(["admin", "member"]).default("member"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Check requester is owner/admin
  const [myMembership] = await db.select().from(padiMembers).where(
    and(
      eq(padiMembers.padiId, req.params.id!),
      eq(padiMembers.userId, req.user!.id),
      isNull(padiMembers.leftAt),
    )
  ).limit(1);

  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
    res.status(403).json({ error: "Only padi owners/admins can add members" });
    return;
  }

  const [member] = await db.insert(padiMembers).values({
    padiId: req.params.id!,
    userId: parsed.data.userId,
    role: parsed.data.role,
  }).returning();

  res.status(201).json({ member });
});

// Leave/remove from padi
router.delete("/:id/members/:memberId", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [updated] = await db.update(padiMembers)
    .set({ leftAt: new Date() })
    .where(eq(padiMembers.id, req.params.memberId!))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json({ ok: true });
});

// List rooms in a padi
router.get("/:id/rooms", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const result = await db.select().from(rooms).where(
    and(
      eq(rooms.padiId, req.params.id!),
      eq(rooms.status, "active"),
    )
  );
  res.json({ rooms: result });
});

export default router;
