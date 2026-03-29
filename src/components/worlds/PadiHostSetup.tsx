import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, Trash2, Zap, Info } from "lucide-react";
import { padisApi, type PadiHostBot } from "../../api/padis.ts";

interface PadiHostSetupProps {
  padiId: string;
  padiName: string;
  hostBot: PadiHostBot | null;
  isOwner: boolean;
}

export function PadiHostSetup({ padiId, padiName, hostBot, isOwner }: PadiHostSetupProps) {
  const queryClient = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createHost = useMutation({
    mutationFn: () =>
      padisApi.createHost(padiId, {
        displayName,
        systemPrompt: systemPrompt.trim() || undefined,
      }),
    onSuccess: (data) => {
      setCreatedKey(data.bot.apiKey);
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
    },
  });

  const removeHost = useMutation({
    mutationFn: () => padisApi.removeHost(padiId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: (status: "active" | "paused") => padisApi.updateHost(padiId, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["padi", padiId] }),
  });

  function copyKey() {
    if (createdKey) {
      void navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function resetSetup() {
    setShowSetup(false);
    setDisplayName("");
    setSystemPrompt("");
    setCreatedKey(null);
  }

  if (!hostBot && !showSetup) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            The AI host uses your padi's LLM environment (set in the <strong>LLM tab</strong>). Configure that first, then create the host here.
          </p>
        </div>
        <div className="border border-dashed border-zinc-300 rounded-xl p-6 text-center">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Bot className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-sm font-medium text-zinc-800">No AI host yet</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
            An AI host joins all padi rooms, spawns worker bots, and helps coordinate tasks autonomously.
          </p>
          {isOwner && (
            <button
              onClick={() => setShowSetup(true)}
              className="mt-4 text-xs font-medium px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              Set up AI Host
            </button>
          )}
        </div>
      </div>
    );
  }

  if (showSetup && !createdKey) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
          <Zap className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800">
            The host will join all existing rooms in <strong>{padiName}</strong> and auto-join future ones. It uses the padi's LLM environment.
          </p>
        </div>
        <input
          autoFocus
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Host name (e.g. Padi Guide, Auto)"
          className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
        />
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="System prompt (optional — leave blank for default)"
          rows={3}
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
        />
        {createHost.isError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{createHost.error?.message}</p>
        )}
        <div className="flex gap-2">
          <button onClick={resetSetup} className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50">
            Cancel
          </button>
          <button
            onClick={() => createHost.mutate()}
            disabled={!displayName.trim() || createHost.isPending}
            className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {createHost.isPending ? "Creating..." : "Create Host"}
          </button>
        </div>
      </div>
    );
  }

  if (showSetup && createdKey) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-emerald-700" />
          </div>
          <span className="text-sm font-medium text-zinc-900">AI host created!</span>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-700 mb-2">API Key — save it now, won't be shown again</p>
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5">
            <code className="flex-1 text-xs font-mono text-zinc-700 break-all">{createdKey}</code>
            <button onClick={copyKey} className="shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <button onClick={resetSetup} className="w-full py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800">
          Done
        </button>
      </div>
    );
  }

  // Host exists — status card
  if (hostBot) {
    return (
      <div className="space-y-3">
        <div className="border border-zinc-200 rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                <Bot className="w-4 h-4 text-amber-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900">{hostBot.displayName}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${hostBot.status === "active" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                  <span className="text-xs text-zinc-400">{hostBot.status} · padi_lm</span>
                </div>
              </div>
            </div>
            {isOwner && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleStatus.mutate(hostBot.status === "active" ? "paused" : "active")}
                  disabled={toggleStatus.isPending}
                  className="text-xs px-2.5 py-1.5 border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {hostBot.status === "active" ? "Pause" : "Activate"}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remove ${hostBot.displayName} as AI host?`)) removeHost.mutate();
                  }}
                  disabled={removeHost.isPending}
                  className="text-zinc-400 hover:text-red-600 transition-colors disabled:opacity-50 p-1.5"
                  title="Remove host"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-400">
          Powered by the padi's LLM environment. Autonomously spawns worker bots and coordinates tasks.
        </p>
      </div>
    );
  }

  return null;
}
