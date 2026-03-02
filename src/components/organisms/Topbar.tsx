import { useChatStore } from "@/stores/chatStore";
import { useTabStore } from "@/stores/tabStore";
import { useUIStore } from "@/stores/uiStore";
import { useAgentStore } from "@/stores/agentStore";
import { MODELS } from "@/types/model";
import { Wifi, Settings, PanelRightOpen, PanelRightClose, Bot, Home, MessageCircle, Code } from "lucide-react";

export function Topbar() {
  const activeConv = useChatStore((s) =>
    s.activeConversationId
      ? s.conversations.find((c) => c.id === s.activeConversationId) ?? null
      : null
  );
  const lastUsage = useChatStore((s) => s.lastUsage);
  const clearActiveConversation = useChatStore((s) => s.clearActiveConversation);
  const clearActiveTab = useTabStore((s) => s.clearActiveTab);

  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const artifactPanelOpen = useUIStore((s) => s.artifactPanelOpen);
  const toggleArtifactPanel = useUIStore((s) => s.toggleArtifactPanel);

  const agentEnabled = useAgentStore((s) => s.enabled);
  const agentTools = useAgentStore((s) => s.tools);

  const model = MODELS.find((m) => m.id === activeConv?.model_id);

  const handleGoHome = () => {
    clearActiveConversation();
    clearActiveTab();
  };

  return (
    <div
      className="h-[52px] flex items-center justify-between px-4 border-b border-border flex-shrink-0"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2">
        {/* Home button */}
        <button
          onClick={handleGoHome}
          className="p-1.5 text-text-muted hover:text-accent hover:bg-bg-hover transition-colors rounded-[var(--radius-sm)]"
          title="回到首页 (⌘⇧H)"
        >
          <Home size={14} />
        </button>

        {/* Mode tabs: Chat (active) / Code (coming soon) */}
        <div className="flex items-center gap-0.5 bg-bg-elevated rounded-[var(--radius-sm)] p-0.5">
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[var(--radius-xs)] bg-accent/10 text-accent"
          >
            <MessageCircle size={12} />
            Chat
          </button>
          <button
            disabled
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[var(--radius-xs)] text-text-muted opacity-50 cursor-not-allowed"
            title="即将推出"
          >
            <Code size={12} />
            Code
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-border" />

        {/* Current title / breadcrumb */}
        <span className="text-sm text-text-secondary truncate max-w-[300px]">
          {activeConv?.title ?? "首页"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Agent status */}
        {agentEnabled && (
          <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full">
            <Bot size={10} />
            智能体（{agentTools.length} 个工具）
          </span>
        )}

        {/* Model badge */}
        {model && (
          <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-bg-elevated text-text-muted">
            {model.name}
          </span>
        )}

        {/* Usage info */}
        {lastUsage && (
          <span className="text-[10px] text-text-muted">
            {lastUsage.input_tokens}↑ {lastUsage.output_tokens}↓ · ${lastUsage.cost.toFixed(4)}
          </span>
        )}

        {/* Artifact panel toggle */}
        <button
          onClick={toggleArtifactPanel}
          className={`p-1.5 transition-colors rounded hover:bg-bg-hover ${
            artifactPanelOpen ? "text-accent" : "text-text-muted hover:text-text-secondary"
          }`}
          title="切换 Artifact 面板"
        >
          {artifactPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>

        {/* Connection status */}
        <div className="flex items-center gap-1" title="连接正常" aria-label="连接状态">
          <Wifi size={12} className="text-success" />
        </div>

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded hover:bg-bg-hover"
          title="设置 (⌘,)"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}
