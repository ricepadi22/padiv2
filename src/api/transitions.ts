import { apiFetch } from "./client.ts";
import type { Room } from "./rooms.ts";
import type { Message } from "./messages.ts";

export const transitionsApi = {
  stepAway: (fromRoomId: string, reason?: string) =>
    apiFetch<{ higherRoom: Room }>("/api/transitions/step-away", {
      method: "POST",
      body: JSON.stringify({ fromRoomId, reason }),
    }),

  return: (fromRoomId: string) =>
    apiFetch<{ middleRoomId: string }>("/api/transitions/return", {
      method: "POST",
      body: JSON.stringify({ fromRoomId }),
    }),

  sendToWork: (fromRoomId: string, botIds: string[], taskDescription: string, name?: string) =>
    apiFetch<{ workerRoom: Room }>("/api/transitions/send-to-work", {
      method: "POST",
      body: JSON.stringify({ fromRoomId, botIds, taskDescription, name }),
    }),

  meetingRequest: (workerRoomId: string, reason: string) =>
    apiFetch<{ message: Message }>("/api/transitions/meeting-request", {
      method: "POST",
      body: JSON.stringify({ workerRoomId, reason }),
    }),

  meetingRespond: (workerRoomId: string, accept: boolean, response?: string) =>
    apiFetch<{ ok: boolean; message: Message }>("/api/transitions/meeting-respond", {
      method: "POST",
      body: JSON.stringify({ workerRoomId, accept, response }),
    }),
};
