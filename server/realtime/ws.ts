import { createRequire } from "module";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";

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

  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws")) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Auth: token from query param or cookie
      const url = new URL(req.url!, `http://${req.headers.host}`);
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
  });

  return wss;
}

function extractCookieToken(cookies: string | undefined): string | null {
  if (!cookies) return null;
  const match = cookies.match(/(?:^|; )tw_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}
