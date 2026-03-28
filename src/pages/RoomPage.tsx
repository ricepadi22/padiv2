import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, LogOut, Send as SendIcon, Users, Ticket, MessageSquare, Trash2 } from "lucide-react";
import { roomsApi } from "../api/rooms.ts";
import { messagesApi } from "../api/messages.ts";
import { transitionsApi } from "../api/transitions.ts";
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

  useEffect(() => {
    if (!roomId) return;
    subscribeRooms([roomId]);
    const unsub = addHandler((event) => {
      if (event.type === "message.new" && event.roomId === roomId) {
        setLocalMessages((prev) => [...prev, event.message]);
        void queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
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

  const stepAway = useMutation({
    mutationFn: () => transitionsApi.stepAway(roomId!),
    onSuccess: ({ higherRoom }) => void navigate(`/rooms/${higherRoom.id}`),
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

  const meetingRequestMessages = messages.filter((m) => m.messageType === "meeting_request");
  const accentClass = room ? (worldAccent[room.world] ?? "") : "";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 bg-white shrink-0">
        <button
          onClick={() => void navigate(-1)}
          className="text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h1 className="text-sm font-semibold text-zinc-900 truncate">{room?.name ?? "Loading..."}</h1>
          {room && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border shrink-0 ${accentClass}`}>
              {room.world}
            </span>
          )}
          {isObserver && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium shrink-0">
              observing
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="flex items-center gap-1 text-xs text-zinc-400 mr-1"
            title={activeMembers.map((m) => m.displayName ?? (m.memberType === "bot" ? "Agent" : "User")).join(", ")}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{activeMembers.length}</span>
          </div>
          {room?.world === "middle" && (
            <button
              onClick={() => stepAway.mutate()}
              disabled={stepAway.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <LogOut className="w-3 h-3" />
              Step Away
            </button>
          )}
          {room?.world === "middle" && (
            <button
              onClick={() => setShowDispatch(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <SendIcon className="w-3 h-3" />
              Send to Work
            </button>
          )}
          {room?.world === "worker" && (
            <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 transition-colors ${
                  activeTab === "chat" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                Chat
              </button>
              <button
                onClick={() => setActiveTab("tickets")}
                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 transition-colors ${
                  activeTab === "tickets" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                <Ticket className="w-3 h-3" />
                Tickets
              </button>
            </div>
          )}
          {canInviteAgents && (
            <button
              onClick={() => setShowInviteAgent(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <Bot className="w-3 h-3" />
              Invite Agent
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
            />
          </div>
        </>
      )}

      {showInviteAgent && roomId && (
        <InviteAgentModal roomId={roomId} world={room?.world} onClose={() => setShowInviteAgent(false)} />
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
    </div>
  );
}
