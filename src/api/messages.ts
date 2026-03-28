import { apiFetch } from "./client.ts";

export type MessageType = "chat" | "status_update" | "meeting_request" | "dispatch" | "step_away" | "return";
export type AuthorType = "human" | "bot" | "system";

export interface Message {
  id: string;
  roomId: string;
  authorType: AuthorType;
  authorUserId?: string;
  authorBotId?: string;
  body: string;
  messageType: MessageType;
  parentMessageId?: string;
  metadata: Record<string, unknown>;
  editedAt?: string;
  deletedAt?: string;
  createdAt: string;
}

export const messagesApi = {
  list: (roomId: string, before?: string) =>
    apiFetch<{ messages: Message[] }>(`/api/rooms/${roomId}/messages${before ? `?before=${before}` : ""}`),

  post: (roomId: string, body: string, messageType: MessageType = "chat", parentMessageId?: string) =>
    apiFetch<{ message: Message }>(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, messageType, parentMessageId }),
    }),

  edit: (roomId: string, messageId: string, body: string) =>
    apiFetch<{ message: Message }>(`/api/rooms/${roomId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),

  delete: (roomId: string, messageId: string) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${roomId}/messages/${messageId}`, { method: "DELETE" }),
};
