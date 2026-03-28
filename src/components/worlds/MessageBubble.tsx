import type { Message } from "../../api/messages.ts";
import { AvatarDisplay } from "./AvatarDisplay.tsx";

interface MessageBubbleProps {
  message: Message;
  authorName: string;
  avatarUrl?: string;
}

const systemStyles: Record<string, string> = {
  step_away: "bg-amber-50 border-amber-200 text-amber-800",
  return: "bg-emerald-50 border-emerald-200 text-emerald-800",
  dispatch: "bg-blue-50 border-blue-200 text-blue-800",
  meeting_request: "bg-red-50 border-red-200 text-red-800",
};

export function MessageBubble({ message, authorName, avatarUrl }: MessageBubbleProps) {
  if (message.authorType === "system") {
    const style = systemStyles[message.messageType] ?? "bg-zinc-50 border-zinc-200 text-zinc-600";
    return (
      <div className={`mx-4 my-1.5 px-3 py-2 rounded-lg border text-xs ${style}`}>
        <span dangerouslySetInnerHTML={{ __html: simpleMarkdown(message.body) }} />
      </div>
    );
  }

  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex gap-3 px-4 py-1.5 hover:bg-zinc-50/60 group transition-colors">
      <div className="shrink-0 mt-0.5">
        <AvatarDisplay
          displayName={authorName}
          avatarUrl={avatarUrl}
          authorType={message.authorType}
          size="sm"
        />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-zinc-900">{authorName}</span>
          <span className="text-[11px] text-zinc-400">{time}</span>
          {message.editedAt && <span className="text-[11px] text-zinc-400 italic">edited</span>}
        </div>
        <div
          className="text-sm text-zinc-700 leading-relaxed break-words"
          dangerouslySetInnerHTML={{ __html: simpleMarkdown(message.body) }}
        />
      </div>
    </div>
  );
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code class='bg-zinc-100 px-1 rounded text-xs font-mono text-zinc-700'>$1</code>")
    .replace(/\n/g, "<br />");
}
