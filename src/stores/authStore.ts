import { create } from "zustand";
import * as ipc from "@/lib/ipc";

export interface UserProfile {
  id: string;
  email: string;
  created_at: string;
}

export interface Subscription {
  plan_name: string;
  display_name: string;
  status: string;
  max_messages_per_day: number;
  max_tokens_per_day: number;
  allowed_models: string[];
  expires_at: string | null;
}

export interface AuthSession {
  is_authenticated: boolean;
  user: UserProfile | null;
  subscription: Subscription | null;
}

interface AuthState {
  // Session
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  subscription: Subscription | null;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  loadSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  isAuthenticated: false,
  isLoading: true, // Start as loading to check session on mount
  user: null,
  subscription: null,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const session: AuthSession = await ipc.authLogin(email, password);
      set({
        isAuthenticated: session.is_authenticated,
        user: session.user,
        subscription: session.subscription,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Login failed";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const session: AuthSession = await ipc.authRegister(email, password);
      set({
        isAuthenticated: session.is_authenticated,
        user: session.user,
        subscription: session.subscription,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Registration failed";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await ipc.authLogout();
    } catch {
      // Best effort — clear local state regardless
    }
    set({
      isAuthenticated: false,
      user: null,
      subscription: null,
      isLoading: false,
      error: null,
    });
  },

  refreshSession: async () => {
    try {
      const session: AuthSession = await ipc.authRefresh();
      set({
        isAuthenticated: session.is_authenticated,
        user: session.user,
        subscription: session.subscription,
      });
    } catch {
      // Refresh failed — session is invalid
      set({
        isAuthenticated: false,
        user: null,
        subscription: null,
      });
    }
  },

  loadSession: async () => {
    set({ isLoading: true });
    try {
      const session: AuthSession = await ipc.authGetSession();
      set({
        isAuthenticated: session.is_authenticated,
        user: session.user,
        subscription: session.subscription,
        isLoading: false,
      });
    } catch {
      set({
        isAuthenticated: false,
        user: null,
        subscription: null,
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
