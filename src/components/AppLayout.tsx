import { useState } from "react";
import { NavLink, useNavigate, Outlet, useLocation } from "react-router-dom";
import { Shield, MessageSquare, Hammer, LogOut, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.tsx";
import { botsApi } from "../api/bots.ts";

const worlds = [
  { to: "/worlds/higher", label: "Padi Hub", icon: Shield, dot: "bg-amber-400" },
  { to: "/worlds/middle", label: "Middle", icon: MessageSquare, dot: "bg-green-400" },
  { to: "/worlds/worker", label: "Worker", icon: Hammer, dot: "bg-blue-400" },
];

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showAvatarStatus, setShowAvatarStatus] = useState(false);

  const { data: botsData } = useQuery({
    queryKey: ["my-bots"],
    queryFn: botsApi.list,
    staleTime: 60_000,
  });

  const { data: onlineData } = useQuery({
    queryKey: ["bots-online"],
    queryFn: botsApi.online,
    refetchInterval: 10_000,
  });

  const avatarBot = botsData?.bots.find((b) => b.type === "avatar");
  const isAvatarOnline = avatarBot
    ? (onlineData?.onlineBotIds ?? []).includes(avatarBot.id)
    : false;

  const dotColor = !avatarBot
    ? "bg-zinc-600"
    : isAvatarOnline
    ? "bg-green-400"
    : avatarBot.status === "paused"
    ? "bg-amber-400"
    : "bg-zinc-600";

  const statusLabel = !avatarBot
    ? "No avatar"
    : isAvatarOnline
    ? "Online"
    : avatarBot.status === "paused"
    ? "Paused"
    : "Offline";

  async function handleLogout() {
    await logout();
    void navigate("/login");
  }

  const isWorldsPage = location.pathname.startsWith("/worlds");

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-14 lg:w-48 bg-zinc-950 flex-col shrink-0">
        {/* Logo */}
        <div className="px-3 lg:px-4 py-4 border-b border-zinc-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">RP</span>
          </div>
          <div className="hidden lg:block min-w-0">
            <div className="text-xs font-semibold text-white tracking-tight truncate">Rice Padi</div>
            <div className="text-[10px] text-zinc-500">Three Worlds</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-1.5 lg:px-2 py-3 space-y-0.5 overflow-y-auto">
          {worlds.map(({ to, label, icon: Icon, dot }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 lg:px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${isActive ? "opacity-100" : "opacity-40"}`} />
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden lg:inline">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Avatar bot status */}
        {avatarBot && (
          <div className="px-2 lg:px-3 py-2.5 border-t border-zinc-800 flex items-center gap-2">
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-full bg-green-950 border border-green-800 flex items-center justify-center text-xs font-bold text-green-400">
                {initials(avatarBot.displayName)}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-zinc-950 ${dotColor}`} />
            </div>
            <div className="hidden lg:block flex-1 min-w-0">
              <div className="text-xs font-medium text-zinc-300 truncate">{avatarBot.displayName}</div>
              <div className="text-[10px] text-zinc-600">avatar · {statusLabel.toLowerCase()}</div>
            </div>
          </div>
        )}

        {/* User footer */}
        <div className="px-2 lg:px-3 py-3 border-t border-zinc-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
            {user ? initials(user.displayName) : "?"}
          </div>
          <div className="hidden lg:block flex-1 min-w-0">
            <div className="text-xs font-medium text-zinc-200 truncate">{user?.displayName}</div>
            <div className="text-[10px] text-zinc-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden pb-14 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile avatar status sheet */}
      {showAvatarStatus && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setShowAvatarStatus(false)}>
          <div
            className="w-full bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-5 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Avatar Agent</span>
              <button onClick={() => setShowAvatarStatus(false)} className="text-zinc-600 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {avatarBot ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-green-950 border border-green-800 flex items-center justify-center text-sm font-bold text-green-400">
                    {initials(avatarBot.displayName)}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950 ${dotColor}`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{avatarBot.displayName}</div>
                  <div className="text-xs text-zinc-500">{statusLabel}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No avatar agent. Invite one from any Middle World room.</p>
            )}

            <div className="pt-2 border-t border-zinc-800">
              <button
                onClick={() => void handleLogout()}
                className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around z-40">
        {worlds.map(({ to, label, icon: Icon, dot }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-2.5 flex-1 transition-colors ${
                isActive ? "text-white" : "text-zinc-500"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${dot} ${isActive ? "opacity-100" : "opacity-0"}`} />
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Avatar status button — opens sheet, never logs out */}
        <button
          onClick={() => setShowAvatarStatus(true)}
          className="flex flex-col items-center gap-0.5 px-4 py-2.5 flex-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <div className="relative">
            {avatarBot ? (
              <div className="w-5 h-5 rounded-full bg-green-950 border border-green-800 flex items-center justify-center text-[9px] font-bold text-green-400">
                {initials(avatarBot.displayName)}
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                {user ? initials(user.displayName) : "?"}
              </div>
            )}
            <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-zinc-950 ${dotColor}`} />
          </div>
          <span className="text-[10px] font-medium">{avatarBot ? avatarBot.displayName : "Avatar"}</span>
        </button>
      </nav>
    </div>
  );
}
