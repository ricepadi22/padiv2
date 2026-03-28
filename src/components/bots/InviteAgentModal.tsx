import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Bot, ChevronRight, Copy, Check } from "lucide-react";
import { botsApi, type Bot as BotType } from "../../api/bots.ts";
import { ProviderConfigForm } from "./ProviderConfigForm.tsx";

interface Props {
  roomId: string;
  onClose: () => void;
}

type Step = "pick" | "configure" | "done";

export function InviteAgentModal({ roomId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("pick");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // New bot form state
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("http");
  const [providerConfigValues, setProviderConfigValues] = useState<Record<string, unknown>>({});

  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: botsData } = useQuery({
    queryKey: ["bots"],
    queryFn: () => botsApi.list(),
  });

  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => botsApi.listProviders(),
    enabled: isCreatingNew,
  });

  const currentProvider = providersData?.providers.find((p) => p.name === selectedProvider);

  const createAndInvite = useMutation({
    mutationFn: async () => {
      const { bot, apiKey } = await botsApi.create({
        name: newName.toLowerCase().replace(/\s+/g, "_"),
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
  const canSubmitNew = newName.trim().length > 0 && newDisplayName.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Invite Agent</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Step: Pick */}
          {step === "pick" && (
            <div className="space-y-3">
              {/* Existing bots */}
              {existingBots.length > 0 && !isCreatingNew && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Your agents</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {existingBots.map((bot: BotType) => (
                      <button
                        key={bot.id}
                        onClick={() => setSelectedBotId(bot.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                          selectedBotId === bot.id
                            ? "bg-blue-50 border border-blue-200"
                            : "hover:bg-gray-50 border border-transparent"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">{bot.displayName}</div>
                          <div className="text-xs text-gray-400">{bot.provider} · {bot.apiKeyPrefix}…</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          bot.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>{bot.status}</span>
                      </button>
                    ))}
                  </div>
                  {selectedBotId && (
                    <button
                      onClick={() => inviteExisting.mutate(selectedBotId)}
                      disabled={inviteExisting.isPending}
                      className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {inviteExisting.isPending ? "Inviting..." : "Invite to Room"}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                    <div className="relative flex justify-center"><span className="px-2 bg-white text-xs text-gray-400">or</span></div>
                  </div>
                </div>
              )}

              {/* New agent button */}
              {!isCreatingNew ? (
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-600 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  New Agent
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-500">New agent details</p>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Display name"
                    value={newDisplayName}
                    onChange={(e) => {
                      setNewDisplayName(e.target.value);
                      if (!newName) setNewName(e.target.value.toLowerCase().replace(/\s+/g, "_"));
                    }}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => { setSelectedProvider(e.target.value); setProviderConfigValues({}); }}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <p className="text-xs text-red-600">{createAndInvite.error?.message}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsCreatingNew(false)}
                      className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => createAndInvite.mutate()}
                      disabled={!canSubmitNew || createAndInvite.isPending}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {createAndInvite.isPending ? "Creating..." : "Create & Invite"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && createdApiKey && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700">
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">Agent created and invited!</span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1.5">API Key — copy it now, won't be shown again</p>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <code className="flex-1 text-xs font-mono text-gray-800 truncate">{createdApiKey}</code>
                  <button onClick={copyKey} className="shrink-0 text-gray-400 hover:text-gray-700">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Your bot uses this key via the <code className="bg-gray-100 px-1 rounded">X-TW-Bot-Key</code> header to post messages.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
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
