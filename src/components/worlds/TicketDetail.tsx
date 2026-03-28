import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ChevronRight } from "lucide-react";
import { ticketsApi, type TicketStatus, type TicketPriority } from "../../api/tickets.ts";

interface TicketDetailProps {
  roomId: string;
  ticketId: string;
  onClose: () => void;
}

const statusOrder: TicketStatus[] = ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"];

const priorityColors: Record<TicketPriority, string> = {
  low: "text-zinc-500 bg-zinc-100",
  medium: "text-blue-600 bg-blue-50",
  high: "text-orange-600 bg-orange-50",
  urgent: "text-red-600 bg-red-50",
};

const statusColors: Record<TicketStatus, string> = {
  backlog: "text-zinc-500 bg-zinc-100",
  todo: "text-blue-600 bg-blue-50",
  in_progress: "text-yellow-700 bg-yellow-50",
  in_review: "text-purple-600 bg-purple-50",
  done: "text-green-600 bg-green-50",
  blocked: "text-red-600 bg-red-50",
  cancelled: "text-zinc-400 bg-zinc-100",
};

export function TicketDetail({ roomId, ticketId, onClose }: TicketDetailProps) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ticket", roomId, ticketId],
    queryFn: () => ticketsApi.get(roomId, ticketId),
  });

  const updateStatus = useMutation({
    mutationFn: (status: TicketStatus) => ticketsApi.update(roomId, ticketId, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tickets", roomId] });
      void queryClient.invalidateQueries({ queryKey: ["ticket", roomId, ticketId] });
    },
  });

  const addComment = useMutation({
    mutationFn: () => ticketsApi.addComment(roomId, ticketId, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", roomId, ticketId] });
      setComment("");
    },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  const { ticket, activity } = data!;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 p-6 border-b border-zinc-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-zinc-400">#{ticket.ticketNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[ticket.priority]}`}>
                {ticket.priority}
              </span>
            </div>
            <h2 className="text-base font-semibold text-zinc-900">{ticket.title}</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {statusOrder.map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus.mutate(s)}
                  disabled={ticket.status === s || updateStatus.isPending}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    ticket.status === s
                      ? statusColors[s] + " ring-2 ring-offset-1 ring-current"
                      : "text-zinc-500 bg-zinc-100 hover:bg-zinc-200"
                  }`}
                >
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          {ticket.description && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Description</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {/* Activity */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Activity</p>
            <div className="space-y-2">
              {activity.length === 0 ? (
                <p className="text-xs text-zinc-400">No activity yet</p>
              ) : (
                activity.map((entry) => (
                  <div key={entry.id} className="flex gap-2.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-500">
                        {entry.actorType === "system" ? "System" : entry.actorBotId ? "Bot" : "Human"}
                      </span>
                      {" "}
                      {entry.action === "status_changed" && (
                        <span className="text-zinc-700">
                          changed status{" "}
                          <span className="font-medium">{entry.fromStatus?.replace("_", " ")}</span>
                          {" "}<ChevronRight className="w-3 h-3 inline" />{" "}
                          <span className="font-medium">{entry.toStatus?.replace("_", " ")}</span>
                        </span>
                      )}
                      {entry.action === "created" && <span className="text-zinc-700">created this ticket</span>}
                      {entry.action === "commented" && <span className="text-zinc-700">commented</span>}
                      {entry.action === "checked_out" && <span className="text-zinc-700">checked out</span>}
                      {entry.action === "checked_in" && <span className="text-zinc-700">checked in</span>}
                      {entry.action === "assigned" && <span className="text-zinc-700">updated assignee</span>}
                      {entry.action === "sub_task_created" && <span className="text-zinc-700">created sub-task</span>}
                      {entry.comment && (
                        <p className="mt-0.5 text-zinc-600 bg-zinc-50 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                          {entry.comment}
                        </p>
                      )}
                      <span className="text-zinc-400 ml-1">
                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Comment input */}
        <div className="p-4 border-t border-zinc-100 flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && comment.trim()) {
                e.preventDefault();
                addComment.mutate();
              }
            }}
          />
          <button
            onClick={() => addComment.mutate()}
            disabled={!comment.trim() || addComment.isPending}
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
