import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Clock } from "lucide-react";
import { padisApi, type JoinRequest } from "../../api/padis.ts";

interface JoinRequestListProps {
  padiId: string;
  onApproved?: () => void;
}

export function JoinRequestList({ padiId, onApproved }: JoinRequestListProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["padi", padiId, "join-requests"],
    queryFn: () => padisApi.listJoinRequests(padiId),
  });

  const review = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "approved" | "rejected" }) =>
      padisApi.reviewJoinRequest(padiId, requestId, status),
    onSuccess: (_result, { status }) => {
      void queryClient.invalidateQueries({ queryKey: ["padi", padiId, "join-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["padis"] });
      if (status === "approved") onApproved?.();
    },
  });

  const requests = data?.joinRequests ?? [];

  if (isLoading) return <div className="text-xs text-zinc-400 py-4 text-center">Loading...</div>;

  if (requests.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-6 h-6 text-zinc-200 mx-auto mb-2" />
        <p className="text-xs text-zinc-400">No pending join requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((req: JoinRequest) => (
        <div key={req.id} className="flex items-start gap-3 p-3 border border-zinc-200 rounded-xl bg-white">
          <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 text-xs font-bold text-zinc-600">
            {req.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-zinc-900">{req.displayName}</div>
            <div className="text-xs text-zinc-400">{req.email}</div>
            {req.message && (
              <p className="text-xs text-zinc-500 mt-1 italic">"{req.message}"</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => review.mutate({ requestId: req.id, status: "approved" })}
              disabled={review.isPending}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              title="Approve"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => review.mutate({ requestId: req.id, status: "rejected" })}
              disabled={review.isPending}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
              title="Reject"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
