import { apiFetch } from "./client.ts";
import type { Room } from "./rooms.ts";

export interface Padi {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  createdByUserId?: string;
  status: string;
  isPublic: boolean;
  requireApproval: boolean;
  hostBotId?: string;
  createdAt: string;
  updatedAt: string;
  // Enriched fields from list/get endpoints
  memberCount?: number;
  roomCount?: number;
  hasHost?: boolean;
  myRole?: string;
  pendingJoinRequestCount?: number;
}

export interface DiscoverablePadi extends Padi {
  memberCount: number;
  roomCount: number;
  hasHost: boolean;
}

export interface PadiMember {
  id: string;
  padiId: string;
  userId: string;
  role: string;
  joinedAt: string;
  displayName: string;
  email: string;
}

export interface JoinRequest {
  id: string;
  padiId: string;
  userId: string;
  status: string;
  message?: string;
  reviewedByUserId?: string;
  createdAt: string;
  displayName: string;
  email: string;
}

export interface PadiHostBot {
  id: string;
  displayName: string;
  status: string;
  provider: string;
  apiKeyPrefix?: string;
}

export const padisApi = {
  list: () => apiFetch<{ padis: Padi[] }>("/api/padis"),

  discover: (params?: { search?: string; sort?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.sort) qs.set("sort", params.sort);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch<{ padis: DiscoverablePadi[] }>(`/api/padis/discover${query}`);
  },

  get: (id: string) =>
    apiFetch<{ padi: Padi; members: PadiMember[]; hostBot: PadiHostBot | null }>(`/api/padis/${id}`),

  create: (data: { name: string; description?: string; isPublic?: boolean; requireApproval?: boolean }) =>
    apiFetch<{ padi: Padi }>("/api/padis", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string; description?: string; status?: string; isPublic?: boolean; requireApproval?: boolean }) =>
    apiFetch<{ padi: Padi }>(`/api/padis/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  join: (padiId: string, message?: string) =>
    apiFetch<{ joined?: boolean; requested?: boolean; member?: PadiMember; joinRequest?: JoinRequest }>(
      `/api/padis/${padiId}/join`, { method: "POST", body: JSON.stringify({ message }) }
    ),

  listJoinRequests: (padiId: string, status = "pending") =>
    apiFetch<{ joinRequests: JoinRequest[] }>(`/api/padis/${padiId}/join-requests?status=${status}`),

  reviewJoinRequest: (padiId: string, requestId: string, status: "approved" | "rejected") =>
    apiFetch<{ joinRequest: JoinRequest }>(`/api/padis/${padiId}/join-requests/${requestId}`, {
      method: "PATCH", body: JSON.stringify({ status }),
    }),

  listRooms: (padiId: string) =>
    apiFetch<{ rooms: Room[] }>(`/api/padis/${padiId}/rooms`),

  addMember: (padiId: string, userId: string, role?: string) =>
    apiFetch<{ member: PadiMember }>(`/api/padis/${padiId}/members`, {
      method: "POST", body: JSON.stringify({ userId, role }),
    }),

  removeMember: (padiId: string, memberId: string) =>
    apiFetch(`/api/padis/${padiId}/members/${memberId}`, { method: "DELETE" }),

  createHost: (padiId: string, data: { displayName: string; provider?: string; providerConfig?: Record<string, unknown> }) =>
    apiFetch<{ bot: PadiHostBot & { apiKey: string } }>(`/api/padis/${padiId}/host`, {
      method: "POST", body: JSON.stringify(data),
    }),

  updateHost: (padiId: string, data: { displayName?: string; providerConfig?: Record<string, unknown>; status?: string }) =>
    apiFetch<{ bot: PadiHostBot }>(`/api/padis/${padiId}/host`, {
      method: "PATCH", body: JSON.stringify(data),
    }),

  removeHost: (padiId: string) =>
    apiFetch<{ ok: boolean }>(`/api/padis/${padiId}/host`, { method: "DELETE" }),
};
