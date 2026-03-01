import { useState } from "react";
import { Loader2, Mail, Lock, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { login, register, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (mode === "register" && password !== confirmPassword) {
      return;
    }

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch {
      // Error is handled by the store
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    clearError();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary">
      <div className="w-full max-w-md px-8">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/20 flex items-center justify-center">
            <span className="text-3xl font-bold text-accent">C</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            Claude Desktop Pro
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-[var(--radius-sm)] bg-error/10 border border-error/20 flex items-start gap-2">
            <AlertCircle size={16} className="text-error mt-0.5 shrink-0" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={isLoading}
                className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] pl-10 pr-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "register" ? "At least 6 characters" : "Your password"
                }
                required
                minLength={mode === "register" ? 6 : undefined}
                disabled={isLoading}
                className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] pl-10 pr-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* Confirm Password (register only) */}
          {mode === "register" && (
            <div>
              <label className="text-sm text-text-secondary block mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  disabled={isLoading}
                  className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] pl-10 pr-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-error mt-1">
                  Passwords do not match
                </p>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              isLoading ||
              !email ||
              !password ||
              (mode === "register" && password !== confirmPassword)
            }
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-text-inverse text-sm font-medium rounded-[var(--radius-sm)] hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {mode === "login" ? "Signing in..." : "Creating account..."}
              </>
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="mt-6 text-center">
          <p className="text-sm text-text-secondary">
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}{" "}
            <button
              onClick={switchMode}
              disabled={isLoading}
              className="text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-text-muted">
          AI Boundless Academy
        </p>
      </div>
    </div>
  );
}
