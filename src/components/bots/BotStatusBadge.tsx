interface Props {
  status: "active" | "paused" | "offline";
}

export function BotStatusBadge({ status }: Props) {
  const styles = {
    active: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    offline: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
