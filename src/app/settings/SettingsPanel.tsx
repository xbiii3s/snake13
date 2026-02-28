import { useState } from "react";
import { X, Key, Globe, Palette, Keyboard, Bot, Settings, Plug } from "lucide-react";
import { ApiConfig } from "./ApiConfig";
import { ProxyConfig } from "./ProxyConfig";
import { AppearanceConfig } from "./AppearanceConfig";
import { McpConfig } from "./McpConfig";

interface Props {
  onClose: () => void;
}

type SettingsTab = "api" | "proxy" | "appearance" | "shortcuts" | "agent" | "mcp" | "general";

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof Key }> = [
  { id: "api", label: "API", icon: Key },
  { id: "proxy", label: "Proxy", icon: Globe },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "mcp", label: "MCP", icon: Plug },
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
          {activeTab === "shortcuts" && <ShortcutsPlaceholder />}
          {activeTab === "agent" && <AgentPlaceholder />}
          {activeTab === "mcp" && <McpConfig />}
          {activeTab === "general" && <GeneralPlaceholder />}
        </div>
      </div>
    </div>
  );
}

function ShortcutsPlaceholder() {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
      <div className="space-y-3">
        {[
          { keys: "⌘ N", action: "New conversation" },
          { keys: "⌘ W", action: "Close tab" },
          { keys: "⌘ K", action: "Search" },
          { keys: "⌘ ,", action: "Settings" },
          { keys: "⌘ ⇧ Space", action: "Spotlight" },
          { keys: "Escape", action: "Cancel/Close" },
        ].map((s) => (
          <div key={s.keys} className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-text-secondary">{s.action}</span>
            <kbd className="px-2 py-1 bg-bg-elevated rounded text-xs font-mono text-text-muted">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentPlaceholder() {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Agent Configuration</h3>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-text-secondary block mb-1">Workspace Path</label>
          <input
            type="text"
            defaultValue="~/.cdp/workspace"
            className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-sm text-text-secondary block mb-2">Default Tool Permissions</label>
          <div className="space-y-2">
            {[
              { name: "File Read", level: "auto" },
              { name: "File Write", level: "approval" },
              { name: "Shell Execute", level: "approval" },
              { name: "Web Search", level: "auto" },
              { name: "Clipboard", level: "auto" },
              { name: "Notifications", level: "auto" },
            ].map((tool) => (
              <div key={tool.name} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-text-primary">{tool.name}</span>
                <select
                  defaultValue={tool.level}
                  className="bg-bg-elevated border border-border rounded text-xs px-2 py-1 text-text-primary outline-none"
                >
                  <option value="auto">Auto</option>
                  <option value="approval">Approval</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralPlaceholder() {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">General</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm text-text-primary block">Launch at startup</span>
            <span className="text-xs text-text-muted">Start minimized to menu bar</span>
          </div>
          <button className="w-10 h-5 rounded-full bg-bg-elevated border border-border relative transition-colors">
            <div className="w-4 h-4 rounded-full bg-text-muted absolute top-0.5 left-0.5 transition-transform" />
          </button>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm text-text-primary block">Language</span>
            <span className="text-xs text-text-muted">Interface language</span>
          </div>
          <select className="bg-bg-elevated border border-border rounded text-sm px-3 py-1.5 text-text-primary outline-none">
            <option value="zh">Chinese</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </div>
  );
}
