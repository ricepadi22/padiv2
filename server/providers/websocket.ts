import type { BotProvider, DispatchContext, DispatchResult } from "./types.ts";
import { getBotSocket } from "../realtime/botRegistry.js";

// readyState === 1 is WebSocket.OPEN
const WS_OPEN = 1;

export const websocketProvider: BotProvider = {
  name: "websocket",
  label: "WebSocket (direct)",
  configFields: [],

  validateConfig(_config: unknown): string | null {
    return null; // no config needed
  },

  async dispatch(ctx: DispatchContext): Promise<DispatchResult> {
    const socket = getBotSocket(ctx.bot.id);
    if (!socket) {
      return { ok: false, error: "Bot is not connected" };
    }
    if (socket.readyState !== WS_OPEN) {
      return { ok: false, error: "Bot connection is not open" };
    }

    socket.send(JSON.stringify({
      type: "message",
      yourBotId: ctx.bot.id,
      roomId: ctx.room.id,
      roomName: ctx.room.name,
      world: ctx.room.world,
      messageId: ctx.message.id,
      body: ctx.message.body,
      authorDisplayName: ctx.message.authorDisplayName,
      authorType: ctx.message.authorType,
      authorBotId: ctx.message.authorBotId ?? null,
      createdAt: ctx.message.createdAt,
      mentionedBotIds: ctx.message.mentionedBotIds,
    }));

    return { ok: true };
  },
};
