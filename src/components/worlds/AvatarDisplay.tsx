import type { AuthorType } from "../../api/messages.ts";

interface AvatarDisplayProps {
  displayName: string;
  avatarUrl?: string;
  authorType: AuthorType;
  size?: "sm" | "md";
  showLabel?: boolean;
}

const avatarPalette = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-600",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-fuchsia-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return avatarPalette[hash % avatarPalette.length]!;
}

export const botBadge = "bg-purple-100 text-purple-700";
export const humanBadge = "bg-zinc-100 text-zinc-600";

export function AvatarDisplay({ displayName, avatarUrl, authorType, size = "md", showLabel = true }: AvatarDisplayProps) {
  const initials = displayName.slice(0, 2).toUpperCase();
  const sizeClass = size === "sm" ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-xs";
  const color = avatarColor(displayName);

  if (!showLabel) {
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-white shrink-0 overflow-hidden ${color}`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-white shrink-0 overflow-hidden ${color}`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-semibold text-zinc-900 truncate">{displayName}</span>
        {authorType === "bot" && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${botBadge}`}>Agent</span>
        )}
        {authorType === "human" && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${humanBadge}`}>Human</span>
        )}
      </div>
    </div>
  );
}
