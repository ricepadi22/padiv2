import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { authApi, type User } from "../api/auth.ts";
import { setStoredToken, clearStoredToken, getStoredToken } from "../api/client.ts";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only attempt /me if we have a stored token
    if (!getStoredToken()) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then(({ user }) => setUser(user))
      .catch(() => {
        clearStoredToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { user, token } = await authApi.login(email, password);
    setStoredToken(token);
    setUser(user);
  }

  async function signup(email: string, password: string, displayName: string) {
    const { user, token } = await authApi.signup(email, password, displayName);
    setStoredToken(token);
    setUser(user);
  }

  async function logout() {
    clearStoredToken();
    await authApi.logout().catch(() => {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
