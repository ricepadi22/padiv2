import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Send as SendIcon, Ticket, MessageSquare, Trash2, AlertCircle } from "lucide-react";
import { roomsApi } from "../api/rooms.ts";
import { messagesApi } from "../api/messages.ts";
import { transitionsApi } from "../api/transitions.ts";
import { padisApi } from "../api/padis.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { useLiveUpdates } from "../context/LiveUpdatesContext.tsx";
import { MessageBubble } from "../components/worlds/MessageBubble.tsx";
import { MessageComposer } from "../components/worlds/MessageComposer.tsx";
import { MeetingRequestBanner } from "../components/worlds/MeetingRequestBanner.tsx";
import { InviteAgentModal } from "../components/bots/InviteAgentModal.tsx";
import { TicketBoard } from "../components/worlds/TicketBoard.tsx";
import { DispatchModal } from "../components/worlds/DispatchModal.tsx";
import type { Message } from "../api/messages.ts";

const worldAccent: Record<string, string> = {
  higher: "text-amber-600 bg-amber-50 border-amber-200",
  middle: "text-green-600 bg-green-50 border-green-200",
  worker: "text-blue-600 bg-blue-50 border-blue-200",
};

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscribeRooms, unsubscribeRooms, addHandler } = useLiveUpdates();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [showInviteAgent, setShowInviteAgent] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "tickets">("tickets");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dispatchErrors, setDispatchErrors] = useState<{ botName: string; error: string; id: number }[]>([]);
  const errorIdRef = useRef(0);

  const { data: roomData } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => roomsApi.get(roomId!),
    enabled: !!roomId,
  });

  const { data: messagesData } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: () => messagesApi.list(roomId!),
    enabled: !!roomId,
  });

  const { data: padiData } = useQuery({
    queryKey: ["padi", roomData?.room.padiId],
    queryFn: () => padisApi.get(roomData!.room.padiId!),
    enabled: !!roomData?.room.padiId,
  });

  useEffect(() => {
    if (!roomId) return;
    subscribeRooms([roomId]);
    const unsub = addHandler((event) => {
      if (event.type === "message.new" && event.roomId === roomId) {
        setLocalMessages((prev) => [...prev, event.message]);
        void queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
      }
      if ((event.type === "member.joined" || event.type === "member.left") && event.roomId === roomId) {
        void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      }
      if (event.type === "dispatch.failed" && event.roomId === roomId) {
        const id = ++errorIdRef.current;
        setDispatchErrors((prev) => [...prev, { botName: String(event.botDisplayName), error: String(event.error), id }]);
        setTimeout(() => setDispatchErrors((prev) => prev.filter((e) => e.id !== id)), 6000);
      }
    });
    return () => {
      unsubscribeRooms([roomId]);
      unsub();
    };
  }, [roomId, subscribeRooms, unsubscribeRooms, addHandler, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages.length, localMessages.length]);

  const postMessage = useMutation({
    mutationFn: (body: string) => messagesApi.post(roomId!, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["messages", roomId] }),
  });

  const archiveRoom = useMutation({
    mutationFn: () => roomsApi.update(roomId!, { status: "archived" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      void navigate(-1);
    },
  });

  const room = roomData?.room;
  const members = roomData?.members ?? [];
  const messages = messagesData?.messages ?? [];

  const activeMembers = members.filter((m) => !m.leftAt);
  const myMember = members.find((m) => m.userId === user?.id);
  const isObserver = myMember?.role === "observer";
  const canInviteAgents = room?.world !== "higher";
  const botMembers = activeMembers
    .filter((m) => m.memberType === "bot")
    .map((m) => ({ id: m.botId ?? "", displayName: m.displayName ?? "Agent" }))
    .filter((m) => m.id);

  const meetingRequestMessages = messages.filter((m) => m.messageType === "meeting_request");
  const accentClass = room ? (worldAccent[room.world] ?? "") : "";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200 bg-white shrink-0">
        <button
          onClick={() => void navigate(-1)}
          className="text-zinc-400 hover:text-zinc-700 transition-colors shrink-0 p-1"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-semibold text-zinc-900 truncate">{room?.name ?? "Loading..."}</h1>
            {room && (
              <span className={`hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full font-medium border shrink-0 ${accentClass}`}>
                {room.world}
              </span>
            )}
          </div>
          <div
            className="text-[11px] text-zinc-400 truncate"
            title={activeMembers.map((m) => m.displayName ?? (m.memberType === "bot" ? "Agent" : "User")).join(", ")}
          >
            {activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""}
            {isObserver && " · observing"}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Worker World: chat/tickets toggle */}
          {room?.world === "worker" && (
            <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1.5 transition-colors ${
                  activeTab === "chat" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                <span className="hidden sm:inline">Chat</span>
              </button>
              <button
                onClick={() => setActiveTab("tickets")}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1.5 transition-colors ${
                  activeTab === "tickets" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                <Ticket className="w-3 h-3" />
                <span className="hidden sm:inline">Tickets</span>
              </button>
            </div>
          )}
          {room?.world === "middle" && (
            <button
              onClick={() => setShowDispatch(true)}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              title="Send to Work"
            >
              <SendIcon className="w-3 h-3" />
              <span className="hidden sm:inline">Send to Work</span>
            </button>
          )}
          {canInviteAgents && (
            <button
              onClick={() => setShowInviteAgent(true)}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors"
              title="Invite Agent"
            >
              <Bot className="w-3 h-3" />
              <span className="hidden sm:inline">Invite Agent</span>
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-zinc-400 hover:text-red-600 transition-colors p-1.5"
            title="Archive room"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Meeting request banners */}
      {meetingRequestMessages.length > 0 && (
        <div className="shrink-0 border-b border-zinc-100">
          {meetingRequestMessages.map((msg) => (
            <MeetingRequestBanner
              key={msg.id}
              message={msg}
              onResponded={() => void queryClient.invalidateQueries({ queryKey: ["messages", roomId] })}
            />
          ))}
        </div>
      )}

      {/* Tickets view (Worker World only) */}
      {room?.world === "worker" && activeTab === "tickets" && roomId ? (
        <div className="flex-1 overflow-hidden">
          <TicketBoard roomId={roomId} />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-3">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-zinc-400">
                No messages yet
              </div>
            ) : (
              messages.map((msg, idx) => {
                const prev = idx > 0 ? messages[idx - 1] : null;
                const isOwnMessage = msg.authorUserId === user?.id;
                const isSameAuthor = prev
                  && prev.authorType !== "system"
                  && msg.authorType !== "system"
                  && ((prev.authorUserId && prev.authorUserId === msg.authorUserId)
                    || (prev.authorBotId && prev.authorBotId === msg.authorBotId));
                // Collapse if same author within 5 minutes
                const isConsecutive = isSameAuthor
                  && (new Date(msg.createdAt).getTime() - new Date(prev!.createdAt).getTime()) < 5 * 60 * 1000;

                let authorName: string;
                if (msg.authorType === "system") {
                  authorName = "System";
                } else if (msg.authorBotId) {
                  authorName = members.find((m) => m.botId === msg.authorBotId)?.displayName ?? "Agent";
                } else if (isOwnMessage) {
                  authorName = user?.displayName ?? "You";
                } else {
                  authorName = members.find((m) => m.userId === msg.authorUserId)?.displayName
                    ?? `User ${msg.authorUserId?.slice(0, 6) ?? ""}`;
                }

                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    authorName={authorName}
                    isOwnMessage={isOwnMessage}
                    isConsecutive={!!isConsecutive}
                  />
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="shrink-0">
            <MessageComposer
              onSend={(body) => postMessage.mutate(body)}
              disabled={postMessage.isPending}
              observerMode={isObserver}
              botMembers={botMembers}
            />
          </div>
        </>
      )}

      {showInviteAgent && roomId && (
        <InviteAgentModal
          roomId={roomId}
          world={room?.world}
          roomName={room?.name}
          padiName={padiData?.padi.name}
          onClose={() => setShowInviteAgent(false)}
        />
      )}

      {showDispatch && roomId && (
        <DispatchModal roomId={roomId} onClose={() => setShowDispatch(false)} />
      )}

      {/* Delete/Archive confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900">Archive this room?</h2>
            <p className="text-sm text-zinc-500">
              This room will be archived and hidden from the room list. Messages will be preserved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={() => archiveRoom.mutate()}
                disabled={archiveRoom.isPending}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {archiveRoom.isPending ? "Archiving..." : "Archive Room"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch failure toasts */}
      {dispatchErrors.length > 0 && (
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 max-w-xs">
          {dispatchErrors.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl shadow text-sm"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-red-800">@{e.botName}</span>
                <span className="text-red-600"> didn't receive the message</span>
                <p className="text-[10px] text-red-400 mt-0.5 truncate">{e.error}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
