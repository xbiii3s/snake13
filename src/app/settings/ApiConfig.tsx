import { useEffect, useState } from "react";
import { User, CreditCard, LogOut, Shield } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import * as ipc from "@/lib/ipc";

export function ApiConfig() {
  const { user, subscription, logout, isLoading } = useAuthStore();
  const [defaultModel, setDefaultModel] = useState("claude-sonnet-4-5");
  const [saved, setSaved] = useState(false);

  // Load default model setting
  useEffect(() => {
    (async () => {
      const savedModel = await ipc.getSetting("default_model");
      if (savedModel) setDefaultModel(savedModel);
    })();
  }, []);

  const handleSaveModel = async () => {
    await ipc.setSetting("default_model", defaultModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Account & Subscription</h3>

      <div className="space-y-6">
        {/* User Info */}
        <div className="p-4 bg-bg-elevated rounded-[var(--radius-sm)] border border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              <User size={18} className="text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {user?.email ?? "Unknown"}
              </p>
              <p className="text-xs text-text-muted">
                Member since{" "}
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription Info */}
        <div className="p-4 bg-bg-elevated rounded-[var(--radius-sm)] border border-border">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-accent" />
            <h4 className="text-sm font-medium text-text-primary">
              Subscription
            </h4>
          </div>

          {subscription ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Plan</span>
                <span className="text-sm font-medium text-accent">
                  {subscription.display_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Status</span>
                <span
                  className={`text-sm font-medium ${
                    subscription.status === "active"
                      ? "text-success"
                      : "text-error"
                  }`}
                >
                  {subscription.status === "active" ? "Active" : subscription.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">
                  Daily Messages
                </span>
                <span className="text-sm text-text-primary">
                  {subscription.max_messages_per_day} / day
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Models</span>
                <span className="text-sm text-text-primary">
                  {subscription.allowed_models.length} available
                </span>
              </div>
              {subscription.expires_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Expires</span>
                  <span className="text-sm text-text-primary">
                    {new Date(subscription.expires_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-text-muted">
              <p>Free tier — limited daily usage</p>
              <button className="mt-2 px-3 py-1.5 bg-accent text-text-inverse text-xs rounded-[var(--radius-sm)] hover:bg-accent-hover transition-colors">
                Upgrade Plan
              </button>
            </div>
          )}
        </div>

        {/* Default Model */}
        <div>
          <label className="text-sm text-text-secondary block mb-1">
            Default Model
          </label>
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
          >
            <option value="claude-sonnet-4-5">
              Claude Sonnet 4.5 (Recommended)
            </option>
            <option value="claude-opus-4-6">Claude Opus 4.6</option>
            <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
          </select>
          <div className="mt-2">
            <button
              onClick={handleSaveModel}
              className="px-3 py-1.5 bg-bg-elevated border border-border text-sm text-text-primary rounded-[var(--radius-sm)] hover:bg-bg-tertiary transition-colors"
            >
              {saved ? "Saved!" : "Save Model Preference"}
            </button>
          </div>
        </div>

        {/* Security Note */}
        <div className="flex items-start gap-2 p-3 bg-bg-elevated rounded-[var(--radius-sm)] border border-border">
          <Shield size={14} className="text-accent mt-0.5 shrink-0" />
          <p className="text-xs text-text-muted">
            Your account is secured with end-to-end encryption. API calls are
            routed through our secure proxy — you never need to manage API keys.
          </p>
        </div>

        {/* Logout */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-error hover:bg-error/10 rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
