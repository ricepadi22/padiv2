import { apiFetch } from "./client.ts";

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export const authApi = {
  signup: (email: string, password: string, displayName: string) =>
    apiFetch<{ user: User; token: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string) =>
    apiFetch<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  me: () =>
    apiFetch<{ user: User }>("/api/auth/me"),

  updateMe: (data: Partial<Pick<User, "displayName" | "bio" | "avatarUrl">>) =>
    apiFetch<{ user: User }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};
