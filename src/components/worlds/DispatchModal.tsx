import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { X, Send, Bot } from "lucide-react";
import { botsApi, type Bot as BotType } from "../../api/bots.ts";
import { transitionsApi } from "../../api/transitions.ts";

interface DispatchModalProps {
  roomId: string;
  onClose: () => void;
}

export function DispatchModal({ roomId, onClose }: DispatchModalProps) {
  const navigate = useNavigate();
  const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());
  const [taskDescription, setTaskDescription] = useState("");
  const [taskName, setTaskName] = useState("");

  const { data: botsData, isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: () => botsApi.list(),
  });

  const dispatch = useMutation({
    mutationFn: () =>
      transitionsApi.sendToWork(roomId, Array.from(selectedBotIds), taskDescription, taskName || undefined),
    onSuccess: ({ workerRoom }) => {
      onClose();
      void navigate(`/rooms/${workerRoom.id}`);
    },
  });

  function toggleBot(botId: string) {
    setSelectedBotIds((prev) => {
      const next = new Set(prev);
      if (next.has(botId)) next.delete(botId);
      else next.add(botId);
      return next;
    });
  }

  const bots = (botsData?.bots ?? []).filter((b: BotType) => b.status === "active");
  const canSubmit = selectedBotIds.size > 0 && taskDescription.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-zinc-900">Send to Work</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Task description */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">What needs to be done?</label>
            <textarea
              autoFocus
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe the task for the agents..."
              rows={3}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Optional task name */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">Room name (optional)</label>
            <input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Auto-generated from description if blank"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Bot selection */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Select agents ({selectedBotIds.size} selected)
            </label>
            {isLoading ? (
              <p className="text-xs text-zinc-400 py-2">Loading agents...</p>
            ) : bots.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-zinc-300 rounded-lg">
                <Bot className="w-6 h-6 text-zinc-300 mx-auto mb-1" />
                <p className="text-xs text-zinc-400">No active agents available.</p>
                <p className="text-xs text-zinc-300 mt-0.5">Create one from the Agents page first.</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {bots.map((bot: BotType) => {
                  const selected = selectedBotIds.has(bot.id);
                  return (
                    <button
                      key={bot.id}
                      onClick={() => toggleBot(bot.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                        selected
                          ? "bg-blue-50 border border-blue-300"
                          : "hover:bg-zinc-50 border border-zinc-200"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        selected ? "border-blue-600 bg-blue-600" : "border-zinc-300"
                      }`}>
                        {selected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-zinc-900">{bot.displayName}</div>
                        <div className="text-xs text-zinc-400">{bot.provider}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {dispatch.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {dispatch.error?.message}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              onClick={() => dispatch.mutate()}
              disabled={!canSubmit || dispatch.isPending}
              className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {dispatch.isPending ? "Dispatching..." : "Send to Work"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
