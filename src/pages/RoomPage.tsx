import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, LogOut, Send as SendIcon, Users } from "lucide-react";
import { roomsApi } from "../api/rooms.ts";
import { messagesApi } from "../api/messages.ts";
import { transitionsApi } from "../api/transitions.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { useLiveUpdates } from "../context/LiveUpdatesContext.tsx";
import { MessageBubble } from "../components/worlds/MessageBubble.tsx";
import { MessageComposer } from "../components/worlds/MessageComposer.tsx";
import { MeetingRequestBanner } from "../components/worlds/MeetingRequestBanner.tsx";
import { InviteAgentModal } from "../components/bots/InviteAgentModal.tsx";
import type { Message } from "../api/messages.ts";

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscribeRooms, unsubscribeRooms, addHandler } = useLiveUpdates();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

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

  // Subscribe to WebSocket room
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

  // Scroll to bottom on new messages
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

  const [showInviteAgent, setShowInviteAgent] = useState(false);

  const room = roomData?.room;
  const members = roomData?.members ?? [];
  const messages = messagesData?.messages ?? [];

  // Check if current user is an observer in this room
  const myMember = members.find((m) => m.userId === user?.id);
  const isObserver = myMember?.role === "observer";
  const canInviteAgents = room?.world !== "higher" && (user?.role === "leader" || user?.role === "admin");

  const meetingRequestMessages = messages.filter((m) => m.messageType === "meeting_request");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <button onClick={() => void navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-900 truncate">{room?.name ?? "Loading..."}</h1>
            {room && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                room.world === "higher" ? "bg-amber-100 text-amber-700" :
                room.world === "middle" ? "bg-blue-100 text-blue-700" :
                "bg-purple-100 text-purple-700"
              }`}>
                {room.world}
              </span>
            )}
            {isObserver && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                👁 Observing
              </span>
            )}
          </div>
          {room?.description && <div className="text-xs text-gray-500 truncate">{room.description}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Users className="w-4 h-4" />
            <span>{members.filter((m) => !m.leftAt).length}</span>
          </div>
          {room?.world === "middle" && (
            <button
              onClick={() => stepAway.mutate()}
              disabled={stepAway.isPending}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
              title="Step away to private discussion"
            >
              <LogOut className="w-3.5 h-3.5" />
              Step Away
            </button>
          )}
          {room?.world === "middle" && (
            <button
              onClick={() => void navigate(`/rooms/${roomId}/dispatch`)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
              title="Send agents to work"
            >
              <SendIcon className="w-3.5 h-3.5" />
              Send to Work
            </button>
          )}
          {canInviteAgents && (
            <button
              onClick={() => setShowInviteAgent(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              title="Invite an agent to this room"
            >
              <Bot className="w-3.5 h-3.5" />
              Invite Agent
            </button>
          )}
        </div>
      </div>

      {/* Meeting request banners */}
      {meetingRequestMessages.length > 0 && (
        <div className="shrink-0 border-b border-gray-100">
          {meetingRequestMessages.map((msg) => (
            <MeetingRequestBanner
              key={msg.id}
              message={msg}
              onResponded={() => void queryClient.invalidateQueries({ queryKey: ["messages", roomId] })}
            />
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No messages yet. Start the conversation.
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                authorName={msg.authorType === "system" ? "System" : (msg.authorUserId === user?.id ? (user?.displayName ?? "You") : `User ${msg.authorUserId?.slice(0, 6)}`)}
              />
            ))}
          </>
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

      {showInviteAgent && roomId && (
        <InviteAgentModal roomId={roomId} onClose={() => setShowInviteAgent(false)} />
      )}
    </div>
  );
}
