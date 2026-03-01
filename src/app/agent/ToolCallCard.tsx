import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Loader, Clock } from "lucide-react";
import type { ToolCall } from "@/stores/agentStore";
import { cn } from "@/lib/cn";

interface Props {
  call: ToolCall;
}

export function ToolCallCard({ call }: Props) {
  const [expanded, setExpanded] = useState(false);
  const duration = call.completedAt
    ? ((call.completedAt - call.startedAt) / 1000).toFixed(1)
    : null;

  const statusIcon = {
    pending_approval: <Clock size={14} className="text-warning animate-pulse" />,
    running: <Loader size={14} className="text-accent animate-spin" />,
    completed: <CheckCircle size={14} className="text-success" />,
    error: <XCircle size={14} className="text-error" />,
  }[call.status];

  const statusColor = {
    pending_approval: "border-warning/30 bg-warning/5",
    running: "border-accent/30 bg-accent/5",
    completed: "border-success/30 bg-success/5",
    error: "border-error/30 bg-error/5",
  }[call.status];

  return (
    <div className={cn("border rounded-[var(--radius-sm)] my-2 text-sm", statusColor)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {statusIcon}
        <span className="font-mono text-xs font-medium">{call.toolName}</span>
        {duration && (
          <span className="text-[10px] text-text-muted ml-auto">{duration}s</span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">输入</p>
            <pre className="text-xs bg-bg-primary rounded p-2 overflow-x-auto max-h-32 font-mono text-text-secondary">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {call.output && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">输出</p>
              <pre className={cn(
                "text-xs bg-bg-primary rounded p-2 overflow-x-auto max-h-48 font-mono",
                call.output.is_error ? "text-error" : "text-text-secondary",
              )}>
                {call.output.content}
              </pre>
            </div>
          )}
          {call.error && (
            <p className="text-xs text-error">{call.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
