import { create } from "zustand";
import * as ipc from "@/lib/ipc";
import type { ToolDefinition, ToolOutput, PermissionDecision } from "@/lib/ipc";

export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  status: "pending_approval" | "running" | "completed" | "error";
  output?: ToolOutput;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

interface AgentState {
  enabled: boolean;
  tools: ToolDefinition[];
  activeCalls: ToolCall[];
  pendingApproval: ToolCall | null;

  setEnabled: (enabled: boolean) => void;
  loadTools: () => Promise<void>;
  executeTool: (toolName: string, input: unknown) => Promise<ToolOutput | null>;
  decidePermission: (toolName: string, decision: PermissionDecision) => Promise<void>;
  clearCalls: () => void;
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  enabled: false,
  tools: [],
  activeCalls: [],
  pendingApproval: null,

  setEnabled: (enabled) => {
    set({ enabled });
    if (enabled && get().tools.length === 0) {
      get().loadTools();
    }
  },

  loadTools: async () => {
    try {
      const tools = await ipc.agentListTools();
      set({ tools });
    } catch (err) {
      console.error("Failed to load tools:", err);
    }
  },

  executeTool: async (toolName, input) => {
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const call: ToolCall = {
      id: callId,
      toolName,
      input,
      status: "running",
      startedAt: Date.now(),
    };

    set((s) => ({ activeCalls: [...s.activeCalls, call] }));

    try {
      const output = await ipc.agentExecuteTool(toolName, input);
      set((s) => ({
        activeCalls: s.activeCalls.map((c) =>
          c.id === callId
            ? { ...c, status: "completed" as const, output, completedAt: Date.now() }
            : c,
        ),
      }));
      return output;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isPermission = errorMsg.includes("requires approval") || errorMsg.includes("permission");

      if (isPermission) {
        set((s) => ({
          activeCalls: s.activeCalls.map((c) =>
            c.id === callId ? { ...c, status: "pending_approval" as const } : c,
          ),
          pendingApproval: { ...call, status: "pending_approval" as const },
        }));
      } else {
        set((s) => ({
          activeCalls: s.activeCalls.map((c) =>
            c.id === callId
              ? { ...c, status: "error" as const, error: errorMsg, completedAt: Date.now() }
              : c,
          ),
        }));
      }
      return null;
    }
  },

  decidePermission: async (toolName, decision) => {
    await ipc.agentDecidePermission(toolName, decision);
    const pending = get().pendingApproval;
    set({ pendingApproval: null });

    // If approved, re-execute the tool
    if (pending && (decision === "allow" || decision === "allow_always")) {
      get().executeTool(pending.toolName, pending.input);
    } else if (pending) {
      set((s) => ({
        activeCalls: s.activeCalls.map((c) =>
          c.id === pending.id
            ? { ...c, status: "error" as const, error: "Permission denied by user", completedAt: Date.now() }
            : c,
        ),
      }));
    }
  },

  clearCalls: () => set({ activeCalls: [], pendingApproval: null }),
}));
