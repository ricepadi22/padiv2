import { apiFetch } from "./client.ts";

export interface Bot {
  id: string;
  name: string;
  displayName: string;
  type: string;
  avatarUrl?: string;
  description?: string;
  ownerUserId?: string;
  status: "active" | "paused" | "offline";
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const botsApi = {
  list: () =>
    apiFetch<{ bots: Bot[] }>("/api/bots"),

  create: (data: { name: string; displayName: string; type?: string; avatarUrl?: string; description?: string }) =>
    apiFetch<{ bot: Bot; apiKey: string }>("/api/bots", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: Partial<{ displayName: string; status: string; description: string; avatarUrl: string }>) =>
    apiFetch<{ bot: Bot }>(`/api/bots/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};
