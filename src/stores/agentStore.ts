import { create } from "zustand";
import * as ipc from "@/lib/ipc";
import type {
  ToolDefinition,
  ToolOutput,
  PermissionDecision,
  ToolUseRequest,
  ToolResultItem,
} from "@/lib/ipc";

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

/** Maximum number of agent loop iterations to prevent infinite loops */
const MAX_AGENT_ITERATIONS = 10;

interface AgentState {
  enabled: boolean;
  tools: ToolDefinition[];
  activeCalls: ToolCall[];
  pendingApproval: ToolCall | null;
  loopIteration: number;
  isLooping: boolean;

  setEnabled: (enabled: boolean) => void;
  loadTools: () => Promise<void>;
  executeTool: (toolName: string, input: unknown) => Promise<ToolOutput | null>;
  decidePermission: (toolName: string, decision: PermissionDecision) => Promise<void>;
  clearCalls: () => void;

  /**
   * Execute a batch of tool calls collected from the model's response.
   *
   * This is the core of the agent loop:
   * 1. The frontend collects tool_use events from the streaming response
   * 2. Calls runAgentLoop with the collected ToolUseRequests
   * 3. The backend executes all tools and returns ToolResultItems
   * 4. The frontend updates activeCalls state with results
   * 5. Returns the results so the chat layer can send them back to the model
   * 6. The chat layer continues the conversation until no more tool calls
   *
   * Has a built-in iteration counter that resets on clearCalls().
   */
  runAgentLoop: (toolCalls: ToolUseRequest[]) => Promise<ToolResultItem[]>;
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  enabled: false,
  tools: [],
  activeCalls: [],
  pendingApproval: null,
  loopIteration: 0,
  isLooping: false,

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

  clearCalls: () => set({ activeCalls: [], pendingApproval: null, loopIteration: 0, isLooping: false }),

  runAgentLoop: async (toolCalls) => {
    const { loopIteration } = get();

    // Guard against infinite loops
    if (loopIteration >= MAX_AGENT_ITERATIONS) {
      console.warn(
        `Agent loop hit max iterations (${MAX_AGENT_ITERATIONS}), stopping.`,
      );
      set({ isLooping: false });
      return [];
    }

    set({ isLooping: true, loopIteration: loopIteration + 1 });

    // Add all tool calls to activeCalls as "running"
    const newCalls: ToolCall[] = toolCalls.map((tc) => ({
      id: tc.id,
      toolName: tc.name,
      input: tc.input,
      status: "running" as const,
      startedAt: Date.now(),
    }));

    set((s) => ({ activeCalls: [...s.activeCalls, ...newCalls] }));

    try {
      // Execute all tools via the backend runtime
      const results = await ipc.agentExecuteTools(toolCalls);

      // Update activeCalls with results
      set((s) => ({
        activeCalls: s.activeCalls.map((call) => {
          const result = results.find((r) => r.tool_use_id === call.id);
          if (!result) return call;
          return {
            ...call,
            status: result.is_error ? ("error" as const) : ("completed" as const),
            output: {
              content: result.content,
              is_error: result.is_error,
            },
            error: result.is_error ? result.content : undefined,
            completedAt: Date.now(),
          };
        }),
      }));

      return results;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Agent loop execution error:", errorMsg);

      // Mark all running calls from this batch as errored
      const batchIds = new Set(toolCalls.map((tc) => tc.id));
      set((s) => ({
        isLooping: false,
        activeCalls: s.activeCalls.map((call) =>
          batchIds.has(call.id) && call.status === "running"
            ? { ...call, status: "error" as const, error: errorMsg, completedAt: Date.now() }
            : call,
        ),
      }));

      return [];
    }
  },
}));
