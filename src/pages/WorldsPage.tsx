import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Zap, Hash, Plus, Trash2, Send as SendIcon } from "lucide-react";
import { roomsApi, type WorldType, type Room } from "../api/rooms.ts";
import { padisApi } from "../api/padis.ts";
import { WorldNav } from "../components/worlds/WorldNav.tsx";
import { PadiList } from "../components/worlds/PadiList.tsx";
import { PadiDetail } from "../components/worlds/PadiDetail.tsx";
import { PadiDiscovery } from "../components/worlds/PadiDiscovery.tsx";
import { useAuth } from "../context/AuthContext.tsx";
import { usePadi } from "../context/PadiContext.tsx";

export function WorldsPage() {
  const { world = "middle" } = useParams<{ world?: string }>();
  const { user } = useAuth();
  const { selectedPadiId, selectPadi, showingDiscovery, showDiscovery } = usePadi();
  const currentWorld = world as WorldType;

  return (
    <div className="flex flex-col h-full">
      <WorldNav />
      <div className="flex-1 overflow-hidden flex">
        {/* Padi sidebar — shared across ALL worlds */}
        <PadiList
          selectedPadiId={selectedPadiId}
          onSelect={selectPadi}
          showingDiscovery={showingDiscovery}
          onShowDiscovery={showDiscovery}
        />

        {/* Main content — varies by world */}
        <div className="flex-1 overflow-hidden">
          {currentWorld === "higher" && (
            showingDiscovery ? (
              <PadiDiscovery onJoined={(id) => selectPadi(id)} />
            ) : selectedPadiId ? (
              <PadiDetail padiId={selectedPadiId} currentUserId={user?.id ?? ""} onDeselect={() => selectPadi(null)} />
            ) : (
              <HigherWorldEmpty onExplore={showDiscovery} />
            )
          )}

          {currentWorld === "middle" && (
            selectedPadiId ? (
              <MiddleWorldView padiId={selectedPadiId} />
            ) : (
              <NoPadiSelected world="middle" />
            )
          )}

          {currentWorld === "worker" && (
            selectedPadiId ? (
              <WorkerWorldView padiId={selectedPadiId} />
            ) : (
              <NoPadiSelected world="worker" />
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Higher World empty state ──────────────────────────────────────────────────
function HigherWorldEmpty({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <span className="text-2xl">🌾</span>
      </div>
      <h3 className="text-sm font-semibold text-zinc-800 mb-1">Welcome to Higher World</h3>
      <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
        Higher World is for human collaboration. Create a padi to start your own community, or explore public padis to join.
      </p>
      <button
        onClick={onExplore}
        className="mt-5 text-xs font-medium px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
      >
        Explore Communities
      </button>
    </div>
  );
}

// ── No padi selected prompt ───────────────────────────────────────────────────
function NoPadiSelected({ world }: { world: "middle" | "worker" }) {
  const label = world === "middle" ? "collaboration rooms" : "worker tasks";
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
        world === "middle" ? "bg-green-50" : "bg-blue-50"
      }`}>
        <span className="text-2xl">{world === "middle" ? "💬" : "⚙️"}</span>
      </div>
      <h3 className="text-sm font-semibold text-zinc-800 mb-1">Select a padi</h3>
      <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
        Choose a padi from the sidebar to see its {label}.
      </p>
    </div>
  );
}

// ── Middle World: padi-scoped collaboration rooms ─────────────────────────────
function MiddleWorldView({ padiId }: { padiId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["rooms", "middle", padiId],
    queryFn: () => roomsApi.list("middle", padiId),
  });

  const createRoom = useMutation({
    mutationFn: () => roomsApi.create({ world: "middle", name: newName, description: newDesc || undefined, padiId }),
    onSuccess: ({ room }) => {
      void queryClient.invalidateQueries({ queryKey: ["rooms", "middle", padiId] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      void navigate(`/rooms/${room.id}`);
    },
  });

  const archiveRoom = useMutation({
    mutationFn: (roomId: string) => roomsApi.update(roomId, { status: "archived" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rooms", "middle", padiId] }),
  });

  const rooms = data?.rooms ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Collaboration Rooms</span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New room
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-xs text-zinc-400 text-center py-8">Loading...</div>
        ) : rooms.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-zinc-400">No rooms yet.</p>
            <p className="text-xs text-zinc-300 mt-1">Create one to start collaborating with your agents.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-xs font-medium px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Create room
            </button>
          </div>
        ) : (
          rooms.map((room: Room) => (
            <RoomRow key={room.id} room={room} onArchive={() => {
              if (confirm(`Archive "${room.name}"?`)) archiveRoom.mutate(room.id);
            }} />
          ))
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900">New Collaboration Room</h2>
            <p className="text-xs text-zinc-400">Humans and invited agents can chat here.</p>
            <input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Room name"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
            />
            <input
              value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50">Cancel</button>
              <button
                onClick={() => createRoom.mutate()}
                disabled={!newName.trim() || createRoom.isPending}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
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

// ── Worker World: locked if no AI host, else padi-scoped task rooms ───────────
function WorkerWorldView({ padiId }: { padiId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: padiData } = useQuery({
    queryKey: ["padi", padiId],
    queryFn: () => padisApi.get(padiId),
  });

  const { data: roomsData, isLoading } = useQuery({
    queryKey: ["rooms", "worker", padiId],
    queryFn: () => roomsApi.list("worker", padiId),
    enabled: !!padiData?.padi.hostBotId,
  });

  const createRoom = useMutation({
    mutationFn: () => roomsApi.create({ world: "worker", name: newName, description: newDesc || undefined, padiId }),
    onSuccess: ({ room }) => {
      void queryClient.invalidateQueries({ queryKey: ["rooms", "worker", padiId] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      void navigate(`/rooms/${room.id}`);
    },
  });

  const archiveRoom = useMutation({
    mutationFn: (roomId: string) => roomsApi.update(roomId, { status: "archived" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rooms", "worker", padiId] }),
  });

  // Locked state — no AI host configured
  if (!padiData?.padi.hostBotId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-800 mb-1">Worker World is locked</h3>
        <p className="text-xs text-zinc-400 max-w-xs leading-relaxed mb-4">
          Set up an AI host for this padi to unlock Worker World. The AI host will spawn agents to complete tasks.
        </p>
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
          <Zap className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700">
            Go to <strong>Higher World → AI Host tab</strong> to set up your padi's AI.
          </p>
        </div>
      </div>
    );
  }

  const rooms = roomsData?.rooms ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Worker Rooms</span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New task room
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-xs text-zinc-400 text-center py-8">Loading...</div>
        ) : rooms.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-zinc-400">No worker rooms yet.</p>
            <p className="text-xs text-zinc-300 mt-1">Use "Send to Work" from a Middle World room, or create one directly.</p>
          </div>
        ) : (
          rooms.map((room: Room) => (
            <RoomRow key={room.id} room={room} accent="blue" onArchive={() => {
              if (confirm(`Archive "${room.name}"?`)) archiveRoom.mutate(room.id);
            }} />
          ))
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900">New Worker Room</h2>
            <p className="text-xs text-zinc-400">The AI host will spawn bots to complete tasks here.</p>
            <input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Task name"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50">Cancel</button>
              <button
                onClick={() => createRoom.mutate()}
                disabled={!newName.trim() || createRoom.isPending}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
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

// ── Shared room row ───────────────────────────────────────────────────────────
function RoomRow({ room, accent = "zinc", onArchive }: { room: Room; accent?: string; onArchive: () => void }) {
  const dotColor = accent === "blue" ? "text-blue-400" : "text-green-500";
  return (
    <div className="flex items-center gap-2.5 px-4 py-2 hover:bg-zinc-50 transition-colors group">
      <Hash className={`w-3.5 h-3.5 shrink-0 ${dotColor}`} />
      <Link to={`/rooms/${room.id}`} className="flex-1 min-w-0">
        <div className="text-sm text-zinc-700 group-hover:text-zinc-900 truncate transition-colors">{room.name}</div>
        {room.description && <div className="text-xs text-zinc-400 truncate">{room.description}</div>}
      </Link>
      <button
        onClick={onArchive}
        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all shrink-0"
        title="Archive room"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
