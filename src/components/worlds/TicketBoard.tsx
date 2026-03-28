import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Ticket } from "lucide-react";
import { ticketsApi, type Ticket as TicketType, type TicketStatus } from "../../api/tickets.ts";
import { CreateTicketModal } from "./CreateTicketModal.tsx";
import { TicketDetail } from "./TicketDetail.tsx";
import { useLiveUpdates } from "../../context/LiveUpdatesContext.tsx";
import { useEffect } from "react";

interface TicketBoardProps {
  roomId: string;
}

const columns: { status: TicketStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "text-zinc-500" },
  { status: "todo", label: "Todo", color: "text-blue-600" },
  { status: "in_progress", label: "In Progress", color: "text-yellow-700" },
  { status: "in_review", label: "In Review", color: "text-purple-600" },
  { status: "done", label: "Done", color: "text-green-600" },
];

const priorityDot: Record<string, string> = {
  low: "bg-zinc-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

export function TicketBoard({ roomId }: TicketBoardProps) {
  const queryClient = useQueryClient();
  const { addHandler } = useLiveUpdates();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tickets", roomId],
    queryFn: () => ticketsApi.list(roomId),
  });

  useEffect(() => {
    const unsub = addHandler((event) => {
      if (
        (event.type === "ticket.created" || event.type === "ticket.updated" || event.type === "ticket.checkout") &&
        (event as { roomId?: string }).roomId === roomId
      ) {
        void queryClient.invalidateQueries({ queryKey: ["tickets", roomId] });
      }
    });
    return unsub;
  }, [roomId, addHandler, queryClient]);

  const tickets = data?.tickets ?? [];
  const ticketsByStatus = (status: TicketStatus) => tickets.filter((t) => t.status === status);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
          <Ticket className="w-3.5 h-3.5" />
          Tickets
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Ticket
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 text-sm text-zinc-400">Loading tickets...</div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 h-full p-4 min-w-max">
            {columns.map(({ status, label, color }) => {
              const col = ticketsByStatus(status);
              return (
                <div key={status} className="w-64 flex flex-col bg-zinc-50 rounded-xl border border-zinc-200">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200">
                    <span className={`text-xs font-semibold ${color}`}>{label}</span>
                    <span className="text-xs text-zinc-400 bg-zinc-200 px-1.5 py-0.5 rounded-full">
                      {col.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {col.map((ticket: TicketType) => (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className="w-full text-left bg-white rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-mono text-zinc-400">#{ticket.ticketNumber}</span>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[ticket.priority] ?? "bg-zinc-400"}`} />
                          {ticket.checkedOutByBotId && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full ml-auto">
                              active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-800 font-medium leading-snug line-clamp-2">{ticket.title}</p>
                        {ticket.description && (
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{ticket.description}</p>
                        )}
                      </button>
                    ))}
                    {col.length === 0 && (
                      <div className="text-xs text-zinc-300 text-center py-4">Empty</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && <CreateTicketModal roomId={roomId} onClose={() => setShowCreate(false)} />}
      {selectedTicketId && (
        <TicketDetail
          roomId={roomId}
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
        />
      )}
    </div>
  );
}
