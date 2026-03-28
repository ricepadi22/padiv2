import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Hash, Bot, Globe, Lock } from "lucide-react";
import { padisApi, type DiscoverablePadi } from "../../api/padis.ts";

interface PadiDiscoveryProps {
  onJoined: (padiId: string) => void;
}

export function PadiDiscovery({ onJoined }: PadiDiscoveryProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["padis", "discover", { search: debouncedSearch, sort }],
    queryFn: () => padisApi.discover({ search: debouncedSearch || undefined, sort }),
  });

  const joinPadi = useMutation({
    mutationFn: (padiId: string) => padisApi.join(padiId),
    onSuccess: (result, padiId) => {
      if (result.joined) {
        void queryClient.invalidateQueries({ queryKey: ["padis"] });
        onJoined(padiId);
      } else {
        setRequestedIds((prev) => new Set([...prev, padiId]));
      }
    },
  });

  const padis = data?.padis ?? [];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-200 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-900">Explore Communities</h2>
        <p className="text-xs text-zinc-400 mt-0.5">Discover padis to join and collaborate with</p>
      </div>

      {/* Search + Sort */}
      <div className="px-6 py-3 border-b border-zinc-100 shrink-0 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search padis..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-amber-400 bg-zinc-50"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 py-2 text-zinc-600 focus:outline-none focus:border-amber-400 bg-zinc-50"
        >
          <option value="newest">Newest</option>
          <option value="members">Most Members</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center text-zinc-400 text-sm py-12">Loading communities...</div>
        ) : padis.length === 0 ? (
          <div className="text-center py-16">
            <Globe className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 font-medium">
              {debouncedSearch ? "No communities match your search" : "No public communities yet"}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {debouncedSearch ? "Try a different search term" : "Create one or invite others to make their padis public"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {padis.map((padi: DiscoverablePadi) => (
              <PadiCard
                key={padi.id}
                padi={padi}
                pending={requestedIds.has(padi.id)}
                onJoin={() => joinPadi.mutate(padi.id)}
                joining={joinPadi.isPending && joinPadi.variables === padi.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PadiCard({ padi, pending, onJoin, joining }: {
  padi: DiscoverablePadi;
  pending: boolean;
  onJoin: () => void;
  joining: boolean;
}) {
  const initials = padi.name.slice(0, 2).toUpperCase();

  return (
    <div className="border border-zinc-200 rounded-xl p-4 bg-white hover:border-amber-300 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-amber-700">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-zinc-900 truncate">{padi.name}</span>
            {padi.requireApproval ? (
              <Lock className="w-3 h-3 text-zinc-400 shrink-0" title="Requires approval" />
            ) : (
              <Globe className="w-3 h-3 text-zinc-400 shrink-0" title="Open to join" />
            )}
          </div>
          {padi.description && (
            <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{padi.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
          <Users className="w-3 h-3" />
          {padi.memberCount}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
          <Hash className="w-3 h-3" />
          {padi.roomCount}
        </span>
        {padi.hasHost && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <Bot className="w-3 h-3" />
            AI host
          </span>
        )}
        <div className="flex-1" />
        {pending ? (
          <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-medium">
            Requested
          </span>
        ) : (
          <button
            onClick={onJoin}
            disabled={joining}
            className="text-xs font-medium px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {joining ? "..." : padi.requireApproval ? "Request to Join" : "Join"}
          </button>
        )}
      </div>
    </div>
  );
}
