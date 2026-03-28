import { apiFetch } from "./client.ts";

export const invitesApi = {
  generate: (roomId: string) =>
    apiFetch<{ token: string; expiresAt: string }>("/api/invites", {
      method: "POST",
      body: JSON.stringify({ roomId }),
    }),

  checkStatus: (token: string) =>
    apiFetch<{ status: string; bot?: { id: string; displayName: string; provider: string } | null }>(
      `/api/invites/${token}/status`
    ),
};
