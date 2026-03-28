import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Message } from "../api/messages.ts";
import { getStoredToken } from "../api/client.ts";

type WsEvent =
  | { type: "connected"; userId?: string; botId?: string }
  | { type: "message.new"; roomId: string; message: Message }
  | { type: "message.edited"; roomId: string; message: Message }
  | { type: "message.deleted"; roomId: string; messageId: string }
  | { type: "presence.typing"; roomId: string; userId?: string; botId?: string }
  | { type: "transition"; roomId: string; transitionType: string; message?: Message }
  | { type: "ticket.created"; roomId: string; ticket: unknown }
  | { type: "ticket.updated"; roomId: string; ticket: unknown }
  | { type: "ticket.checkout"; roomId: string; ticket: unknown };

type EventHandler = (event: WsEvent) => void;

interface LiveUpdatesContextValue {
  subscribeRooms: (roomIds: string[]) => void;
  unsubscribeRooms: (roomIds: string[]) => void;
  sendTyping: (roomId: string) => void;
  addHandler: (handler: EventHandler) => () => void;
  connected: boolean;
}

const LiveUpdatesContext = createContext<LiveUpdatesContextValue | null>(null);

const WS_URL = (import.meta.env.VITE_WS_URL ?? "ws://localhost:3200") + "/ws";

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const handlers = useRef<Set<EventHandler>>(new Set());
  const queryClient = useQueryClient();

  useEffect(() => {
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const token = getStoredToken();
      const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
      socket = new WebSocket(url);
      ws.current = socket;

      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        ws.current = null;
        reconnectTimer = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket.close();

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as WsEvent;

          // Invalidate React Query caches
          if (data.type === "message.new" || data.type === "message.edited" || data.type === "message.deleted") {
            void queryClient.invalidateQueries({ queryKey: ["messages", data.roomId] });
          }
          if (data.type === "transition") {
            void queryClient.invalidateQueries({ queryKey: ["rooms"] });
          }

          for (const handler of handlers.current) handler(data);
        } catch {
          // ignore malformed
        }
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [queryClient]);

  function send(payload: object) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(payload));
    }
  }

  return (
    <LiveUpdatesContext.Provider value={{
      subscribeRooms: (roomIds) => send({ type: "subscribe", roomIds }),
      unsubscribeRooms: (roomIds) => send({ type: "unsubscribe", roomIds }),
      sendTyping: (roomId) => send({ type: "typing", roomId }),
      addHandler: (handler) => {
        handlers.current.add(handler);
        return () => handlers.current.delete(handler);
      },
      connected,
    }}>
      {children}
    </LiveUpdatesContext.Provider>
  );
}

export function useLiveUpdates() {
  const ctx = useContext(LiveUpdatesContext);
  if (!ctx) throw new Error("useLiveUpdates must be used within LiveUpdatesProvider");
  return ctx;
}
