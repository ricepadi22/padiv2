import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roomsApi, type WorldType } from "../api/rooms.ts";
import { WorldNav } from "../components/worlds/WorldNav.tsx";
import { RoomList } from "../components/worlds/RoomList.tsx";
import { PadiList } from "../components/worlds/PadiList.tsx";

export function WorldsPage() {
  const { world = "middle" } = useParams<{ world?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [selectedPadiId, setSelectedPadiId] = useState<string | null>(null);

  const currentWorld = world as WorldType;

  const { data, isLoading } = useQuery({
    queryKey: ["rooms", currentWorld, selectedPadiId],
    queryFn: () => {
      if (currentWorld === "higher" && selectedPadiId) {
        // Fetch rooms for the selected padi
        return roomsApi.list(currentWorld).then(({ rooms }) => ({
          rooms: rooms.filter((r) => r.padiId === selectedPadiId),
        }));
      }
      return roomsApi.list(currentWorld);
    },
  });

  const createRoom = useMutation({
    mutationFn: () =>
      roomsApi.create({
        world: currentWorld,
        name: newRoomName,
        description: newRoomDesc || undefined,
        padiId: currentWorld === "higher" && selectedPadiId ? selectedPadiId : undefined,
      }),
    onSuccess: ({ room }) => {
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setShowCreate(false);
      setNewRoomName("");
      setNewRoomDesc("");
      void navigate(`/rooms/${room.id}`);
    },
  });

  const canCreateRoom = currentWorld !== "worker" && (currentWorld !== "higher" || !!selectedPadiId);

  return (
    <div className="flex flex-col h-full">
      <WorldNav />
      <div className="flex-1 overflow-hidden flex">
        {/* Higher World: show padi list panel on the left */}
        {currentWorld === "higher" && (
          <PadiList
            selectedPadiId={selectedPadiId}
            onSelect={(id) => setSelectedPadiId(id === selectedPadiId ? null : id)}
          />
        )}

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading rooms...</div>
          ) : (
            <RoomList
              rooms={data?.rooms ?? []}
              world={currentWorld}
              onCreateRoom={canCreateRoom ? () => setShowCreate(true) : undefined}
              emptyMessage={
                currentWorld === "higher" && !selectedPadiId
                  ? "Select a padi on the left to see its rooms"
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Create New Room</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Name</label>
              <input
                autoFocus
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g. Strategy Discussion"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
              <input
                value={newRoomDesc}
                onChange={(e) => setNewRoomDesc(e.target.value)}
                placeholder="What is this room for?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createRoom.mutate()}
                disabled={!newRoomName.trim() || createRoom.isPending}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {createRoom.isPending ? "Creating..." : "Create Room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
