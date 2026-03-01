import { useState, useEffect, useCallback } from "react";
import { X, Key, Globe, Palette, Keyboard, Bot, Settings, Plug, BarChart3, Save } from "lucide-react";
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

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof Key }> = [
  { id: "api", label: "API", icon: Key },
  { id: "proxy", label: "代理", icon: Globe },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "shortcuts", label: "快捷键", icon: Keyboard },
  { id: "agent", label: "智能体", icon: Bot },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "usage", label: "用量", icon: BarChart3 },
  { id: "general", label: "通用", icon: Settings },
];

export function SettingsPanel({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-bg-primary border border-border rounded-[var(--radius-lg)] w-[700px] h-[500px] flex overflow-hidden shadow-2xl">
        {/* Settings sidebar */}
        <div className="w-[180px] bg-bg-secondary border-r border-border p-3 space-y-1">
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-sm font-semibold text-text-primary">设置</span>
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
    { keys: "\u2318 N", action: "新建对话", description: "创建新对话" },
    { keys: "\u2318 W", action: "关闭标签页", description: "关闭当前标签页" },
    { keys: "\u2318 K", action: "搜索", description: "打开搜索 / 快捷窗口" },
    { keys: "\u2318 ,", action: "设置", description: "打开设置面板" },
    { keys: "\u2318 \u21e7 Space", action: "快捷窗口", description: "全局快捷提问（最小化时可用）" },
    { keys: "Enter", action: "发送消息", description: "发送当前消息" },
    { keys: "Shift+Enter", action: "换行", description: "插入换行" },
    { keys: "Escape", action: "取消 / 关闭", description: "取消生成或关闭面板" },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">键盘快捷键</h3>
      <p className="text-xs text-text-muted mb-4">
        全局快捷键在应用后台运行时仍然有效。
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
  { key: "fs_read", name: "文件读取", defaultLevel: "auto" },
  { key: "fs_write", name: "文件写入", defaultLevel: "approval" },
  { key: "fs_list", name: "文件列表", defaultLevel: "auto" },
  { key: "fs_search", name: "文件搜索", defaultLevel: "auto" },
  { key: "shell_exec", name: "终端执行", defaultLevel: "approval" },
  { key: "web_search", name: "网络搜索", defaultLevel: "auto" },
  { key: "web_fetch", name: "网络请求", defaultLevel: "auto" },
  { key: "clipboard_read", name: "剪贴板读取", defaultLevel: "auto" },
  { key: "clipboard_write", name: "剪贴板写入", defaultLevel: "auto" },
  { key: "notification_send", name: "通知", defaultLevel: "auto" },
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
      <h3 className="text-lg font-semibold mb-4">智能体配置</h3>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-text-secondary block mb-1">工作区路径</label>
          <input
            type="text"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 font-mono"
          />
          <p className="text-xs text-text-muted mt-1">智能体工具仅限在此目录中运行</p>
        </div>
        <div>
          <label className="text-sm text-text-secondary block mb-2">工具权限</label>
          <div className="space-y-1">
            {TOOL_PERMISSIONS.map((tool) => (
              <div key={tool.key} className="flex items-center justify-between py-1.5 border-b border-border/30">
                <span className="text-sm text-text-primary">{tool.name}</span>
                <select
                  value={toolLevels[tool.key] ?? tool.defaultLevel}
                  onChange={(e) => setToolLevels((prev) => ({ ...prev, [tool.key]: e.target.value }))}
                  className="bg-bg-elevated border border-border rounded text-xs px-2 py-1 text-text-primary outline-none focus:border-accent/50"
                >
                  <option value="auto">自动</option>
                  <option value="approval">审批</option>
                  <option value="denied">禁止</option>
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
            {saved ? "已保存！" : "保存设置"}
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
      <h3 className="text-lg font-semibold mb-4">通用</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm text-text-primary block">开机自动启动</span>
            <span className="text-xs text-text-muted">启动时最小化到菜单栏</span>
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
            <span className="text-sm text-text-primary block">语言</span>
            <span className="text-xs text-text-muted">界面语言</span>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-bg-elevated border border-border rounded text-sm px-3 py-1.5 text-text-primary outline-none focus:border-accent/50"
          >
            <option value="zh">中文</option>
            <option value="en">英文</option>
          </select>
        </div>

        <div className="pt-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-text-inverse text-sm rounded-[var(--radius-sm)] hover:bg-accent-hover transition-colors"
          >
            <Save size={14} />
            {saved ? "已保存！" : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
