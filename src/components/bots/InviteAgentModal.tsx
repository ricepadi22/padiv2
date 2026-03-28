import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Bot, Copy, Check } from "lucide-react";
import { botsApi, type Bot as BotType } from "../../api/bots.ts";
import { ProviderConfigForm } from "./ProviderConfigForm.tsx";

interface Props {
  roomId: string;
  onClose: () => void;
}

type Step = "pick" | "done";

export function InviteAgentModal({ roomId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("pick");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const [newDisplayName, setNewDisplayName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("http");
  const [providerConfigValues, setProviderConfigValues] = useState<Record<string, unknown>>({});

  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: botsData } = useQuery({ queryKey: ["bots"], queryFn: () => botsApi.list() });
  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => botsApi.listProviders(),
    enabled: isCreatingNew,
  });

  const currentProvider = providersData?.providers.find((p) => p.name === selectedProvider);

  const createAndInvite = useMutation({
    mutationFn: async () => {
      const { bot, apiKey } = await botsApi.create({
        name: newDisplayName.toLowerCase().replace(/\s+/g, "_"),
        displayName: newDisplayName,
        description: newDescription,
        provider: selectedProvider,
        providerConfig: providerConfigValues,
      });
      await botsApi.inviteToRoom(roomId, bot.id);
      return { bot, apiKey };
    },
    onSuccess: ({ apiKey }) => {
      setCreatedApiKey(apiKey);
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
      void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
    },
  });

  const inviteExisting = useMutation({
    mutationFn: (botId: string) => botsApi.inviteToRoom(roomId, botId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
      onClose();
    },
  });

  function copyKey() {
    if (createdApiKey) {
      void navigator.clipboard.writeText(createdApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const existingBots = botsData?.bots ?? [];
  const canSubmitNew = newDisplayName.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-zinc-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-900">Invite Agent</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {step === "pick" && (
            <div className="space-y-4">
              {existingBots.length > 0 && !isCreatingNew && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-2">Existing agents</p>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {existingBots.map((bot: BotType) => (
                      <button
                        key={bot.id}
                        onClick={() => setSelectedBotId(bot.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                          selectedBotId === bot.id
                            ? "bg-zinc-900 text-white"
                            : "hover:bg-zinc-50 border border-zinc-200"
                        }`}
                      >
                        <div>
                          <div className={`font-medium text-sm ${selectedBotId === bot.id ? "text-white" : "text-zinc-900"}`}>
                            {bot.displayName}
                          </div>
                          <div className={`text-xs ${selectedBotId === bot.id ? "text-zinc-400" : "text-zinc-400"}`}>
                            {bot.provider} · {bot.apiKeyPrefix}…
                          </div>
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                          selectedBotId === bot.id
                            ? "bg-white/20 text-white"
                            : bot.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}>{bot.status}</span>
                      </button>
                    ))}
                  </div>
                  {selectedBotId && (
                    <button
                      onClick={() => inviteExisting.mutate(selectedBotId)}
                      disabled={inviteExisting.isPending}
                      className="w-full mt-3 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                    >
                      {inviteExisting.isPending ? "Inviting..." : "Invite to Room"}
                    </button>
                  )}
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-2 bg-white text-xs text-zinc-400">or</span>
                    </div>
                  </div>
                </div>
              )}

              {!isCreatingNew ? (
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="w-full py-2.5 border-2 border-dashed border-zinc-300 text-sm text-zinc-500 rounded-xl hover:border-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  + New agent
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-zinc-500">New agent</p>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Display name"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                  />
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">Provider</label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => { setSelectedProvider(e.target.value); setProviderConfigValues({}); }}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                    >
                      {providersData?.providers.map((p) => (
                        <option key={p.name} value={p.name}>{p.label}</option>
                      )) ?? <option value="http">HTTP Webhook</option>}
                    </select>
                  </div>
                  {currentProvider && currentProvider.configFields.length > 0 && (
                    <ProviderConfigForm
                      fields={currentProvider.configFields}
                      values={providerConfigValues}
                      onChange={setProviderConfigValues}
                    />
                  )}
                  {createAndInvite.isError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      {createAndInvite.error?.message}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setIsCreatingNew(false)}
                      className="flex-1 py-2.5 text-sm text-zinc-600 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => createAndInvite.mutate()}
                      disabled={!canSubmitNew || createAndInvite.isPending}
                      className="flex-1 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                    >
                      {createAndInvite.isPending ? "Creating..." : "Create & Invite"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "done" && createdApiKey && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <span className="text-sm font-medium text-zinc-900">Agent created and invited</span>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-700 mb-2">
                  API Key — save it now, won't be shown again
                </p>
                <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-xs font-mono text-zinc-700 truncate">{createdApiKey}</code>
                  <button onClick={copyKey} className="shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  Send requests with <code className="bg-zinc-100 px-1 rounded">X-TW-Bot-Key: {createdApiKey.slice(0, 16)}…</code>
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
