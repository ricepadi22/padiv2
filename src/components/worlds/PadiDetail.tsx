import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Hash, Plus, Users, Bot, Settings, Globe, Lock, LogOut, X, Crown, Shield, User } from "lucide-react";
import { padisApi, type PadiMember } from "../../api/padis.ts";
import { roomsApi } from "../../api/rooms.ts";
import { JoinRequestList } from "./JoinRequestList.tsx";
import { PadiHostSetup } from "./PadiHostSetup.tsx";

interface PadiDetailProps {
  padiId: string;
  currentUserId: string;
  onDeselect: () => void;
}

type Tab = "rooms" | "members" | "host";

const roleIcon: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3 h-3 text-amber-600" />,
  admin: <Shield className="w-3 h-3 text-blue-500" />,
  member: <User className="w-3 h-3 text-zinc-400" />,
};

export function PadiDetail({ padiId, currentUserId, onDeselect }: PadiDetailProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("rooms");
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");

  // Settings state
  const [settingsName, setSettingsName] = useState("");
  const [settingsDesc, setSettingsDesc] = useState("");
  const [settingsPublic, setSettingsPublic] = useState(false);
  const [settingsApproval, setSettingsApproval] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["padi", padiId],
    queryFn: () => padisApi.get(padiId),
  });

  // Sync settings form when padi data loads
  useEffect(() => {
    if (data?.padi) {
      setSettingsName(data.padi.name);
      setSettingsDesc(data.padi.description ?? "");
      setSettingsPublic(data.padi.isPublic);
      setSettingsApproval(data.padi.requireApproval);
    }
  }, [data]);

  const updatePadi = useMutation({
    mutationFn: (updates: Parameters<typeof padisApi.update>[1]) => padisApi.update(padiId, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
      setShowSettings(false);
    },
  });

  const createRoom = useMutation({
    mutationFn: () => roomsApi.create({ world: "higher", name: newRoomName, description: newRoomDesc || undefined, padiId }),
    onSuccess: ({ room }) => {
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId] });
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setShowCreateRoom(false);
      setNewRoomName("");
      setNewRoomDesc("");
      void navigate(`/rooms/${room.id}`);
    },
  });

  const leavePadi = useMutation({
    mutationFn: () => {
      const myMembership = data?.members.find((m) => m.userId === currentUserId);
      if (!myMembership) throw new Error("Not a member");
      return padisApi.removeMember(padiId, myMembership.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
      onDeselect();
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => padisApi.removeMember(padiId, memberId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["padi", padiId] }),
  });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-full text-sm text-zinc-400">Loading...</div>;
  }

  const { padi, members, hostBot } = data;
  const myMembership = members.find((m) => m.userId === currentUserId);
  const myRole = myMembership?.role ?? "member";
  const isOwner = myRole === "owner";
  const isAdmin = ["owner", "admin"].includes(myRole);
  const pendingCount = (padi as { pendingJoinRequestCount?: number }).pendingJoinRequestCount ?? 0;

  const tabs = [
    { id: "rooms" as Tab, label: "Rooms" },
    { id: "members" as Tab, label: `Members (${members.length})` },
    {
      id: "host" as Tab,
      label: "AI Host",
      badge: hostBot ? hostBot.status === "active" ? "active" : "paused" : undefined,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Padi Header */}
      <div className="px-5 py-4 border-b border-zinc-200 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-amber-700">{padi.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 truncate">{padi.name}</h2>
              {padi.isPublic ? (
                <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" title="Public" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" title="Private" />
              )}
            </div>
            {padi.description && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{padi.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isAdmin && (
              <button
                onClick={() => setShowSettings(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
                title="Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => {
                if (isOwner) return alert("Owners cannot leave. Archive the padi from settings instead.");
                if (confirm("Leave this padi?")) leavePadi.mutate();
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-500 transition-colors"
              title="Leave padi"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mt-3 border-b -mb-4 border-zinc-100">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.id
                  ? "text-amber-700 border-amber-500"
                  : "text-zinc-400 border-transparent hover:text-zinc-700"
              }`}
            >
              {t.label}
              {t.id === "members" && pendingCount > 0 && isAdmin && (
                <span className="w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
              {t.badge && (
                <span className={`w-1.5 h-1.5 rounded-full ${t.badge === "active" ? "bg-emerald-500" : "bg-zinc-400"}`} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Rooms tab ── */}
        {activeTab === "rooms" && (
          <div className="p-4">
            <RoomsTab padiId={padiId} onCreateRoom={() => setShowCreateRoom(true)} />
          </div>
        )}

        {/* ── Members tab ── */}
        {activeTab === "members" && (
          <div className="p-4 space-y-4">
            {isAdmin && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                  Pending Requests
                </p>
                <JoinRequestList padiId={padiId} onApproved={() => void queryClient.invalidateQueries({ queryKey: ["padi", padiId] })} />
              </div>
            )}
            <div>
              {isAdmin && (
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Members</p>
              )}
              <div className="space-y-1">
                {members.map((m: PadiMember) => (
                  <div key={m.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-zinc-50 group">
                    <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600 shrink-0">
                      {m.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-800 truncate">{m.displayName}</div>
                      <div className="text-xs text-zinc-400 truncate">{m.email}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {roleIcon[m.role]}
                      <span className="text-[11px] text-zinc-400">{m.role}</span>
                    </div>
                    {isAdmin && m.userId !== currentUserId && m.role !== "owner" && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${m.displayName} from this padi?`)) {
                            removeMember.mutate(m.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AI Host tab ── */}
        {activeTab === "host" && (
          <div className="p-4">
            <PadiHostSetup
              padiId={padiId}
              padiName={padi.name}
              hostBot={hostBot}
              isOwner={isOwner}
            />
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900">New Room in {padi.name}</h2>
            <input
              autoFocus
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Room name"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
            />
            <input
              value={newRoomDesc}
              onChange={(e) => setNewRoomDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowCreateRoom(false)} className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50">Cancel</button>
              <button
                onClick={() => createRoom.mutate()}
                disabled={!newRoomName.trim() || createRoom.isPending}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-50"
              >
                {createRoom.isPending ? "Creating..." : "Create Room"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">Padi Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Name</label>
                <input
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Description</label>
                <input
                  value={settingsDesc}
                  onChange={(e) => setSettingsDesc(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">Public</p>
                  <p className="text-xs text-zinc-400">Appears in discovery for other users</p>
                </div>
                <button
                  onClick={() => setSettingsPublic((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${settingsPublic ? "bg-amber-500" : "bg-zinc-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settingsPublic ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">Require Approval</p>
                  <p className="text-xs text-zinc-400">New members need owner approval</p>
                </div>
                <button
                  onClick={() => setSettingsApproval((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${settingsApproval ? "bg-amber-500" : "bg-zinc-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settingsApproval ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>
            {isOwner && (
              <div className="pt-2 border-t border-zinc-100">
                <button
                  onClick={() => {
                    if (confirm("Archive this padi? It will be hidden from all members.")) {
                      updatePadi.mutate({ status: "archived" });
                      onDeselect();
                    }
                  }}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Archive padi
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowSettings(false)} className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50">Cancel</button>
              <button
                onClick={() =>
                  updatePadi.mutate({
                    name: settingsName,
                    description: settingsDesc || undefined,
                    isPublic: settingsPublic,
                    requireApproval: settingsApproval,
                  })
                }
                disabled={!settingsName.trim() || updatePadi.isPending}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {updatePadi.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rooms sub-component ────────────────────────────────────────────────────────
function RoomsTab({ padiId, onCreateRoom }: { padiId: string; onCreateRoom: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["padi", padiId, "rooms"],
    queryFn: () => padisApi.listRooms(padiId),
  });

  const rooms = data?.rooms ?? [];

  if (isLoading) return <div className="text-xs text-zinc-400 py-4 text-center">Loading rooms...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Rooms</span>
        <button
          onClick={onCreateRoom}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New room
        </button>
      </div>
      {rooms.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-zinc-200 rounded-xl">
          <Hash className="w-6 h-6 text-zinc-200 mx-auto mb-2" />
          <p className="text-xs text-zinc-400">No rooms yet</p>
          <button onClick={onCreateRoom} className="mt-2 text-xs text-amber-600 hover:text-amber-700 font-medium">
            Create the first room
          </button>
        </div>
      ) : (
        <div className="space-y-0.5">
          {rooms.map((room) => (
            <Link
              key={room.id}
              to={`/rooms/${room.id}`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-50 text-sm text-zinc-700 hover:text-zinc-900 transition-colors"
            >
              <Hash className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">{room.name}</span>
              {room.description && (
                <span className="text-xs text-zinc-400 truncate ml-auto">{room.description}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
