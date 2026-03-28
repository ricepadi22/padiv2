interface Props {
  status: "active" | "paused" | "offline";
}

export function BotStatusBadge({ status }: Props) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    offline: "bg-zinc-100 text-zinc-500 border-zinc-200",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${styles[status]}`}>
      {status}
    </span>
  );
}
