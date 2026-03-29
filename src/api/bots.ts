import { apiFetch } from "./client.ts";

export interface Bot {
  id: string;
  name: string;
  displayName: string;
  type: string;
  avatarUrl?: string;
  description?: string;
  ownerUserId?: string;
  apiKeyPrefix?: string;
  provider: string;
  providerConfig: Record<string, unknown>;
  status: "active" | "paused" | "offline";
  config: Record<string, unknown>;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const botsApi = {
  list: () =>
    apiFetch<{ bots: Bot[] }>("/api/bots"),
};
