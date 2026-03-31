import type { WebSocket } from "ws";

// In-memory registry: botId → active WebSocket connection
const registry = new Map<string, WebSocket>();

export function registerBot(botId: string, ws: WebSocket): void {
  registry.set(botId, ws);
}

export function unregisterBot(botId: string): void {
  registry.delete(botId);
}

export function getBotSocket(botId: string): WebSocket | undefined {
  return registry.get(botId);
}

export function getOnlineBotIds(): string[] {
  return Array.from(registry.keys());
}

export function disconnectBot(botId: string): void {
  const ws = registry.get(botId);
  if (ws) {
    ws.close(1000, "Replaced by new agent");
    registry.delete(botId);
  }
}
