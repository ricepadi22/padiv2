import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { rooms, roomMembers, users, bots, padis } from "../db/schema/index.js";
import { requireAuth, requireHuman, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// List rooms, optionally filtered by world and/or padiId
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const world = req.query.world as string | undefined;
  const padiId = req.query.padiId as string | undefined;
  const query = db.select().from(rooms).where(
    and(
      eq(rooms.status, "active"),
      world ? eq(rooms.world, world) : undefined,
      padiId ? eq(rooms.padiId, padiId) : undefined,
    )
  );
  const result = await query;
  res.json({ rooms: result });
});

// Create a room
router.post("/", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    world: z.enum(["higher", "middle", "worker"]),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    padiId: z.string().uuid().optional(), // scopes room to a padi (all worlds)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [room] = await db.insert(rooms).values({
    ...parsed.data,
    createdByUserId: req.user!.id,
  }).returning();

  // Add creator as owner
  await db.insert(roomMembers).values({
    roomId: room!.id,
    memberType: "human",
    userId: req.user!.id,
    role: "owner",
  });

  // Auto-add padi host bot to Higher World rooms only
  if (parsed.data.world === "higher" && parsed.data.padiId) {
    const [padi] = await db.select({ hostBotId: padis.hostBotId }).from(padis).where(eq(padis.id, parsed.data.padiId)).limit(1);
    if (padi?.hostBotId) {
      await db.insert(roomMembers).values({
        roomId: room!.id, memberType: "bot", botId: padi.hostBotId, role: "participant",
      });
    }
  }

  res.status(201).json({ room });
});

// Get room details + members (with display names)
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, req.params.id!)).limit(1);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const rawMembers = await db.select().from(roomMembers).where(
    and(eq(roomMembers.roomId, room.id), isNull(roomMembers.leftAt))
  );
  // Resolve display names from users/bots tables
  const members = await Promise.all(
    rawMembers.map(async (m) => {
      let displayName: string | undefined;
      if (m.userId) {
        const [u] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, m.userId)).limit(1);
        displayName = u?.displayName;
      } else if (m.botId) {
        const [b] = await db.select({ displayName: bots.displayName }).from(bots).where(eq(bots.id, m.botId)).limit(1);
        displayName = b?.displayName;
      }
      return { ...m, displayName };
    })
  );
  res.json({ room, members });
});

// Update/archive room
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
  const [updated] = await db.update(rooms).set({ ...parsed.data, updatedAt: new Date() }).where(eq(rooms.id, req.params.id!)).returning();
  if (!updated) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ room: updated });
});

// Add a member
router.post("/:id/members", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const schema = z.object({
    memberType: z.enum(["human", "bot"]),
    userId: z.string().uuid().optional(),
    botId: z.string().uuid().optional(),
    role: z.enum(["participant", "observer"]).default("participant"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Enforce Higher World rule: only the padi host bot is allowed
  const [room] = await db.select().from(rooms).where(eq(rooms.id, req.params.id!)).limit(1);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (room.world === "higher" && parsed.data.memberType === "bot") {
    // Allow only the padi's designated host bot
    if (room.padiId && parsed.data.botId) {
      const [padi] = await db.select({ hostBotId: padis.hostBotId }).from(padis).where(eq(padis.id, room.padiId)).limit(1);
      if (!padi || padi.hostBotId !== parsed.data.botId) {
        res.status(403).json({ error: "Only the padi AI host can be added to Higher World rooms" });
        return;
      }
    } else {
      res.status(403).json({ error: "Bots are not allowed in Higher World" });
      return;
    }
  }
  // Worker World: humans can only join as observer
  if (room.world === "worker" && parsed.data.memberType === "human" && parsed.data.role === "participant") {
    parsed.data.role = "observer";
  }

  const [member] = await db.insert(roomMembers).values({
    roomId: room.id,
    ...parsed.data,
  }).returning();
  res.status(201).json({ member });
});

// Remove a member (soft-leave)
router.delete("/:id/members/:memberId", requireAuth, requireHuman, async (req: AuthRequest, res) => {
  const [updated] = await db.update(roomMembers)
    .set({ leftAt: new Date() })
    .where(eq(roomMembers.id, req.params.memberId!))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
