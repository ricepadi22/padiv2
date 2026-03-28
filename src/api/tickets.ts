import { apiFetch } from "./client.ts";

export type TicketStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface Ticket {
  id: string;
  roomId: string;
  parentTicketId?: string;
  title: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeBotId?: string;
  createdByUserId?: string;
  createdByBotId?: string;
  ticketNumber: number;
  checkedOutByBotId?: string;
  checkedOutAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TicketActivity {
  id: string;
  ticketId: string;
  actorType: string;
  actorUserId?: string;
  actorBotId?: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  comment?: string;
  createdAt: string;
}

export const ticketsApi = {
  list: (roomId: string, status?: string) =>
    apiFetch<{ tickets: Ticket[] }>(`/api/rooms/${roomId}/tickets${status ? `?status=${status}` : ""}`),

  get: (roomId: string, ticketId: string) =>
    apiFetch<{ ticket: Ticket; activity: TicketActivity[] }>(`/api/rooms/${roomId}/tickets/${ticketId}`),

  create: (roomId: string, data: { title: string; description?: string; priority?: TicketPriority; assigneeBotId?: string; parentTicketId?: string }) =>
    apiFetch<{ ticket: Ticket }>(`/api/rooms/${roomId}/tickets`, { method: "POST", body: JSON.stringify(data) }),

  update: (roomId: string, ticketId: string, data: { title?: string; description?: string; status?: TicketStatus; priority?: TicketPriority; assigneeBotId?: string | null; comment?: string }) =>
    apiFetch<{ ticket: Ticket }>(`/api/rooms/${roomId}/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify(data) }),

  addComment: (roomId: string, ticketId: string, comment: string) =>
    apiFetch<{ activity: TicketActivity }>(`/api/rooms/${roomId}/tickets/${ticketId}/activity`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),
};
