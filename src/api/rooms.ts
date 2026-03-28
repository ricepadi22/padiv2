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
  joinedAt: string;
  leftAt?: string;
}

export const roomsApi = {
  list: (world?: WorldType) =>
    apiFetch<{ rooms: Room[] }>(`/api/rooms${world ? `?world=${world}` : ""}`),

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
