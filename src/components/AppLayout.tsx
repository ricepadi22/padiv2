import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { Shield, MessageSquare, Hammer, Bot, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext.tsx";

const worlds = [
  { to: "/worlds/higher", label: "Higher World", icon: Shield, dot: "bg-amber-400" },
  { to: "/worlds/middle", label: "Middle World", icon: MessageSquare, dot: "bg-green-400" },
  { to: "/worlds/worker", label: "Worker World", icon: Hammer, dot: "bg-blue-400" },
];

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    void navigate("/login");
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <aside className="w-52 bg-zinc-950 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-zinc-800">
          <div className="text-sm font-semibold text-white tracking-tight">Rice Padi</div>
          <div className="text-xs text-zinc-500 mt-0.5">Three Worlds</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <p className="px-3 pt-1 pb-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Worlds</p>
          {worlds.map(({ to, label, icon: Icon, dot }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
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
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}

          <p className="px-3 pt-4 pb-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">System</p>
          <NavLink
            to="/agents"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`
            }
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>Agents</span>
          </NavLink>
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-zinc-800 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
            {user ? initials(user.displayName) : "?"}
          </div>
          <div className="flex-1 min-w-0">
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
      <main className="flex-1 min-w-0 flex flex-col bg-white">
        <Outlet />
      </main>
    </div>
  );
}
