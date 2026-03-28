import type { AuthorType } from "../../api/messages.ts";

interface AvatarDisplayProps {
  displayName: string;
  avatarUrl?: string;
  authorType: AuthorType;
  size?: "sm" | "md";
}

const typeColors: Record<AuthorType, string> = {
  human: "bg-blue-100 text-blue-700",
  bot: "bg-purple-100 text-purple-700",
  system: "bg-gray-100 text-gray-600",
};

const typeLabel: Record<AuthorType, string> = {
  human: "Human",
  bot: "Bot",
  system: "System",
};

export function AvatarDisplay({ displayName, avatarUrl, authorType, size = "md" }: AvatarDisplayProps) {
  const initials = displayName.slice(0, 2).toUpperCase();
  const sizeClass = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";

  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 shrink-0 overflow-hidden`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-semibold text-gray-900 truncate">{displayName}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeColors[authorType]}`}>
          {typeLabel[authorType]}
        </span>
      </div>
    </div>
  );
}
