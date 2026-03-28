import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FolderOpen, Trash2 } from "lucide-react";
import { padisApi, type Padi } from "../../api/padis.ts";

interface PadiListProps {
  selectedPadiId: string | null;
  onSelect: (padiId: string) => void;
}

export function PadiList({ selectedPadiId, onSelect }: PadiListProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["padis"],
    queryFn: () => padisApi.list(),
  });

  const createPadi = useMutation({
    mutationFn: () => padisApi.create({ name: newName, description: newDesc || undefined }),
    onSuccess: ({ padi }) => {
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      onSelect(padi.id);
    },
  });

  const archivePadi = useMutation({
    mutationFn: (padiId: string) => padisApi.update(padiId, { status: "archived" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
      if (selectedPadiId) onSelect(selectedPadiId); // deselect if archived
    },
  });

  const padis = data?.padis ?? [];

  return (
    <div className="w-64 shrink-0 border-r border-zinc-200 flex flex-col bg-zinc-50">
      <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Your Padis</span>
        <button
          onClick={() => setShowCreate(true)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 transition-colors"
          title="Create Padi"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {isLoading ? (
          <div className="px-4 py-3 text-xs text-zinc-400">Loading...</div>
        ) : padis.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <FolderOpen className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">No padis yet</p>
            <p className="text-xs text-zinc-300 mt-1">Create one to get started</p>
          </div>
        ) : (
          padis.map((padi: Padi) => (
            <div
              key={padi.id}
              className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors group ${
                selectedPadiId === padi.id
                  ? "bg-amber-50 border-r-2 border-amber-400"
                  : "hover:bg-zinc-100"
              }`}
            >
              <button
                onClick={() => onSelect(padi.id)}
                className="flex items-start gap-2.5 flex-1 min-w-0 text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-amber-700">
                    {padi.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-800 truncate">{padi.name}</div>
                  {padi.description && (
                    <div className="text-xs text-zinc-500 truncate mt-0.5">{padi.description}</div>
                  )}
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); archivePadi.mutate(padi.id); }}
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition-all shrink-0 mt-1"
                title="Archive padi"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Create Padi</h2>
            <p className="text-sm text-zinc-500">A padi is a community or project group in Higher World.</p>
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
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
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
