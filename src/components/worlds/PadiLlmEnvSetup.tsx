import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Zap, Trash2, Bot, Sparkles } from "lucide-react";
import { padisApi } from "../../api/padis.ts";
import { invitesApi } from "../../api/invites.ts";

interface Props {
  padiId: string;
  padiName: string;
  currentUserId: string;
  myMembershipId: string | undefined;
  isOwner: boolean;
}

export function PadiLlmEnvSetup({ padiId, padiName, isOwner }: Props) {
  const queryClient = useQueryClient();

  // ── LLM ENV ──────────────────────────────────────────────────────────────────
  const { data: llmData, isLoading: llmLoading } = useQuery({
    queryKey: ["padi-llm-env", padiId],
    queryFn: () => padisApi.getLlmEnv(padiId),
  });

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [llmError, setLlmError] = useState("");
  const [llmSaved, setLlmSaved] = useState(false);
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);

  const setLlmEnv = useMutation({
    mutationFn: () => padisApi.setLlmEnv(padiId, {
      type: "api_key",
      config: { apiKey, model },
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["padi-llm-env", padiId] });
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
      setLlmSaved(true);
      setTimeout(() => setLlmSaved(false), 2000);
      setApiKey("");
    },
    onError: (e: Error) => setLlmError(e.message),
  });

  const clearLlmEnv = useMutation({
    mutationFn: () => padisApi.clearLlmEnv(padiId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["padi-llm-env", padiId] });
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
    },
  });

  const useSubscription = useMutation({
    mutationFn: () => padisApi.useSubscription(padiId, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["padi-llm-env", padiId] });
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
      setLlmSaved(true);
      setTimeout(() => setLlmSaved(false), 2000);
    },
    onError: (e: Error) => setLlmError(e.message),
  });

  // ── PERSONAL BOT INVITE ───────────────────────────────────────────────────────
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<Date | null>(null);
  const [inviteStatus, setInviteStatus] = useState<"pending" | "accepted" | "expired">("pending");
  const [timeLeft, setTimeLeft] = useState(0);
  const [tokenCopied, setTokenCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateInvite = useMutation({
    mutationFn: () => padisApi.generatePersonalBotInvite(padiId),
    onSuccess: ({ token, expiresAt }) => {
      setInviteToken(token);
      setInviteExpiresAt(new Date(expiresAt));
      setInviteStatus("pending");
      const secs = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setTimeLeft(secs);
    },
  });

  // Countdown
  useEffect(() => {
    if (!inviteToken || inviteStatus !== "pending") return;
    countdownRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current!);
  }, [inviteToken, inviteStatus]);

  // Poll for acceptance
  useEffect(() => {
    if (!inviteToken || inviteStatus !== "pending") return;
    pollRef.current = setInterval(async () => {
      try {
        const result = await invitesApi.checkStatus(inviteToken);
        if (result.status !== "pending") {
          clearInterval(pollRef.current!);
          setInviteStatus(result.status as "accepted" | "expired");
          void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(pollRef.current!);
  }, [inviteToken, inviteStatus, padiId, queryClient]);

  const serverUrl = ((import.meta.env.VITE_API_URL as string) || window.location.origin).replace(/\/$/, "");
  const pastePrompt = inviteToken
    ? `You have been invited to join the "${padiName}" padi as a personal AI agent. Follow these instructions exactly in a new session called "ricepadi-padi-onboarding".

== PADI DETAILS ==
Padi: "${padiName}"
Server: ${serverUrl}
Invite token (expires in 10 minutes): ${inviteToken}

== STEP 1: ACCEPT THE PADI INVITE ==
Make this HTTP request to register yourself and link to this padi:

POST ${serverUrl}/api/invites/accept
Content-Type: application/json

{
  "token": "${inviteToken}",
  "agentName": "<choose a short display name for yourself>",
  "provider": "openclaw_gateway",
  "providerConfig": {
    "gatewayUrl": "<your OpenClaw gateway ws:// or wss:// URL>",
    "agentId": "<your OpenClaw agent identifier>",
    "apiKey": "<your gateway auth token from ~/.openclaw/openclaw.json>"
  }
}

The response will contain:
- "apiKey": your permanent bot API key
- "padiId": the padi you are now linked to
- "botId": your bot identifier

Save these — you will need them to participate in rooms.

== STEP 2: JOINING ROOMS ==
You are now linked as the personal agent for this padi. You will be invited into individual collaboration rooms by the padi owner. When that happens, you will receive a separate room invite prompt.

== STEP 3: OPERATION IN ROOMS (when invited) ==
Once in a room, poll for messages every few seconds:

GET ${serverUrl}/api/rooms/{roomId}/messages?since={lastTimestamp}
X-TW-Bot-Key: {apiKey}

Only respond when a message contains @{yourAgentName} or @all.
Send replies via:

POST ${serverUrl}/api/rooms/{roomId}/messages
X-TW-Bot-Key: {apiKey}
Content-Type: application/json

{
  "body": "<your response>"
}

Please confirm you understand, then proceed to accept the invite.`
    : "";

  const copyToken = () => {
    if (!pastePrompt) return;
    void navigator.clipboard.writeText(pastePrompt);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 1500);
  };

  // Auto-copy when prompt is ready
  useEffect(() => {
    if (pastePrompt) {
      void navigator.clipboard.writeText(pastePrompt).catch(() => {});
    }
  }, [pastePrompt]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const llmEnv = llmData?.llmEnvironment;

  return (
    <div className="space-y-6">
      {/* ── LLM Environment section ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-widest">LLM Environment</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          All worker bots spawned in <strong>{padiName}</strong> will use this LLM environment.
          The AI host and any autonomous agents inherit these credentials.
        </p>

        {llmLoading ? (
          <div className="text-xs text-zinc-400">Loading...</div>
        ) : llmEnv ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">
                  {llmEnv.type === "subscription"
                    ? "Claude.ai subscription"
                    : llmEnv.type === "oauth"
                    ? "Claude.ai OAuth connected"
                    : "API key configured"}
                </span>
              </div>
              {llmEnv.type === "api_key" && llmEnv.config.apiKey && (
                <p className="text-xs text-emerald-600">Key: {llmEnv.config.apiKey}</p>
              )}
              {llmEnv.config.model && (
                <p className="text-xs text-zinc-500">Model: {llmEnv.config.model}</p>
              )}
            </div>
            {isOwner && (
              <button
                onClick={() => { if (confirm("Remove LLM environment? Worker bots will stop functioning.")) clearLlmEnv.mutate(); }}
                className="text-zinc-300 hover:text-red-500 transition-colors shrink-0"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          isOwner ? (
            <div className="space-y-2">
              {/* Primary: use server's Claude.ai subscription */}
              {!showApiKeyForm && (
                <>
                  <button
                    onClick={() => { setLlmError(""); useSubscription.mutate(); }}
                    disabled={useSubscription.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 text-white rounded-lg text-xs font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {llmSaved ? "Connected!" : useSubscription.isPending ? "Connecting…" : "Use Claude.ai Subscription"}
                  </button>
                  <button
                    onClick={() => setShowApiKeyForm(true)}
                    className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    Use API key instead →
                  </button>
                </>
              )}
              {/* Fallback: API key */}
              {showApiKeyForm && (
                <>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                  />
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fast)</option>
                    <option value="claude-sonnet-4-6">claude-sonnet-4-6 (balanced)</option>
                    <option value="claude-opus-4-6">claude-opus-4-6 (powerful)</option>
                  </select>
                  <button
                    onClick={() => { setLlmError(""); setLlmEnv.mutate(); }}
                    disabled={!apiKey.trim() || setLlmEnv.isPending}
                    className="w-full py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {llmSaved ? "Saved!" : setLlmEnv.isPending ? "Saving..." : "Save API Key"}
                  </button>
                  <button
                    onClick={() => setShowApiKeyForm(false)}
                    className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    ← Back
                  </button>
                </>
              )}
              {llmError && <p className="text-xs text-red-500">{llmError}</p>}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-400">
              No LLM environment set. Ask the padi owner to configure one.
            </div>
          )
        )}
      </div>

      {/* ── Personal Bot (OpenClaw) section ── */}
      <div className="border-t border-zinc-100 pt-5">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-green-600" />
          <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-widest">Your Personal Agent</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Invite your OpenClaw bot into this padi. It will represent you in Middle World collaboration rooms and can direct worker bots.
        </p>

        {!inviteToken ? (
          <button
            onClick={() => generateInvite.mutate()}
            disabled={generateInvite.isPending}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Bot className="w-3.5 h-3.5" />
            {generateInvite.isPending ? "Generating..." : "Generate Invite Token"}
          </button>
        ) : inviteStatus === "accepted" ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700 font-medium">Personal bot linked to this padi!</p>
          </div>
        ) : inviteStatus === "expired" ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">Token expired.</p>
            <button
              onClick={() => { setInviteToken(null); setInviteExpiresAt(null); }}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium"
            >
              Generate new token
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                Waiting for bot · {formatTime(timeLeft)}
              </div>
            </div>
            <textarea
              readOnly
              value={pastePrompt}
              rows={14}
              className="w-full text-[11px] font-mono text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none leading-relaxed"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <button
              onClick={copyToken}
              className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-900 text-white text-xs font-medium rounded-lg hover:bg-zinc-800 transition-colors"
            >
              {tokenCopied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Invite Prompt</>}
            </button>
            <p className="text-[10px] text-zinc-400 text-center">Auto-copied on open · paste to your OpenClaw chat</p>
          </div>
        )}
      </div>
    </div>
  );
}
