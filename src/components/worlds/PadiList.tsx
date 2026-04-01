import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FolderOpen, Compass, Globe, Lock } from "lucide-react";
import { padisApi, type Padi } from "../../api/padis.ts";

interface PadiListProps {
  selectedPadiId: string | null;
  onSelect: (padiId: string | null) => void;
  showingDiscovery: boolean;
  onShowDiscovery: () => void;
}

export function PadiList({ selectedPadiId, onSelect, showingDiscovery, onShowDiscovery }: PadiListProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["padis"],
    queryFn: () => padisApi.list(),
  });

  const createPadi = useMutation({
    mutationFn: () => padisApi.create({ name: newName, description: newDesc || undefined, isPublic }),
    onSuccess: ({ padi }) => {
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setIsPublic(false);
      onSelect(padi.id);
    },
  });

  const padis = data?.padis ?? [];

  return (
    <div className="w-56 shrink-0 border-r border-zinc-200 flex flex-col bg-zinc-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Padis</span>
        <button
          onClick={() => setShowCreate(true)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 transition-colors"
          title="Create Padi"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Padi list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {isLoading ? (
          <div className="px-4 py-3 text-xs text-zinc-400">Loading...</div>
        ) : padis.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <FolderOpen className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">No padis yet</p>
            <p className="text-xs text-zinc-300 mt-1">Create or discover one</p>
          </div>
        ) : (
          padis.map((padi: Padi) => {
            const isSelected = selectedPadiId === padi.id && !showingDiscovery;
            const hasPending = (padi.pendingJoinRequestCount ?? 0) > 0;
            return (
              <button
                key={padi.id}
                onClick={() => onSelect(padi.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors text-left ${
                  isSelected
                    ? "bg-amber-50 border-r-2 border-amber-400"
                    : "hover:bg-zinc-100"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-amber-700">
                    {padi.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-zinc-800 truncate">{padi.name}</span>
                    {padi.isPublic
                      ? <Globe className="w-2.5 h-2.5 text-zinc-300 shrink-0" />
                      : <Lock className="w-2.5 h-2.5 text-zinc-300 shrink-0" />
                    }
                  </div>
                  {padi.roomCount !== undefined && (
                    <div className="text-xs text-zinc-400">{padi.roomCount} room{padi.roomCount !== 1 ? "s" : ""}</div>
                  )}
                </div>
                {hasPending && (
                  <span className="w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center shrink-0">
                    {padi.pendingJoinRequestCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Discover button */}
      <div className="border-t border-zinc-200 p-2">
        <button
          onClick={onShowDiscovery}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
            showingDiscovery
              ? "bg-amber-50 text-amber-700 font-medium"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          }`}
        >
          <Compass className="w-4 h-4 shrink-0" />
          Explore
        </button>
      </div>

      {/* Create padi modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Create Padi</h2>
            <p className="text-sm text-zinc-500">A padi is a community that spans all three worlds.</p>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Design Team"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Description (optional)</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What is this community about?"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Public/Private toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-zinc-800">Public</p>
                <p className="text-xs text-zinc-400">Others can discover and request to join</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPublic((v) => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${isPublic ? "bg-amber-500" : "bg-zinc-300"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublic ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-500">
              <Lock className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              <span>You can set up the AI host from Higher Ground after creating.</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowCreate(false); setIsPublic(false); }}
                className="flex-1 py-2 border border-zinc-300 text-zinc-700 rounded-lg text-sm hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createPadi.mutate()}
                disabled={!newName.trim() || createPadi.isPending}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {createPadi.isPending ? "Creating..." : "Create Padi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
