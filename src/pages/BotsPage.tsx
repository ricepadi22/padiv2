import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Copy, Check, Plus, Trash2 } from "lucide-react";
import { botsApi, type Bot as BotType } from "../api/bots.ts";
import { BotStatusBadge } from "../components/bots/BotStatusBadge.tsx";
import { ProviderConfigForm } from "../components/bots/ProviderConfigForm.tsx";

const PROVIDER_LABELS: Record<string, string> = {
  http: "HTTP Webhook",
  openclaw_gateway: "OpenClaw",
  claude_api: "Claude API",
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BotsPage() {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rotatedKeys, setRotatedKeys] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProvider, setNewProvider] = useState("http");
  const [newProviderConfig, setNewProviderConfig] = useState<Record<string, unknown>>({});
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: () => botsApi.list(),
  });

  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => botsApi.listProviders(),
    enabled: showCreate,
  });

  const createBot = useMutation({
    mutationFn: () =>
      botsApi.create({
        name: newName.toLowerCase().replace(/\s+/g, "_"),
        displayName: newName,
        description: newDesc || undefined,
        provider: newProvider,
        providerConfig: newProviderConfig,
      }),
    onSuccess: ({ apiKey }) => {
      setCreatedKey(apiKey);
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });

  const deleteBot = useMutation({
    mutationFn: (botId: string) => botsApi.update(botId, { status: "offline" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bots"] }),
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

  function resetCreateForm() {
    setShowCreate(false);
    setNewName("");
    setNewDesc("");
    setNewProvider("http");
    setNewProviderConfig({});
    setCreatedKey(null);
  }

  const currentProvider = providersData?.providers.find((p) => p.name === newProvider);
  const bots = data?.bots ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-zinc-200 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-zinc-900">Agents</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Create and manage your agent connections</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Agent
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center text-zinc-400 text-sm py-12">Loading...</div>
        ) : bots.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Plus className="w-5 h-5 text-zinc-400" />
            </div>
            <p className="text-sm text-zinc-500 font-medium">No agents yet</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
              Agents are bots that can join your Middle and Worker World rooms. Create one to get started.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-xs font-medium px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Create Your First Agent
            </button>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {bots.map((bot: BotType) => {
              const newKey = rotatedKeys[bot.id];
              return (
                <div key={bot.id} className="border border-zinc-200 rounded-xl p-4 bg-white group">
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
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${bot.displayName}? The agent will be set to offline.`)) {
                            deleteBot.mutate(bot.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition-all"
                        title="Remove agent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {bot.lastActiveAt && (
                    <p className="text-xs text-zinc-400 mt-2.5 pt-2.5 border-t border-zinc-100">
                      Last active {timeAgo(bot.lastActiveAt)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-900">Create Agent</h2>
              <button onClick={resetCreateForm} className="text-zinc-400 hover:text-zinc-700">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {createdKey ? (
                /* Success — show API key */
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                    </div>
                    <span className="text-sm font-medium text-zinc-900">Agent created!</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-700 mb-2">API Key — copy it now, won't be shown again</p>
                    <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5">
                      <code className="flex-1 text-xs font-mono text-zinc-700 break-all">{createdKey}</code>
                      <button
                        onClick={() => copyKey("new", createdKey)}
                        className="shrink-0 text-zinc-400 hover:text-zinc-700"
                      >
                        {copiedId === "new" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <button onClick={resetCreateForm} className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800">
                    Done
                  </button>
                </div>
              ) : (
                /* Create form */
                <>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Agent name"
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-500"
                  />
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-500"
                  />
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">Provider</label>
                    <select
                      value={newProvider}
                      onChange={(e) => { setNewProvider(e.target.value); setNewProviderConfig({}); }}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-500"
                    >
                      {providersData?.providers.map((p) => (
                        <option key={p.name} value={p.name}>{p.label}</option>
                      )) ?? <option value="http">HTTP Webhook</option>}
                    </select>
                  </div>
                  {currentProvider && currentProvider.configFields.length > 0 && (
                    <ProviderConfigForm
                      fields={currentProvider.configFields}
                      values={newProviderConfig}
                      onChange={setNewProviderConfig}
                    />
                  )}
                  {createBot.isError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      {createBot.error?.message}
                    </p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button onClick={resetCreateForm} className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50">
                      Cancel
                    </button>
                    <button
                      onClick={() => createBot.mutate()}
                      disabled={!newName.trim() || createBot.isPending}
                      className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {createBot.isPending ? "Creating..." : "Create Agent"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
