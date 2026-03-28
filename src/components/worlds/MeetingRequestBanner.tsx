import { AlertCircle, Check, X } from "lucide-react";
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
    <div className="mx-4 my-2 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-red-800 mb-1">Meeting Requested</div>
        <div className="text-sm text-red-700"
          dangerouslySetInnerHTML={{ __html: message.body.replace(/^🤝 \*\*Meeting requested from Worker room\*\*: /, "") }}
        />
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => respond(true)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          Accept
        </button>
        <button
          onClick={() => respond(false)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-white text-red-700 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          Decline
        </button>
      </div>
    </div>
  );
}
