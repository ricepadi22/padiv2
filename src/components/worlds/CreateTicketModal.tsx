import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi, type TicketPriority } from "../../api/tickets.ts";

interface CreateTicketModalProps {
  roomId: string;
  onClose: () => void;
}

const priorities: { value: TicketPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "text-zinc-500" },
  { value: "medium", label: "Medium", color: "text-blue-600" },
  { value: "high", label: "High", color: "text-orange-600" },
  { value: "urgent", label: "Urgent", color: "text-red-600" },
];

export function CreateTicketModal({ roomId, onClose }: CreateTicketModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");

  const create = useMutation({
    mutationFn: () => ticketsApi.create(roomId, { title, description: description || undefined, priority }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tickets", roomId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">New Ticket</h2>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add more context..."
            rows={3}
            className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Priority</label>
          <div className="flex gap-2">
            {priorities.map((p) => (
              <button
                key={p.value}
                onClick={() => setPriority(p.value)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  priority === p.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 hover:border-zinc-400 text-zinc-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
            className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50"
          >
            {create.isPending ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
