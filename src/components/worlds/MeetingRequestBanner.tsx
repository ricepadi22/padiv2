import { Check, X } from "lucide-react";
import type { Message } from "../../api/messages.ts";
import { transitionsApi } from "../../api/transitions.ts";
import { useState } from "react";

interface MeetingRequestBannerProps {
  message: Message;
  onResponded: () => void;
}

export function MeetingRequestBanner({ message, onResponded }: MeetingRequestBannerProps) {
  const [loading, setLoading] = useState(false);
  const workerRoomId = message.metadata?.workerRoomId as string | undefined;

  if (!workerRoomId) return null;

  async function respond(accept: boolean) {
    setLoading(true);
    try {
      await transitionsApi.meetingRespond(workerRoomId!, accept);
      onResponded();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-4 my-2 flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-amber-800">Meeting requested — </span>
        <span
          className="text-xs text-amber-700"
          dangerouslySetInnerHTML={{ __html: message.body.replace(/^🤝 \*\*Meeting requested from Worker room\*\*: /, "") }}
        />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => respond(true)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3 h-3" />
          Accept
        </button>
        <button
          onClick={() => respond(false)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-white text-zinc-700 border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          <X className="w-3 h-3" />
          Decline
        </button>
      </div>
    </div>
  );
}
