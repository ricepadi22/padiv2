import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Bot, Copy, Check, Link as LinkIcon, Loader2 } from "lucide-react";
import { botsApi, type Bot as BotType } from "../../api/bots.ts";
import { invitesApi } from "../../api/invites.ts";
import { ProviderConfigForm } from "./ProviderConfigForm.tsx";

interface Props {
  roomId: string;
  world?: string;
  onClose: () => void;
}

type Step = "pick" | "done" | "token";
type Tab = "existing" | "new" | "openclaw";

export function InviteAgentModal({ roomId, world, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("pick");
  const [tab, setTab] = useState<Tab>("existing");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  const [newDisplayName, setNewDisplayName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("http");
  const [providerConfigValues, setProviderConfigValues] = useState<Record<string, unknown>>({});

  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // OpenClaw invite token state
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<Date | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string>("pending");
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [tokenCopied, setTokenCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: botsData } = useQuery({ queryKey: ["bots"], queryFn: () => botsApi.list() });
  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => botsApi.listProviders(),
    enabled: tab === "new",
  });

  const currentProvider = providersData?.providers.find((p) => p.name === selectedProvider);

  // Countdown timer for invite token
  useEffect(() => {
    if (!inviteExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((inviteExpiresAt.getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setInviteStatus("expired");
        clearInterval(pollRef.current ?? undefined);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [inviteExpiresAt]);

  // Poll invite status
  useEffect(() => {
    if (!inviteToken || inviteStatus !== "pending") return;
    pollRef.current = setInterval(async () => {
      try {
        const result = await invitesApi.checkStatus(inviteToken);
        if (result.status !== "pending") {
          setInviteStatus(result.status);
          clearInterval(pollRef.current ?? undefined);
          if (result.status === "accepted") {
            void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
          }
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(pollRef.current ?? undefined);
  }, [inviteToken, inviteStatus, queryClient, roomId]);

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

  const generateInvite = useMutation({
    mutationFn: () => invitesApi.generate(roomId),
    onSuccess: ({ token, expiresAt }) => {
      setInviteToken(token);
      setInviteExpiresAt(new Date(expiresAt));
      setInviteStatus("pending");
      setStep("token");
    },
  });

  function copyKey() {
    if (createdApiKey) {
      void navigator.clipboard.writeText(createdApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function copyToken() {
    if (inviteToken) {
      void navigator.clipboard.writeText(inviteToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }

  const existingBots = botsData?.bots ?? [];
  const canSubmitNew = newDisplayName.trim().length > 0;
  const showOpenClaw = world === "middle";

  const tabs: { id: Tab; label: string }[] = [
    { id: "existing", label: "Existing" },
    { id: "new", label: "New Agent" },
    ...(showOpenClaw ? [{ id: "openclaw" as Tab, label: "OpenClaw" }] : []),
  ];

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

        {step === "pick" && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-zinc-100">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                    tab === id
                      ? "text-zinc-900 border-b-2 border-zinc-900"
                      : "text-zinc-400 hover:text-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="px-5 py-4">
              {/* Existing bots tab */}
              {tab === "existing" && (
                <div className="space-y-3">
                  {existingBots.length === 0 ? (
                    <p className="text-sm text-zinc-400 text-center py-4">No agents yet. Create one first.</p>
                  ) : (
                    <>
                      <div className="space-y-1 max-h-52 overflow-y-auto">
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
                              <div className="text-xs text-zinc-400">{bot.provider} · {bot.apiKeyPrefix}…</div>
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
                          className="w-full py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                        >
                          {inviteExisting.isPending ? "Inviting..." : "Invite to Room"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* New agent tab */}
              {tab === "new" && (
                <div className="space-y-3">
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
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
                  <button
                    onClick={() => createAndInvite.mutate()}
                    disabled={!canSubmitNew || createAndInvite.isPending}
                    className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {createAndInvite.isPending ? "Creating..." : "Create & Invite"}
                  </button>
                </div>
              )}

              {/* OpenClaw invite tab */}
              {tab === "openclaw" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
                    <LinkIcon className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Invite via Token</p>
                      <p className="text-xs text-green-700 mt-0.5">
                        Generate a one-time token your OpenClaw agent can use to join this room directly.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => generateInvite.mutate()}
                    disabled={generateInvite.isPending}
                    className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {generateInvite.isPending ? "Generating..." : "Generate Invite Token"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Token display step */}
        {step === "token" && inviteToken && (
          <div className="px-5 py-4 space-y-4">
            {inviteStatus === "accepted" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-green-700" />
                  </div>
                  <span className="text-sm font-medium text-zinc-900">Agent joined successfully!</span>
                </div>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : inviteStatus === "expired" ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-500 text-center py-2">Token expired. Generate a new one.</p>
                <button
                  onClick={() => { setStep("pick"); setInviteToken(null); }}
                  className="w-full py-2.5 border border-zinc-300 text-zinc-700 text-sm rounded-lg hover:bg-zinc-50"
                >
                  Back
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-zinc-700">Invite Token</p>
                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Waiting · {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-xs font-mono text-zinc-700 break-all">{inviteToken}</code>
                  <button onClick={copyToken} className="shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors">
                    {tokenCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-zinc-400">
                  Your OpenClaw agent can accept this via:{" "}
                  <code className="bg-zinc-100 px-1 rounded">POST /api/invites/accept</code>
                  {" "}with the token and agent name.
                </p>
                <button
                  onClick={() => { setStep("pick"); setInviteToken(null); clearInterval(pollRef.current ?? undefined); }}
                  className="w-full py-2 border border-zinc-300 text-zinc-700 text-sm rounded-lg hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Created API key step */}
        {step === "done" && createdApiKey && (
          <div className="px-5 py-4 space-y-4">
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
  );
}
