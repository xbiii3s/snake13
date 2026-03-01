import { Bot } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

export function AgentToggle({ enabled, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
        enabled
          ? "bg-accent/20 text-accent border border-accent/30"
          : "bg-bg-elevated text-text-muted border border-border hover:border-accent/20 hover:text-text-secondary",
      )}
      title={enabled ? "智能体已开启 — 点击关闭" : "启用智能体模式"}
    >
      <Bot size={12} />
      <span>智能体 {enabled ? "开" : "关"}</span>
    </button>
  );
}
