import { useAgentStore } from "@/stores/agentStore";
import { ShieldAlert, Check, X, ShieldCheck, ShieldOff } from "lucide-react";

export function ApprovalDialog() {
  const pending = useAgentStore((s) => s.pendingApproval);
  const decidePermission = useAgentStore((s) => s.decidePermission);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-bg-secondary border border-border rounded-[var(--radius-md)] shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-warning/5">
          <ShieldAlert size={20} className="text-warning" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">需要授权</h3>
            <p className="text-xs text-text-muted">
              工具 <span className="font-mono text-warning">{pending.toolName}</span> 需要你的授权
            </p>
          </div>
        </div>

        {/* Input Preview */}
        <div className="px-5 py-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">工具输入</p>
          <pre className="text-xs bg-bg-primary border border-border rounded p-3 overflow-x-auto max-h-40 font-mono text-text-secondary">
            {JSON.stringify(pending.input, null, 2)}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex items-center flex-wrap gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={() => decidePermission(pending.toolName, "allow")}
            className="flex items-center gap-1.5 px-3 py-2 bg-success/20 text-success text-xs font-medium rounded-[var(--radius-sm)] hover:bg-success/30 transition-colors"
          >
            <Check size={12} /> 允许一次
          </button>
          <button
            onClick={() => decidePermission(pending.toolName, "allow_always")}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent/20 text-accent text-xs font-medium rounded-[var(--radius-sm)] hover:bg-accent/30 transition-colors"
          >
            <ShieldCheck size={12} /> 始终允许
          </button>
          <div className="flex-1" />
          <button
            onClick={() => decidePermission(pending.toolName, "deny")}
            className="flex items-center gap-1.5 px-3 py-2 bg-error/20 text-error text-xs font-medium rounded-[var(--radius-sm)] hover:bg-error/30 transition-colors"
          >
            <X size={12} /> 拒绝
          </button>
          <button
            onClick={() => decidePermission(pending.toolName, "deny_always")}
            className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated text-text-muted text-xs rounded-[var(--radius-sm)] hover:bg-bg-hover transition-colors"
          >
            <ShieldOff size={12} /> 始终拒绝
          </button>
        </div>
      </div>
    </div>
  );
}
