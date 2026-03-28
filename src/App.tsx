import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext.tsx";
import { LiveUpdatesProvider } from "./context/LiveUpdatesContext.tsx";
import { PadiProvider } from "./context/PadiContext.tsx";
import { AppLayout } from "./components/AppLayout.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { SignupPage } from "./pages/SignupPage.tsx";
import { WorldsPage } from "./pages/WorldsPage.tsx";
import { RoomPage } from "./pages/RoomPage.tsx";
import { BotsPage } from "./pages/BotsPage.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500 text-sm">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <PadiProvider>
                    <LiveUpdatesProvider>
                      <AppLayout />
                    </LiveUpdatesProvider>
                  </PadiProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="/worlds/middle" replace />} />
              <Route path="worlds" element={<Navigate to="/worlds/middle" replace />} />
              <Route path="worlds/:world" element={<WorldsPage />} />
              <Route path="rooms/:roomId" element={<RoomPage />} />
              <Route path="agents" element={<BotsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
