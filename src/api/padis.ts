import { apiFetch } from "./client.ts";

export interface Padi {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  createdByUserId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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

export const padisApi = {
  list: () => apiFetch<{ padis: Padi[] }>("/api/padis"),
  get: (id: string) => apiFetch<{ padi: Padi; members: PadiMember[] }>(`/api/padis/${id}`),
  create: (data: { name: string; description?: string }) =>
    apiFetch<{ padi: Padi }>("/api/padis", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; description?: string; status?: string }) =>
    apiFetch<{ padi: Padi }>(`/api/padis/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listRooms: (padiId: string) =>
    apiFetch<{ rooms: import("./rooms.ts").Room[] }>(`/api/padis/${padiId}/rooms`),
  addMember: (padiId: string, userId: string, role?: string) =>
    apiFetch<{ member: PadiMember }>(`/api/padis/${padiId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId, role }),
    }),
  removeMember: (padiId: string, memberId: string) =>
    apiFetch(`/api/padis/${padiId}/members/${memberId}`, { method: "DELETE" }),
};
