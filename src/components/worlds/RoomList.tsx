import { Link } from "react-router-dom";
import { Plus, Archive, Hash } from "lucide-react";
import type { Room, WorldType } from "../../api/rooms.ts";

const worldConfig: Record<WorldType, { empty: string; createLabel: string }> = {
  higher: {
    empty: "No private rooms yet. Use 'Step Away' in a Middle room to create one.",
    createLabel: "New room",
  },
  middle: {
    empty: "No team rooms yet. Create one to start collaborating.",
    createLabel: "New room",
  },
  worker: {
    empty: "No worker rooms yet. Use 'Send to Work' to dispatch agents here.",
    createLabel: "New room",
  },
};

interface RoomListProps {
  rooms: Room[];
  world: WorldType;
  onCreateRoom?: () => void;
  emptyMessage?: string;
}

export function RoomList({ rooms, world, onCreateRoom, emptyMessage }: RoomListProps) {
  const { empty, createLabel } = worldConfig[world];
  const displayEmpty = emptyMessage ?? empty;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Rooms</span>
        {onCreateRoom && (
          <button
            onClick={onCreateRoom}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {createLabel}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="px-4 py-6 text-sm text-zinc-400 text-center leading-relaxed">{displayEmpty}</div>
        ) : (
          rooms.map((room) => (
            <Link
              key={room.id}
              to={`/rooms/${room.id}`}
              className="flex items-center gap-2.5 px-4 py-2 hover:bg-zinc-50 transition-colors group"
            >
              <Hash className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-700 group-hover:text-zinc-900 truncate transition-colors">{room.name}</div>
                {room.description && (
                  <div className="text-xs text-zinc-400 truncate">{room.description}</div>
                )}
              </div>
              {room.status === "archived" && (
                <Archive className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
