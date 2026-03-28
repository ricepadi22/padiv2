import type { Message } from "../../api/messages.ts";
import { AvatarDisplay } from "./AvatarDisplay.tsx";

interface MessageBubbleProps {
  message: Message;
  authorName: string;
  avatarUrl?: string;
}

const systemBg: Record<string, string> = {
  step_away: "bg-amber-50 border-amber-200 text-amber-800",
  return: "bg-green-50 border-green-200 text-green-800",
  dispatch: "bg-blue-50 border-blue-200 text-blue-800",
  meeting_request: "bg-red-50 border-red-200 text-red-800",
};

export function MessageBubble({ message, authorName, avatarUrl }: MessageBubbleProps) {
  if (message.authorType === "system") {
    const style = systemBg[message.messageType] ?? "bg-gray-50 border-gray-200 text-gray-700";
    return (
      <div className={`mx-4 my-1 px-4 py-2 rounded-lg border text-sm ${style}`}>
        <span dangerouslySetInnerHTML={{ __html: simpleMarkdown(message.body) }} />
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-4 py-2 hover:bg-gray-50 group">
      <div className="shrink-0 mt-0.5">
        <AvatarDisplay
          displayName={authorName}
          avatarUrl={avatarUrl}
          authorType={message.authorType}
          size="md"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 mb-0.5">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {message.editedAt && <span className="ml-1 italic">(edited)</span>}
        </div>
        <div
          className="text-sm text-gray-800 leading-relaxed break-words prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: simpleMarkdown(message.body) }}
        />
      </div>
    </div>
  );
}

// Very basic markdown: bold, italic, code
function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code class='bg-gray-100 px-1 rounded text-xs font-mono'>$1</code>")
    .replace(/\n/g, "<br />");
}
