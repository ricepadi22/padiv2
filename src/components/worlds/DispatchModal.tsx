import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { X, Send, Bot, Zap } from "lucide-react";
import { transitionsApi } from "../../api/transitions.ts";
import { roomsApi } from "../../api/rooms.ts";
import { padisApi } from "../../api/padis.ts";

interface DispatchModalProps {
  roomId: string;
  onClose: () => void;
}

export function DispatchModal({ roomId, onClose }: DispatchModalProps) {
  const navigate = useNavigate();
  const [taskDescription, setTaskDescription] = useState("");
  const [taskName, setTaskName] = useState("");

  const { data: roomData } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => roomsApi.get(roomId),
  });

  const padiId = roomData?.room.padiId;

  const { data: padiData } = useQuery({
    queryKey: ["padi", padiId],
    queryFn: () => padisApi.get(padiId!),
    enabled: !!padiId,
  });

  const hostBot = padiData?.hostBot;

  const dispatch = useMutation({
    mutationFn: () => transitionsApi.sendToWork(roomId, taskDescription, taskName || undefined),
    onSuccess: ({ workerRoom }) => {
      onClose();
      void navigate(`/rooms/${workerRoom.id}`);
    },
  });

  const canSubmit = taskDescription.trim().length > 0 && !!hostBot;

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
          {/* AI Host indicator */}
          {hostBot ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
              <Bot className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-900">{hostBot.displayName} will orchestrate</p>
                <p className="text-[11px] text-blue-600">Your padi's AI host will spawn worker bots as needed</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-800">No AI host configured. Set one up in Higher World → AI Host tab first.</p>
            </div>
          )}

          {/* Task description */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">What needs to be done?</label>
            <textarea
              autoFocus
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe the goal for the AI host to work on..."
              rows={3}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Optional task name */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">Task name (optional)</label>
            <input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Auto-generated from description if blank"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {dispatch.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {dispatch.error?.message}
            </p>
          )}

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
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {dispatch.isPending ? "Dispatching..." : "Send to Work"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
