import { useState, useEffect, useCallback } from "react";
import { BarChart3, Zap, DollarSign, MessageSquare, RefreshCw } from "lucide-react";
import * as ipc from "@/lib/ipc";
import type { UsageSummary, DailyUsage } from "@/lib/ipc";

type DateRange = "7d" | "30d" | "all";

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0] ?? "2026-01-01";

  if (range === "all") {
    return { from: "2020-01-01", to: "2099-12-31" };
  }

  const days = range === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().split("T")[0] ?? "2020-01-01", to };
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function getModelDisplayName(modelId: string): string {
  if (modelId.includes("opus")) return "Claude Opus";
  if (modelId.includes("sonnet")) return "Claude Sonnet";
  if (modelId.includes("haiku")) return "Claude Haiku";
  if (modelId === "all") return "All Models";
  return modelId;
}

function getModelColor(modelId: string): string {
  if (modelId.includes("opus")) return "text-purple-400";
  if (modelId.includes("sonnet")) return "text-accent";
  if (modelId.includes("haiku")) return "text-emerald-400";
  return "text-text-secondary";
}

function getModelBarColor(modelId: string): string {
  if (modelId.includes("opus")) return "bg-purple-400";
  if (modelId.includes("sonnet")) return "bg-accent";
  if (modelId.includes("haiku")) return "bg-emerald-400";
  return "bg-text-muted";
}

export function UsagePanel() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [totalUsage, setTotalUsage] = useState<UsageSummary | null>(null);
  const [modelSummary, setModelSummary] = useState<UsageSummary[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(dateRange);
      const [total, summary, daily] = await Promise.all([
        ipc.usageTotal(),
        ipc.usageSummary(from, to),
        ipc.usageDaily(from, to),
      ]);
      setTotalUsage(total);
      setModelSummary(summary);
      setDailyUsage(daily);
    } catch (err) {
      console.error("Failed to load usage data:", err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxDailyCost = Math.max(...dailyUsage.map((d) => d.cost), 0.001);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Token Usage</h3>
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-elevated border border-border rounded-[var(--radius-sm)] overflow-hidden">
            {(["7d", "30d", "all"] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1 text-xs transition-colors ${
                  dateRange === range
                    ? "bg-accent text-text-inverse"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "All Time"}
              </button>
            ))}
          </div>
          <button
            onClick={loadData}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Total Summary Cards */}
      {totalUsage && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-bg-elevated border border-border rounded-[var(--radius-md)] p-3">
            <div className="flex items-center gap-1.5 text-text-muted mb-1">
              <Zap size={12} />
              <span className="text-xs">Total Tokens</span>
            </div>
            <div className="text-lg font-semibold text-text-primary">
              {formatTokenCount(totalUsage.total_input_tokens + totalUsage.total_output_tokens)}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {formatTokenCount(totalUsage.total_input_tokens)} in / {formatTokenCount(totalUsage.total_output_tokens)} out
            </div>
          </div>

          <div className="bg-bg-elevated border border-border rounded-[var(--radius-md)] p-3">
            <div className="flex items-center gap-1.5 text-text-muted mb-1">
              <DollarSign size={12} />
              <span className="text-xs">Total Cost</span>
            </div>
            <div className="text-lg font-semibold text-accent">
              {formatCost(totalUsage.total_cost)}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              all time
            </div>
          </div>

          <div className="bg-bg-elevated border border-border rounded-[var(--radius-md)] p-3">
            <div className="flex items-center gap-1.5 text-text-muted mb-1">
              <MessageSquare size={12} />
              <span className="text-xs">Messages</span>
            </div>
            <div className="text-lg font-semibold text-text-primary">
              {totalUsage.message_count.toLocaleString()}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              total requests
            </div>
          </div>
        </div>
      )}

      {/* Per-Model Breakdown */}
      {modelSummary.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-text-secondary mb-2">By Model</h4>
          <div className="space-y-2">
            {modelSummary.map((model) => {
              const totalTokens = model.total_input_tokens + model.total_output_tokens;
              const allTokens = modelSummary.reduce(
                (sum, m) => sum + m.total_input_tokens + m.total_output_tokens,
                0,
              );
              const percentage = allTokens > 0 ? (totalTokens / allTokens) * 100 : 0;

              return (
                <div
                  key={model.model_id}
                  className="bg-bg-elevated border border-border rounded-[var(--radius-md)] p-3"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${getModelColor(model.model_id)}`}>
                        {getModelDisplayName(model.model_id)}
                      </span>
                      <span className="text-xs text-text-muted">
                        {model.message_count} requests
                      </span>
                    </div>
                    <span className="text-sm font-medium text-text-primary">
                      {formatCost(model.total_cost)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getModelBarColor(model.model_id)}`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-muted w-16 text-right">
                      {formatTokenCount(totalTokens)}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1.5">
                    <span className="text-xs text-text-muted">
                      In: {formatTokenCount(model.total_input_tokens)}
                    </span>
                    <span className="text-xs text-text-muted">
                      Out: {formatTokenCount(model.total_output_tokens)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Usage Chart */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 size={14} className="text-text-muted" />
          <h4 className="text-sm font-medium text-text-secondary">Daily Usage</h4>
        </div>
        {dailyUsage.length > 0 ? (
          <div className="bg-bg-elevated border border-border rounded-[var(--radius-md)] p-3">
            <div className="flex items-end gap-[2px] h-[100px]">
              {dailyUsage.map((day) => {
                const height = Math.max((day.cost / maxDailyCost) * 100, 2);
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center justify-end group relative"
                  >
                    <div
                      className="w-full bg-accent/70 hover:bg-accent rounded-t-sm transition-colors cursor-default min-w-[3px]"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${formatCost(day.cost)} | ${formatTokenCount(day.input_tokens + day.output_tokens)} tokens`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-text-muted">
              <span>{dailyUsage[0]?.date}</span>
              <span>{dailyUsage[dailyUsage.length - 1]?.date}</span>
            </div>
          </div>
        ) : (
          <div className="bg-bg-elevated border border-border rounded-[var(--radius-md)] p-6 text-center">
            <p className="text-sm text-text-muted">No usage data for this period</p>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!loading && modelSummary.length === 0 && (
        <div className="text-center py-4">
          <p className="text-sm text-text-muted">
            No usage data yet. Start a conversation to track your token usage.
          </p>
        </div>
      )}
    </div>
  );
}
