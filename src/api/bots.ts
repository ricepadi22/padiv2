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

export interface ProviderConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface Provider {
  name: string;
  label: string;
  configFields: ProviderConfigField[];
}

export const botsApi = {
  list: () =>
    apiFetch<{ bots: Bot[] }>("/api/bots"),

  get: (id: string) =>
    apiFetch<{ bot: Bot }>(`/api/bots/${id}`),

  listProviders: () =>
    apiFetch<{ providers: Provider[] }>("/api/bots/providers"),

  create: (data: {
    name: string;
    displayName: string;
    type?: string;
    avatarUrl?: string;
    description?: string;
    provider?: string;
    providerConfig?: Record<string, unknown>;
  }) =>
    apiFetch<{ bot: Bot; apiKey: string }>("/api/bots", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{
    displayName: string;
    status: string;
    description: string;
    avatarUrl: string;
    provider: string;
    providerConfig: Record<string, unknown>;
  }>) =>
    apiFetch<{ bot: Bot }>(`/api/bots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  rotateKey: (id: string) =>
    apiFetch<{ apiKey: string }>(`/api/bots/${id}/rotate-key`, { method: "POST" }),

  inviteToRoom: (roomId: string, botId: string) =>
    apiFetch<{ member: unknown }>(`/api/rooms/${roomId}/members`, {
      method: "POST",
      body: JSON.stringify({ botId, memberType: "bot" }),
    }),
};
