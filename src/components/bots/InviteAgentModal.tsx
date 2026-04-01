import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Bot, Copy, Check, Link as LinkIcon, Loader2 } from "lucide-react";
import { invitesApi } from "../../api/invites.ts";

interface Props {
  roomId: string;
  world?: string;
  roomName?: string;
  padiName?: string;
  onClose: () => void;
}

export function InviteAgentModal({ roomId, roomName, padiName, onClose }: Props) {
  const queryClient = useQueryClient();

  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<Date | null>(null);
  const [inviteStatus, setInviteStatus] = useState<"pending" | "accepted" | "expired">("pending");
  const [timeLeft, setTimeLeft] = useState(0);
  const [tokenCopied, setTokenCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    if (!inviteExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((inviteExpiresAt.getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) setInviteStatus("expired");
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [inviteExpiresAt]);

  // Poll for acceptance
  useEffect(() => {
    if (!inviteToken || inviteStatus !== "pending") return;
    pollRef.current = setInterval(async () => {
      try {
        const result = await invitesApi.checkStatus(inviteToken);
        if (result.status !== "pending") {
          setInviteStatus(result.status as "accepted" | "expired");
          clearInterval(pollRef.current ?? undefined);
          if (result.status === "accepted") {
            void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(pollRef.current ?? undefined);
  }, [inviteToken, inviteStatus, queryClient, roomId]);

  const generateInvite = useMutation({
    mutationFn: () => invitesApi.generate(roomId),
    onSuccess: ({ token, expiresAt }) => {
      setInviteToken(token);
      setInviteExpiresAt(new Date(expiresAt));
      setInviteStatus("pending");
    },
  });

  // Auto-generate on mount
  useEffect(() => {
    generateInvite.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build paste prompt
  const serverUrl = ((import.meta.env.VITE_API_URL as string) || window.location.origin).replace(/\/$/, "");
  const wsUrl = serverUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
  const pastePrompt = inviteToken
    ? `You have been invited to join a Rice Padi room as an AI agent. Complete these steps in a new session called "ricepadi-onboarding".

== ROOM DETAILS ==
Room: "${roomName ?? "this room"}"${padiName ? `\nPadi: ${padiName}` : ""}
Server: ${serverUrl}
Invite token (expires in 10 minutes): ${inviteToken}

== IMPORTANT CONTEXT ==
The REST API and WebSocket push use different field names for the same data. Normalise everything before processing.
- REST API returns {"messages": [...]} — unwrap the array correctly.
- REST field names: id, authorUserId, authorBotId
- WebSocket field names: messageId, authorBotId (no authorUserId field)
- Both share: authorType, authorDisplayName, body, createdAt
- Human messages have authorType === "human" and an authorUserId
- Bot messages have authorType === "bot" and an authorBotId
- Always respond to @YourDisplayName as well as @yourBotName — people may use either

== STEP 1: ACCEPT THE INVITE ==
POST ${serverUrl}/api/invites/accept
Content-Type: application/json

{
  "token": "${inviteToken}",
  "agentName": "<your display name in this room>",
  "provider": "websocket"
}

Save from the response: bot.apiKey, bot.id, roomId.

== STEP 2: CONNECT VIA WEBSOCKET ==
Replace https:// with wss:// in the server URL.

Connect to: ${wsUrl}/bot-ws?botKey={bot.apiKey}

Wait for the connection confirmation:
{"type":"connected","botId":"...","botName":"..."}

The server pushes messages as:
{"type":"message","yourBotId":"...","roomId":"...","roomName":"...","world":"middle","messageId":"...","body":"...","authorDisplayName":"...","authorType":"human","authorBotId":null,"createdAt":"...","mentionedBotIds":["..."]}

IMPORTANT: Only connect to /bot-ws — do NOT also connect to /ws. Dual connections cause a feedback loop where you receive your own replies endlessly.

Keep the connection open. The server sends a ping every 30s — handle it automatically.

== STEP 2b: VERIFY YOUR KEY ==
Confirm your API key is valid and see which rooms you're in:
GET ${serverUrl}/api/bots/me
X-TW-Bot-Key: {bot.apiKey}
→ Returns: { bot: { id, displayName, status }, rooms: [...], online: true/false }

== STEP 3: CATCH UP ON MISSED MESSAGES ==
On first connect, set since to the start of today UTC (00:00) so you don't miss earlier messages from this session.

GET ${serverUrl}/api/rooms/{roomId}/messages?since={since}
X-TW-Bot-Key: {bot.apiKey}

- API returns {"messages": [...]} — unwrap correctly
- Only process messages where authorType === "human"
- Skip messages where authorBotId === bot.id (your own replies)
- Advance lastSeenTimestamp to the newest createdAt seen
- On reconnect, use the advanced timestamp as since

== STEP 4: RESPOND TO @MENTIONS ==
In Middle Ground, respond when:
- @YourDisplayName or @yourBotName appears in the message body (case-insensitive)
- @all appears
In Lower Ground, respond to all human messages.
Never respond when authorType === "bot" or authorBotId === bot.id.

== STEP 5: LLM-POWERED RESPONSES ==
Connect to your local model relay or LLM endpoint to generate replies.
- Maintain a rolling 20-message conversation history so context carries across turns
- Strip the @mention from the message body before sending to the LLM
- Include the sender's display name for context

== STEP 6: SEND REPLIES ==
POST ${serverUrl}/api/rooms/{roomId}/messages
X-TW-Bot-Key: {bot.apiKey}
Content-Type: application/json

{"body": "<your response>"}

Optionally, after sending a reply, acknowledge receipt on the bot-ws connection:
{"type": "ack", "messageId": "{messageId from the received event}"}
This updates the server dispatch log from "delivered" to "acknowledged".

== STEP 7: KEEP RUNNING ==
- Keep WebSocket open at all times
- If disconnected, reconnect immediately using the same botKey and re-run catch-up
- Use a venv if system Python is externally managed:
  python3 -m venv venv && venv/bin/pip install websocket-client requests
- Run with python -u (unbuffered) so logs flush in real time

Please confirm you understand, then begin the onboarding session.`
    : "";

  // Auto-copy when prompt is ready
  useEffect(() => {
    if (pastePrompt) {
      void navigator.clipboard.writeText(pastePrompt).catch(() => {});
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 3000);
    }
  }, [pastePrompt]);

  function copyPrompt() {
    void navigator.clipboard.writeText(pastePrompt);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  }

  function regenerate() {
    setInviteToken(null);
    setInviteExpiresAt(null);
    setInviteStatus("pending");
    generateInvite.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-zinc-900">Invite OpenClaw Agent</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {inviteStatus === "accepted" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium text-emerald-800">Agent joined successfully!</span>
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
              <p className="text-sm text-zinc-500 text-center py-2">Token expired.</p>
              <button
                onClick={regenerate}
                className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Generate New Token
              </button>
            </div>

          ) : generateInvite.isPending || !inviteToken ? (
            <div className="flex items-center justify-center py-10 gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating invite…
            </div>

          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-700">Paste to your OpenClaw agent</span>
                </div>
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                </span>
              </div>
              <textarea
                readOnly
                value={pastePrompt}
                rows={16}
                className="w-full text-[11px] font-mono text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none leading-relaxed"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
              <button
                onClick={copyPrompt}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
              >
                {tokenCopied
                  ? <><Check className="w-3.5 h-3.5" /> Copied!</>
                  : <><Copy className="w-3.5 h-3.5" /> Copy Invite Prompt</>}
              </button>
              <p className="text-[10px] text-zinc-400 text-center">Auto-copied on open · paste this to your OpenClaw chat (Telegram etc.)</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
