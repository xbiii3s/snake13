import { useState, useEffect } from "react";
import { useMcpStore, type McpServerInfo } from "@/stores/mcpStore";
import { Plus, Trash2, Power, PowerOff, Upload, RefreshCw, Wrench } from "lucide-react";

export function McpConfig() {
  const { servers, loading, loadServers, addServer, removeServer, connectServer, disconnectServer, importConfig } =
    useMcpStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleAdd = async () => {
    if (!newName.trim() || !newCommand.trim()) return;
    await addServer({
      id: crypto.randomUUID(),
      name: newName.trim(),
      command: newCommand.trim(),
      args: newArgs
        .split(" ")
        .map((s) => s.trim())
        .filter(Boolean),
      env: [],
      auto_start: false,
    });
    setNewName("");
    setNewCommand("");
    setNewArgs("");
    setShowAddForm(false);
  };

  const handleImport = async () => {
    if (!importJson.trim()) return;
    try {
      await importConfig(importJson.trim());
      setImportJson("");
      setShowImport(false);
    } catch (err) {
      console.error("Import failed:", err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">MCP 服务器</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadServers()}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors rounded hover:bg-bg-hover"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-1 text-xs px-2 py-1 text-text-muted hover:text-text-primary transition-colors rounded hover:bg-bg-hover"
          >
            <Upload size={12} />
            导入
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors"
          >
            <Plus size={12} />
            添加
          </button>
        </div>
      </div>

      {/* Import section */}
      {showImport && (
        <div className="mb-4 p-3 bg-bg-elevated rounded-[var(--radius-sm)] border border-border">
          <p className="text-xs text-text-muted mb-2">
            粘贴你的 Claude Desktop 配置 JSON（claude_desktop_config.json）
          </p>
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"mcpServers": { ... }}'
            className="w-full bg-bg-primary border border-border rounded text-xs p-2 text-text-primary outline-none focus:border-accent/50 font-mono h-24 resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setShowImport(false)}
              className="text-xs px-3 py-1 text-text-muted hover:text-text-primary"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={!importJson.trim()}
              className="text-xs px-3 py-1 bg-accent text-text-inverse rounded disabled:opacity-50"
            >
              导入
            </button>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="mb-4 p-3 bg-bg-elevated rounded-[var(--radius-sm)] border border-border space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="服务器名称"
            className="w-full bg-bg-primary border border-border rounded text-sm px-3 py-1.5 text-text-primary outline-none focus:border-accent/50"
          />
          <input
            type="text"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            placeholder="命令（如 npx、node、python）"
            className="w-full bg-bg-primary border border-border rounded text-sm px-3 py-1.5 text-text-primary outline-none focus:border-accent/50"
          />
          <input
            type="text"
            value={newArgs}
            onChange={(e) => setNewArgs(e.target.value)}
            placeholder="参数（空格分隔）"
            className="w-full bg-bg-primary border border-border rounded text-sm px-3 py-1.5 text-text-primary outline-none focus:border-accent/50"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="text-xs px-3 py-1 text-text-muted hover:text-text-primary"
            >
              取消
            </button>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newCommand.trim()}
              className="text-xs px-3 py-1 bg-accent text-text-inverse rounded disabled:opacity-50"
            >
              添加服务器
            </button>
          </div>
        </div>
      )}

      {/* Server list */}
      <div className="space-y-2">
        {servers.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            尚未配置 MCP 服务器。可添加新服务器或从 Claude Desktop 导入。
          </div>
        ) : (
          servers.map((server) => (
            <ServerCard
              key={server.config.id}
              server={server}
              onConnect={() => connectServer(server.config.id)}
              onDisconnect={() => disconnectServer(server.config.id)}
              onRemove={() => removeServer(server.config.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onConnect,
  onDisconnect,
  onRemove,
}: {
  server: McpServerInfo;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = {
    disconnected: "text-text-muted",
    connecting: "text-warning",
    connected: "text-success",
    error: "text-error",
  }[server.status];

  const statusDot = {
    disconnected: "bg-text-muted",
    connecting: "bg-warning animate-pulse",
    connected: "bg-success",
    error: "bg-error",
  }[server.status];

  return (
    <div className="border border-border rounded-[var(--radius-sm)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-sm font-medium text-text-primary">{server.config.name}</span>
          <span className={`text-[10px] ${statusColor}`}>
            {server.status === "disconnected" ? "未连接" : server.status === "connecting" ? "连接中" : server.status === "connected" ? "已连接" : server.status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {server.status === "connected" ? (
            <button
              onClick={onDisconnect}
              className="p-1.5 text-text-muted hover:text-error transition-colors rounded hover:bg-bg-hover"
              title="断开连接"
            >
              <PowerOff size={12} />
            </button>
          ) : (
            <button
              onClick={onConnect}
              className="p-1.5 text-text-muted hover:text-success transition-colors rounded hover:bg-bg-hover"
              title="连接"
              disabled={server.status === "connecting"}
            >
              <Power size={12} />
            </button>
          )}
          <button
            onClick={onRemove}
            className="p-1.5 text-text-muted hover:text-error transition-colors rounded hover:bg-bg-hover"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Command info */}
      <div className="mt-1 text-[10px] text-text-muted font-mono truncate">
        {server.config.command} {server.config.args.join(" ")}
      </div>

      {/* Error message */}
      {server.error && (
        <div className="mt-1 text-[10px] text-error truncate">{server.error}</div>
      )}

      {/* Tools */}
      {server.tools.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary"
          >
            <Wrench size={10} />
            {server.tools.length} 个工具
          </button>
          {expanded && (
            <div className="mt-1 space-y-1 pl-3">
              {server.tools.map((tool) => (
                <div key={tool.name} className="text-[10px]">
                  <span className="text-accent font-mono">{tool.name}</span>
                  {tool.description && (
                    <span className="text-text-muted ml-1">— {tool.description}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Server info */}
      {server.server_info && (
        <div className="mt-1 text-[10px] text-text-muted">
          Server: {server.server_info.name} v{server.server_info.version}
        </div>
      )}
    </div>
  );
}
