import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, RotateCcw, Copy, Check } from "lucide-react";
import { botsApi, type Bot as BotType } from "../api/bots.ts";
import { BotStatusBadge } from "../components/bots/BotStatusBadge.tsx";

const PROVIDER_LABELS: Record<string, string> = {
  http: "HTTP Webhook",
  openclaw_gateway: "OpenClaw Gateway",
  claude_api: "Claude API",
};

export function BotsPage() {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rotatedKeys, setRotatedKeys] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: () => botsApi.list(),
  });

  const rotateKey = useMutation({
    mutationFn: (botId: string) => botsApi.rotateKey(botId),
    onSuccess: (data, botId) => {
      setRotatedKeys((prev) => ({ ...prev, [botId]: data.apiKey }));
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      botsApi.update(id, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bots"] }),
  });

  function copyKey(botId: string, key: string) {
    void navigator.clipboard.writeText(key);
    setCopiedId(botId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const bots = data?.bots ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-600" />
          <h1 className="text-sm font-semibold text-gray-900">Agents</h1>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">Manage bots and their provider connections</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center text-gray-400 text-sm py-8">Loading agents...</div>
        ) : bots.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No agents yet. Use "Invite Agent" in any Middle or Worker room to create one.
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {bots.map((bot: BotType) => {
              const newKey = rotatedKeys[bot.id];
              return (
                <div key={bot.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{bot.displayName}</span>
                        <BotStatusBadge status={bot.status} />
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                          {PROVIDER_LABELS[bot.provider] ?? bot.provider}
                        </span>
                      </div>
                      {bot.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{bot.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-xs text-gray-400 font-mono">
                          {newKey ?? `${bot.apiKeyPrefix ?? "tw_bot_"}…`}
                        </span>
                        {newKey && (
                          <button
                            onClick={() => copyKey(bot.id, newKey)}
                            className="text-gray-400 hover:text-gray-700"
                          >
                            {copiedId === bot.id
                              ? <Check className="w-3 h-3 text-green-600" />
                              : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => toggleStatus.mutate({
                          id: bot.id,
                          status: bot.status === "active" ? "paused" : "active",
                        })}
                        disabled={toggleStatus.isPending}
                        className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {bot.status === "active" ? "Pause" : "Activate"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Rotate API key for ${bot.displayName}? The old key will stop working immediately.`)) {
                            rotateKey.mutate(bot.id);
                          }
                        }}
                        disabled={rotateKey.isPending}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        title="Rotate API key"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {bot.lastActiveAt && (
                    <p className="text-xs text-gray-400 mt-2">
                      Last active {new Date(bot.lastActiveAt).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
