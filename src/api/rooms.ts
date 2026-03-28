import { apiFetch } from "./client.ts";

export type WorldType = "higher" | "middle" | "worker";
export type MemberRole = "participant" | "observer" | "owner";
export type MemberType = "human" | "bot";

export interface Room {
  id: string;
  world: WorldType;
  padiId?: string;
  name: string;
  description?: string;
  status: "active" | "archived";
  createdByUserId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMember {
  id: string;
  roomId: string;
  memberType: MemberType;
  userId?: string;
  botId?: string;
  role: MemberRole;
  displayName?: string;
  joinedAt: string;
  leftAt?: string;
}

export const roomsApi = {
  list: (world?: WorldType, padiId?: string) => {
    const params = new URLSearchParams();
    if (world) params.set("world", world);
    if (padiId) params.set("padiId", padiId);
    const qs = params.toString();
    return apiFetch<{ rooms: Room[] }>(`/api/rooms${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) =>
    apiFetch<{ room: Room; members: RoomMember[] }>(`/api/rooms/${id}`),

  create: (data: { world: WorldType; name: string; description?: string; padiId?: string }) =>
    apiFetch<{ room: Room }>("/api/rooms", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: Partial<{ name: string; description: string; status: "active" | "archived" }>) =>
    apiFetch<{ room: Room }>(`/api/rooms/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  addMember: (roomId: string, data: { memberType: MemberType; userId?: string; botId?: string; role?: MemberRole }) =>
    apiFetch<{ member: RoomMember }>(`/api/rooms/${roomId}/members`, { method: "POST", body: JSON.stringify(data) }),

  removeMember: (roomId: string, memberId: string) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${roomId}/members/${memberId}`, { method: "DELETE" }),
};
