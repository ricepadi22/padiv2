import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Copy, Check } from "lucide-react";
import { botsApi, type Bot as BotType } from "../api/bots.ts";
import { BotStatusBadge } from "../components/bots/BotStatusBadge.tsx";

const PROVIDER_LABELS: Record<string, string> = {
  http: "HTTP Webhook",
  openclaw_gateway: "OpenClaw",
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
      <div className="px-6 py-4 border-b border-zinc-200 shrink-0">
        <h1 className="text-sm font-semibold text-zinc-900">Agents</h1>
        <p className="text-xs text-zinc-400 mt-0.5">Manage agent connections and API keys</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center text-zinc-400 text-sm py-12">Loading...</div>
        ) : bots.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-zinc-400">No agents yet.</p>
            <p className="text-xs text-zinc-400 mt-1">Use "Invite Agent" in any Middle or Worker room to add one.</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {bots.map((bot: BotType) => {
              const newKey = rotatedKeys[bot.id];
              return (
                <div key={bot.id} className="border border-zinc-200 rounded-xl p-4 bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-900">{bot.displayName}</span>
                        <BotStatusBadge status={bot.status} />
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium">
                          {PROVIDER_LABELS[bot.provider] ?? bot.provider}
                        </span>
                      </div>
                      {bot.description && (
                        <p className="text-xs text-zinc-400 mt-0.5">{bot.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-2">
                        <code className="text-xs font-mono text-zinc-500">
                          {newKey ?? `${bot.apiKeyPrefix ?? "tw_bot_"}…`}
                        </code>
                        {newKey && (
                          <button
                            onClick={() => copyKey(bot.id, newKey)}
                            className="text-zinc-400 hover:text-zinc-700 transition-colors"
                          >
                            {copiedId === bot.id
                              ? <Check className="w-3 h-3 text-emerald-600" />
                              : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleStatus.mutate({
                          id: bot.id,
                          status: bot.status === "active" ? "paused" : "active",
                        })}
                        disabled={toggleStatus.isPending}
                        className="text-xs px-2.5 py-1.5 border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                      >
                        {bot.status === "active" ? "Pause" : "Activate"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Rotate API key for ${bot.displayName}? The old key stops working immediately.`)) {
                            rotateKey.mutate(bot.id);
                          }
                        }}
                        disabled={rotateKey.isPending}
                        className="text-zinc-400 hover:text-zinc-700 disabled:opacity-50 transition-colors"
                        title="Rotate API key"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {bot.lastActiveAt && (
                    <p className="text-xs text-zinc-400 mt-2.5 pt-2.5 border-t border-zinc-100">
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
