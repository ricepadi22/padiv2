import { createRequire } from "module";
import { createHash } from "crypto";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { bots } from "../db/schema/index.js";
import { registerBot, unregisterBot, getBotSocket } from "./botRegistry.js";

const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (opts: { noServer: boolean }) => import("ws").WebSocketServer;
};

interface ClientState {
  socket: import("ws").WebSocket;
  userId?: string;
  botId?: string;
  subscribedRooms: Set<string>;
}

const clients = new Set<ClientState>();

// Room → set of subscribed clients
const roomSubscriptions = new Map<string, Set<ClientState>>();

function subscribe(client: ClientState, roomIds: string[]) {
  for (const roomId of roomIds) {
    client.subscribedRooms.add(roomId);
    if (!roomSubscriptions.has(roomId)) roomSubscriptions.set(roomId, new Set());
    roomSubscriptions.get(roomId)!.add(client);
  }
}

function unsubscribe(client: ClientState, roomIds: string[]) {
  for (const roomId of roomIds) {
    client.subscribedRooms.delete(roomId);
    roomSubscriptions.get(roomId)?.delete(client);
  }
}

function removeClient(client: ClientState) {
  clients.delete(client);
  for (const roomId of client.subscribedRooms) {
    roomSubscriptions.get(roomId)?.delete(client);
  }
}

export function publishEvent(roomId: string, payload: Record<string, unknown>) {
  const subscribers = roomSubscriptions.get(roomId);
  if (!subscribers) return;
  const data = JSON.stringify({ ...payload, roomId });
  for (const client of subscribers) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(data);
    }
  }
}

export function setupWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const botWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (url.pathname === "/bot-ws") {
      // Bot direct WebSocket — auth via botKey query param
      botWss.handleUpgrade(req, socket, head, (ws) => {
        void (async () => {
          try {
            const botKey = url.searchParams.get("botKey");
            if (!botKey) { ws.close(1008, "Missing botKey"); return; }

            const hash = createHash("sha256").update(botKey).digest("hex");
            const [bot] = await db
              .select({ id: bots.id, displayName: bots.displayName, status: bots.status })
              .from(bots)
              .where(eq(bots.apiKeyHash, hash))
              .limit(1);

            if (!bot || bot.status !== "active") { ws.close(1008, "Unauthorized"); return; }

            // Replace any existing connection for this bot
            const existing = getBotSocket(bot.id);
            if (existing && existing.readyState === WebSocket.OPEN) {
              existing.close(1000, "Replaced by new connection");
            }

            registerBot(bot.id, ws);
            ws.send(JSON.stringify({ type: "connected", botId: bot.id, botName: bot.displayName }));

            const pingInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.ping();
            }, 30_000);

            ws.on("close", () => { unregisterBot(bot.id); clearInterval(pingInterval); });
            ws.on("error", () => { unregisterBot(bot.id); clearInterval(pingInterval); });
          } catch {
            ws.close(1011, "Server error");
          }
        })();
      });

    } else if (url.pathname.startsWith("/ws")) {
      // Human / legacy bot JWT connection
      wss.handleUpgrade(req, socket, head, (ws) => {
        const token = url.searchParams.get("token") ?? extractCookieToken(req.headers.cookie);

        let userId: string | undefined;
        let botId: string | undefined;

        if (token) {
          try {
            const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub?: string; botId?: string; type?: string };
            if (payload.type === "bot") {
              botId = payload.botId;
            } else {
              userId = payload.sub;
            }
          } catch {
            ws.close(1008, "Invalid token");
            return;
          }
        }

        const client: ClientState = { socket: ws, userId, botId, subscribedRooms: new Set() };
        clients.add(client);

        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as { type: string; roomIds?: string[]; status?: string; roomId?: string };
            if (msg.type === "subscribe" && Array.isArray(msg.roomIds)) {
              subscribe(client, msg.roomIds);
            } else if (msg.type === "unsubscribe" && Array.isArray(msg.roomIds)) {
              unsubscribe(client, msg.roomIds);
            } else if (msg.type === "typing" && msg.roomId) {
              publishEvent(msg.roomId, { type: "presence.typing", userId, botId });
            }
          } catch {
            // ignore malformed messages
          }
        });

        ws.on("close", () => removeClient(client));
        ws.on("error", () => removeClient(client));

        ws.send(JSON.stringify({ type: "connected", userId, botId }));
      });

    } else {
      socket.destroy();
    }
  });

  return wss;
}

function extractCookieToken(cookies: string | undefined): string | null {
  if (!cookies) return null;
  const match = cookies.match(/(?:^|; )tw_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}
