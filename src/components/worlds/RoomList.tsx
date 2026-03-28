import { Link } from "react-router-dom";
import { Plus, Archive } from "lucide-react";
import type { Room, WorldType } from "../../api/rooms.ts";

const worldLabels: Record<WorldType, { empty: string; createLabel: string }> = {
  higher: {
    empty: "No private rooms yet. Use 'Step Away' in Middle World to create one.",
    createLabel: "New Private Room",
  },
  middle: {
    empty: "No team rooms yet. Create one to start collaborating.",
    createLabel: "New Team Room",
  },
  worker: {
    empty: "No worker rooms yet. Use 'Send to Work' in Middle World to dispatch agents.",
    createLabel: "New Worker Room",
  },
};

interface RoomListProps {
  rooms: Room[];
  world: WorldType;
  onCreateRoom?: () => void;
}

export function RoomList({ rooms, world, onCreateRoom }: RoomListProps) {
  const { empty, createLabel } = worldLabels[world];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Rooms</span>
        {onCreateRoom && (
          <button
            onClick={onCreateRoom}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            {createLabel}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">{empty}</div>
        ) : (
          rooms.map((room) => (
            <Link
              key={room.id}
              to={`/rooms/${room.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{room.name}</div>
                {room.description && (
                  <div className="text-xs text-gray-500 truncate">{room.description}</div>
                )}
              </div>
              {room.status === "archived" && (
                <Archive className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
