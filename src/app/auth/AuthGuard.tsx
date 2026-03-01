import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";
import { LoginPage } from "./LoginPage";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * AuthGuard wraps the main application content.
 * - On mount: checks if user has a valid session via the backend
 * - If authenticated: renders children (the full app)
 * - If not authenticated: renders the LoginPage
 * - While loading: shows a centered spinner
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, loadSession, refreshSession } =
    useAuthStore();

  // Check session on mount
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Set up periodic token refresh (every 50 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(
      () => {
        refreshSession();
      },
      50 * 60 * 1000, // 50 minutes
    );

    return () => clearInterval(interval);
  }, [isAuthenticated, refreshSession]);

  // Loading state — show spinner while checking session
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-accent animate-spin" />
          <p className="text-sm text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Authenticated — render app
  return <>{children}</>;
}
