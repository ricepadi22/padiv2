import { Link, useParams } from "react-router-dom";
import { Shield, MessageSquare, Hammer } from "lucide-react";

const worlds = [
  { id: "higher", label: "Higher", icon: Shield, activeClass: "text-amber-600 border-amber-400" },
  { id: "middle", label: "Middle", icon: MessageSquare, activeClass: "text-green-600 border-green-400" },
  { id: "worker", label: "Worker", icon: Hammer, activeClass: "text-blue-600 border-blue-400" },
] as const;

interface WorldNavProps {
  roomCounts?: Record<string, number>;
  meetingRequestCount?: number;
}

export function WorldNav({ roomCounts, meetingRequestCount }: WorldNavProps) {
  const { world: activeWorld } = useParams<{ world: string }>();

  return (
    <div className="flex items-center gap-1 px-4 border-b border-zinc-200 bg-white">
      {worlds.map(({ id, label, icon: Icon, activeClass }) => {
        const isActive = activeWorld === id || (!activeWorld && id === "middle");
        const count = roomCounts?.[id] ?? 0;
        const hasMeetingRequest = id === "middle" && (meetingRequestCount ?? 0) > 0;

        return (
          <Link
            key={id}
            to={`/worlds/${id}`}
            className={`flex items-center gap-2 px-3 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? `${activeClass}`
                : "text-zinc-500 border-transparent hover:text-zinc-800"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                isActive ? "bg-zinc-100 text-zinc-600" : "bg-zinc-100 text-zinc-500"
              }`}>
                {count}
              </span>
            )}
            {hasMeetingRequest && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
