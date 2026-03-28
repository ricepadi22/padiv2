import { Link, useParams } from "react-router-dom";
import { Shield, MessageSquare, Hammer } from "lucide-react";

const worlds = [
  { id: "higher", label: "Higher World", icon: Shield, description: "Private leadership space", color: "text-amber-600 bg-amber-50" },
  { id: "middle", label: "Middle World", icon: MessageSquare, description: "Shared team space", color: "text-blue-600 bg-blue-50" },
  { id: "worker", label: "Worker World", icon: Hammer, description: "Agent execution space", color: "text-purple-600 bg-purple-50" },
] as const;

interface WorldNavProps {
  roomCounts?: Record<string, number>;
  meetingRequestCount?: number;
}

export function WorldNav({ roomCounts, meetingRequestCount }: WorldNavProps) {
  const { world: activeWorld } = useParams<{ world: string }>();

  return (
    <div className="flex gap-2 px-4 py-3 border-b border-gray-200 bg-white">
      {worlds.map(({ id, label, icon: Icon, color }) => {
        const isActive = activeWorld === id || (!activeWorld && id === "middle");
        const count = roomCounts?.[id] ?? 0;
        const hasMeetingRequest = id === "middle" && (meetingRequestCount ?? 0) > 0;

        return (
          <Link
            key={id}
            to={`/worlds/${id}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              isActive ? `${color} shadow-sm` : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/60" : "bg-gray-200"}`}>
                {count}
              </span>
            )}
            {hasMeetingRequest && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Meeting requested" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
