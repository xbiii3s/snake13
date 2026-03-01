import { useState, useEffect, useCallback } from "react";
import { X, User, Globe, Palette, Keyboard, Bot, Settings, Plug, BarChart3, Save } from "lucide-react";
import * as ipc from "@/lib/ipc";
import { ApiConfig } from "./ApiConfig";
import { ProxyConfig } from "./ProxyConfig";
import { AppearanceConfig } from "./AppearanceConfig";
import { McpConfig } from "./McpConfig";
import { UsagePanel } from "./UsagePanel";

interface Props {
  onClose: () => void;
}

type SettingsTab = "api" | "proxy" | "appearance" | "shortcuts" | "agent" | "mcp" | "usage" | "general";

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof User }> = [
  { id: "api", label: "Account", icon: User },
  { id: "proxy", label: "Proxy", icon: Globe },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "usage", label: "Usage", icon: BarChart3 },
  { id: "general", label: "General", icon: Settings },
];

export function SettingsPanel({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-bg-primary border border-border rounded-[var(--radius-lg)] w-[700px] h-[500px] flex overflow-hidden shadow-2xl">
        {/* Settings sidebar */}
        <div className="w-[180px] bg-bg-secondary border-r border-border p-3 space-y-1">
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-sm font-semibold text-text-primary">Settings</span>
            <button
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Settings content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === "api" && <ApiConfig />}
          {activeTab === "proxy" && <ProxyConfig />}
          {activeTab === "appearance" && <AppearanceConfig />}
          {activeTab === "shortcuts" && <ShortcutsConfig />}
          {activeTab === "agent" && <AgentConfig />}
          {activeTab === "mcp" && <McpConfig />}
          {activeTab === "usage" && <UsagePanel />}
          {activeTab === "general" && <GeneralConfig />}
        </div>
      </div>
    </div>
  );
}

function ShortcutsConfig() {
  const SHORTCUTS = [
    { keys: "\u2318 N", action: "New conversation", description: "Create a new chat" },
    { keys: "\u2318 W", action: "Close tab", description: "Close the current tab" },
    { keys: "\u2318 K", action: "Search", description: "Open search / spotlight" },
    { keys: "\u2318 ,", action: "Settings", description: "Open settings panel" },
    { keys: "\u2318 \u21e7 Space", action: "Spotlight", description: "Global quick-ask (works when minimized)" },
    { keys: "Enter", action: "Send message", description: "Send the current message" },
    { keys: "Shift+Enter", action: "New line", description: "Insert a line break" },
    { keys: "Escape", action: "Cancel / Close", description: "Cancel streaming or close panels" },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
      <p className="text-xs text-text-muted mb-4">
        Global shortcuts work even when the app is in the background.
      </p>
      <div className="space-y-1">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between py-2.5 border-b border-border/50">
            <div>
              <span className="text-sm text-text-primary">{s.action}</span>
              <span className="text-xs text-text-muted block mt-0.5">{s.description}</span>
            </div>
            <kbd className="px-2.5 py-1 bg-bg-elevated border border-border rounded-[var(--radius-sm)] text-xs font-mono text-text-secondary min-w-[80px] text-center">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

const TOOL_PERMISSIONS = [
  { key: "fs_read", name: "File Read", defaultLevel: "auto" },
  { key: "fs_write", name: "File Write", defaultLevel: "approval" },
  { key: "fs_list", name: "File List", defaultLevel: "auto" },
  { key: "fs_search", name: "File Search", defaultLevel: "auto" },
  { key: "shell_exec", name: "Shell Execute", defaultLevel: "approval" },
  { key: "web_search", name: "Web Search", defaultLevel: "auto" },
  { key: "web_fetch", name: "Web Fetch", defaultLevel: "auto" },
  { key: "clipboard_read", name: "Clipboard Read", defaultLevel: "auto" },
  { key: "clipboard_write", name: "Clipboard Write", defaultLevel: "auto" },
  { key: "notification_send", name: "Notifications", defaultLevel: "auto" },
];

function AgentConfig() {
  const [workspacePath, setWorkspacePath] = useState("~/.cdp/workspace");
  const [toolLevels, setToolLevels] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const savedPath = await ipc.getSetting("agent_workspace");
      if (savedPath) setWorkspacePath(savedPath);

      const levels: Record<string, string> = {};
      for (const tool of TOOL_PERMISSIONS) {
        const level = await ipc.getSetting(`tool_perm_${tool.key}`);
        levels[tool.key] = level ?? tool.defaultLevel;
      }
      setToolLevels(levels);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    await ipc.setSetting("agent_workspace", workspacePath);
    for (const [key, level] of Object.entries(toolLevels)) {
      await ipc.setSetting(`tool_perm_${key}`, level);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [workspacePath, toolLevels]);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Agent Configuration</h3>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-text-secondary block mb-1">Workspace Path</label>
          <input
            type="text"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 font-mono"
          />
          <p className="text-xs text-text-muted mt-1">Agent tools are sandboxed to this directory</p>
        </div>
        <div>
          <label className="text-sm text-text-secondary block mb-2">Tool Permissions</label>
          <div className="space-y-1">
            {TOOL_PERMISSIONS.map((tool) => (
              <div key={tool.key} className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-sm text-text-primary">{tool.name}</span>
                <select
                  value={toolLevels[tool.key] ?? tool.defaultLevel}
                  onChange={(e) => setToolLevels((prev) => ({ ...prev, [tool.key]: e.target.value }))}
                  className="bg-bg-elevated border border-border rounded text-xs px-2 py-1 text-text-primary outline-none focus:border-accent/50"
                >
                  <option value="auto">Auto</option>
                  <option value="approval">Approval</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
            ))}
          </div>
        </div>
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

function GeneralConfig() {
  const [autoStart, setAutoStart] = useState(false);
  const [language, setLanguage] = useState("zh");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const isEnabled = await ipc.getAutostart();
        setAutoStart(isEnabled);
      } catch {
        // Fallback to settings store
        const savedAutoStart = await ipc.getSetting("auto_start");
        if (savedAutoStart) setAutoStart(savedAutoStart === "true");
      }
      const savedLang = await ipc.getSetting("language");
      if (savedLang) setLanguage(savedLang);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    // Actually enable/disable autostart via Tauri plugin
    try {
      await ipc.setAutostart(autoStart);
    } catch (e) {
      console.error("Failed to set autostart:", e);
    }
    await ipc.setSetting("auto_start", String(autoStart));
    await ipc.setSetting("language", language);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [autoStart, language]);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">General</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm text-text-primary block">Launch at startup</span>
            <span className="text-xs text-text-muted">Start minimized to menu bar</span>
          </div>
          <button
            onClick={() => setAutoStart(!autoStart)}
            className={`w-10 h-5 rounded-full relative transition-colors ${
              autoStart ? "bg-accent" : "bg-bg-elevated border border-border"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                autoStart ? "left-5.5 translate-x-0.5" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm text-text-primary block">Language</span>
            <span className="text-xs text-text-muted">Interface language</span>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-bg-elevated border border-border rounded text-sm px-3 py-1.5 text-text-primary outline-none focus:border-accent/50"
          >
            <option value="zh">Chinese</option>
            <option value="en">English</option>
          </select>
        </div>

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
