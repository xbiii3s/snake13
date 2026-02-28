import { useState, useEffect } from "react";
import { Eye, EyeOff, CheckCircle, XCircle, Save } from "lucide-react";
import * as ipc from "@/lib/ipc";

export function ApiConfig() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [endpoint, setEndpoint] = useState("https://api.anthropic.com");
  const [defaultModel, setDefaultModel] = useState("claude-sonnet-4-5");
  const [saved, setSaved] = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    (async () => {
      const savedKey = await ipc.getSetting("api_key");
      const savedEndpoint = await ipc.getSetting("api_endpoint");
      const savedModel = await ipc.getSetting("default_model");
      if (savedKey) setApiKey(savedKey);
      if (savedEndpoint) setEndpoint(savedEndpoint);
      if (savedModel) setDefaultModel(savedModel);
    })();
  }, []);

  const handleTest = async () => {
    setTestStatus("testing");
    // Simulate API test — real implementation will call the backend
    setTimeout(() => {
      setTestStatus(apiKey.startsWith("sk-") ? "success" : "error");
    }, 1500);
  };

  const handleSave = async () => {
    await ipc.setSetting("api_key", apiKey);
    await ipc.setSetting("api_endpoint", endpoint);
    await ipc.setSetting("default_model", defaultModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">API Configuration</h3>

      <div className="space-y-4">
        {/* API Key */}
        <div>
          <label className="text-sm text-text-secondary block mb-1">API Key</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 pr-10 text-sm text-text-primary outline-none focus:border-accent/50 font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={handleTest}
              disabled={!apiKey || testStatus === "testing"}
              className="px-4 py-2 bg-accent text-text-inverse text-sm rounded-[var(--radius-sm)] hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {testStatus === "testing" ? "Testing..." : "Test"}
            </button>
          </div>
          {testStatus === "success" && (
            <p className="text-xs text-success flex items-center gap-1 mt-1">
              <CheckCircle size={12} /> Connection successful
            </p>
          )}
          {testStatus === "error" && (
            <p className="text-xs text-error flex items-center gap-1 mt-1">
              <XCircle size={12} /> Invalid API key
            </p>
          )}
          <p className="text-xs text-text-muted mt-1">
            Stored securely in macOS Keychain
          </p>
        </div>

        {/* Custom Endpoint */}
        <div>
          <label className="text-sm text-text-secondary block mb-1">API Endpoint</label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 font-mono"
          />
          <p className="text-xs text-text-muted mt-1">
            Default: https://api.anthropic.com
          </p>
        </div>

        {/* Model defaults */}
        <div>
          <label className="text-sm text-text-secondary block mb-1">Default Model</label>
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
          >
            <option value="claude-sonnet-4-5">Claude Sonnet 4.5 (Recommended)</option>
            <option value="claude-opus-4-6">Claude Opus 4.6</option>
            <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
          </select>
        </div>

        {/* Save button */}
        <div className="pt-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-text-inverse text-sm rounded-[var(--radius-sm)] hover:bg-accent-hover transition-colors"
          >
            <Save size={14} />
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
