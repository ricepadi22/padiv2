import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { Shield, MessageSquare, Hammer, LogOut, User } from "lucide-react";
import { useAuth } from "../context/AuthContext.tsx";

const worlds = [
  { to: "/worlds/higher", label: "Higher World", icon: Shield, color: "text-amber-600" },
  { to: "/worlds/middle", label: "Middle World", icon: MessageSquare, color: "text-blue-600" },
  { to: "/worlds/worker", label: "Worker World", icon: Hammer, color: "text-purple-600" },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    void navigate("/login");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="text-base font-bold text-gray-900">Rice Padi</div>
          <div className="text-xs text-gray-500 mt-0.5">Three Worlds</div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Worlds</div>
          {worlds.map(({ to, label, icon: Icon, color }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <Icon className={`w-4 h-4 ${color}`} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-200 to-blue-300 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
            {user?.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-900 truncate">{user?.displayName}</div>
            <div className="text-xs text-gray-500 truncate">{user?.email}</div>
          </div>
          <button onClick={() => void handleLogout()} className="text-gray-400 hover:text-gray-600" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
