import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { bots, botDispatchLog, messages, roomMembers, rooms, users } from "../db/schema/index.js";
import { getProvider } from "../providers/index.js";
import { publishEvent } from "../realtime/ws.js";

// Defense-in-depth: cap dispatches per bot per room to MAX_PER_MINUTE
// Applied in Middle World only (Worker World allows high-frequency agent interactions)
const recentDispatches = new Map<string, number[]>();
const MAX_PER_MINUTE = 5;

type Message = typeof messages.$inferSelect;
type Room = typeof rooms.$inferSelect;

export async function routeMessageToBots(message: Message, room: Room): Promise<void> {
  // Higher World is humans-only — no bot routing
  if (room.world === "higher") return;

  // Route human messages everywhere; bot messages in Middle and Worker (agent-to-agent + CEO-to-host)
  const isHumanMessage = message.authorType === "human";
  const isBotMessage = !!message.authorBotId && room.world === "worker";
  if (!isHumanMessage && !isBotMessage) return;

  // Find all active bot members in this room
  const members = await db
    .select({ botId: roomMembers.botId })
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomId, room.id),
        eq(roomMembers.memberType, "bot"),
        isNull(roomMembers.leftAt),
      )
    );

  if (members.length === 0) return;

  const botIds = members.map((m) => m.botId).filter(Boolean) as string[];

  // Load bot records (active only)
  const activeBots = await db
    .select()
    .from(bots)
    .where(
      and(
        eq(bots.status, "active"),
      )
    )
    .then((rows) => rows.filter((b) => botIds.includes(b.id)));

  // Resolve author display name for context
  let authorDisplayName = "Unknown";
  if (message.authorUserId) {
    const [author] = await db.select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, message.authorUserId))
      .limit(1);
    authorDisplayName = author?.displayName ?? "Unknown";
  }

  // ── @mention filtering (Middle World only) ──────────────────────────────────
  // In Middle World, agents observe silently unless @mentioned.
  // Supported: @DisplayName → dispatch to that bot; @all → broadcast to all bots.
  // Worker World keeps broadcast behavior (autonomous task processing).
  let botsToDispatch = activeBots;
  if (room.world === "middle") {
    const mentionAll = /@all\b/i.test(message.body);
    if (mentionAll) {
      botsToDispatch = activeBots.filter((b) => b.id !== message.authorBotId);
    } else {
      botsToDispatch = activeBots.filter((b) => {
        if (b.id === message.authorBotId) return false;
        // Use word-boundary regex so "@Dan" doesn't match "@Daniel"
        const escaped = b.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`@${escaped}(?:\\b|\\s|$)`, "i");
        return re.test(message.body);
      });
    }
    if (botsToDispatch.length === 0) return;
  }

  // Build set of mentioned bot IDs to pass in context
  const mentionedBotIds = new Set(botsToDispatch.map((b) => b.id));

  for (const bot of botsToDispatch) {
    // Never route a bot's message back to itself (already filtered above, guard for Worker World)
    if (bot.id === message.authorBotId) continue;

    // Rate-limit in Middle World: max 5 dispatches per bot per room per minute
    if (room.world === "middle") {
      const key = `${bot.id}:${room.id}`;
      const now = Date.now();
      const recent = (recentDispatches.get(key) ?? []).filter((t) => now - t < 60_000);
      if (recent.length >= MAX_PER_MINUTE) {
        await db.insert(botDispatchLog).values({
          messageId: message.id,
          botId: bot.id,
          provider: bot.provider,
          status: "skipped",
          lastError: "Rate limit: too many dispatches in the last minute",
          dispatchedAt: new Date(),
        });
        continue;
      }
      recent.push(now);
      recentDispatches.set(key, recent);
    }

    const provider = getProvider(bot.provider);

    // Create dispatch log entry
    const [logEntry] = await db.insert(botDispatchLog).values({
      messageId: message.id,
      botId: bot.id,
      provider: bot.provider,
      status: "pending",
    }).returning();

    if (!provider) {
      await db.update(botDispatchLog)
        .set({ status: "failed", lastError: `Unknown provider: ${bot.provider}`, dispatchedAt: new Date() })
        .where(eq(botDispatchLog.id, logEntry!.id));
      continue;
    }

    // Validate config — skip silently if not configured yet
    const configError = provider.validateConfig(bot.providerConfig);
    if (configError) {
      await db.update(botDispatchLog)
        .set({ status: "skipped", lastError: `Config invalid: ${configError}`, dispatchedAt: new Date() })
        .where(eq(botDispatchLog.id, logEntry!.id));
      continue;
    }

    const ctx = {
      bot: {
        id: bot.id,
        displayName: bot.displayName,
        providerConfig: (bot.providerConfig ?? {}) as Record<string, unknown>,
        config: (bot.config ?? {}) as Record<string, unknown>,
      },
      room: {
        id: room.id,
        name: room.name,
        world: room.world,
      },
      message: {
        id: message.id,
        body: message.body,
        authorType: message.authorType,
        authorDisplayName,
        authorBotId: message.authorBotId ?? undefined,
        createdAt: message.createdAt.toISOString(),
        mentionedBotIds: [...mentionedBotIds],
      },
    };

    try {
      const result = await provider.dispatch(ctx);

      await db.update(botDispatchLog)
        .set({
          status: result.ok ? "delivered" : "failed",
          lastError: result.error ?? null,
          attemptCount: 1,
          dispatchedAt: new Date(),
        })
        .where(eq(botDispatchLog.id, logEntry!.id));

      if (result.ok) {
        // Update bot's last active timestamp
        await db.update(bots)
          .set({ lastActiveAt: new Date() })
          .where(eq(bots.id, bot.id));

        // If provider returned an inline reply, post it as a bot message
        if (result.replyBody) {
          const [replyMsg] = await db.insert(messages).values({
            roomId: room.id,
            body: result.replyBody,
            messageType: "chat",
            authorType: "bot",
            authorBotId: bot.id,
          }).returning();

          if (replyMsg) {
            publishEvent(room.id, { type: "message.new", message: replyMsg });
          }
        }
      } else {
        // Notify room subscribers that this agent failed to receive the message
        publishEvent(room.id, {
          type: "dispatch.failed",
          roomId: room.id,
          botId: bot.id,
          botDisplayName: bot.displayName,
          messageId: message.id,
          error: result.error ?? "Unknown error",
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      await db.update(botDispatchLog)
        .set({
          status: "failed",
          lastError: errMsg,
          attemptCount: 1,
          dispatchedAt: new Date(),
        })
        .where(eq(botDispatchLog.id, logEntry!.id));

      publishEvent(room.id, {
        type: "dispatch.failed",
        roomId: room.id,
        botId: bot.id,
        botDisplayName: bot.displayName,
        messageId: message.id,
        error: errMsg,
      });
    }
  }
}
