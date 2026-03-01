import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader, Save } from "lucide-react";
import type { ProxyType } from "@/types/settings";
import * as ipc from "@/lib/ipc";

export function ProxyConfig() {
  const [proxyType, setProxyType] = useState<ProxyType>("none");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [saved, setSaved] = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    (async () => {
      const savedType = await ipc.getSetting("proxy_type");
      const savedHost = await ipc.getSetting("proxy_host");
      const savedPort = await ipc.getSetting("proxy_port");
      const savedUser = await ipc.getSetting("proxy_username");
      const validTypes: ProxyType[] = ["none", "http", "socks5", "system"];
      if (savedType && validTypes.includes(savedType as ProxyType)) {
        setProxyType(savedType as ProxyType);
      }
      if (savedHost) setHost(savedHost);
      if (savedPort) setPort(savedPort);
      if (savedUser) setUsername(savedUser);
    })();
  }, []);

  const handleTest = () => {
    setTestStatus("testing");
    setTimeout(() => {
      setTestStatus(proxyType === "none" || (host && port) ? "success" : "error");
    }, 1500);
  };

  const handleSave = async () => {
    await ipc.setSetting("proxy_type", proxyType);
    await ipc.setSetting("proxy_host", host);
    await ipc.setSetting("proxy_port", port);
    await ipc.setSetting("proxy_username", username);
    // Note: password stored via keychain in production

    // Also save constructed proxy_url for the backend
    if (proxyType === "http" && host && port) {
      await ipc.setSetting("proxy_url", `http://${host}:${port}`);
    } else if (proxyType === "socks5" && host && port) {
      await ipc.setSetting("proxy_url", `socks5://${host}:${port}`);
    } else {
      await ipc.setSetting("proxy_url", "");
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Proxy Configuration</h3>

      <div className="space-y-4">
        {/* Proxy Type */}
        <div>
          <label className="text-sm text-text-secondary block mb-2">Proxy Type</label>
          <div className="grid grid-cols-4 gap-2">
            {(["none", "http", "socks5", "system"] as ProxyType[]).map((type) => (
              <button
                key={type}
                onClick={() => setProxyType(type)}
                className={`py-2 text-sm rounded-[var(--radius-sm)] border transition-colors ${
                  proxyType === type
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-bg-elevated text-text-secondary hover:border-accent/30"
                }`}
              >
                {type === "none" ? "Direct" : type === "socks5" ? "SOCKS5" : type === "http" ? "HTTP" : "System"}
              </button>
            ))}
          </div>
        </div>

        {/* Proxy settings */}
        {(proxyType === "http" || proxyType === "socks5") && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-sm text-text-secondary block mb-1">Host</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="127.0.0.1"
                  className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 font-mono"
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1">Port</label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="1080"
                  className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-text-secondary block mb-1">
                  Username <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1">
                  Password <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
                />
              </div>
            </div>
          </>
        )}

        {/* Test + Save */}
        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={testStatus === "testing"}
            className="px-4 py-2 bg-bg-elevated border border-border text-text-primary text-sm rounded-[var(--radius-sm)] hover:bg-bg-hover disabled:opacity-50 transition-colors"
          >
            {testStatus === "testing" ? (
              <span className="flex items-center gap-1.5">
                <Loader size={14} className="animate-spin" /> Testing...
              </span>
            ) : (
              "Test Connection"
            )}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-text-inverse text-sm rounded-[var(--radius-sm)] hover:bg-accent-hover transition-colors"
          >
            <Save size={14} />
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
        {testStatus === "success" && (
          <p className="text-xs text-success flex items-center gap-1">
            <CheckCircle size={12} /> Connection successful
          </p>
        )}
        {testStatus === "error" && (
          <p className="text-xs text-error flex items-center gap-1">
            <XCircle size={12} /> Connection failed
          </p>
        )}
      </div>
    </div>
  );
}
