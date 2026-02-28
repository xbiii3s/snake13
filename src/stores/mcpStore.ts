import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: [string, string][];
  auto_start: boolean;
}

export type McpServerStatus = "disconnected" | "connecting" | "connected" | "error";

export interface McpTool {
  name: string;
  description: string | null;
  input_schema: unknown;
}

export interface McpServerInfo {
  config: McpServerConfig;
  status: McpServerStatus;
  server_info: { name: string; version: string } | null;
  tools: McpTool[];
  error: string | null;
}

interface McpState {
  servers: McpServerInfo[];
  loading: boolean;

  loadServers: () => Promise<void>;
  addServer: (config: McpServerConfig) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  connectServer: (id: string) => Promise<void>;
  disconnectServer: (id: string) => Promise<void>;
  importConfig: (json: string) => Promise<McpServerConfig[]>;
}

export const useMcpStore = create<McpState>()((set, get) => ({
  servers: [],
  loading: false,

  loadServers: async () => {
    set({ loading: true });
    try {
      const servers = await invoke<McpServerInfo[]>("mcp_list_servers");
      set({ servers, loading: false });
    } catch (err) {
      console.error("Failed to load MCP servers:", err);
      set({ loading: false });
    }
  },

  addServer: async (config) => {
    await invoke("mcp_add_server", { config });
    await get().loadServers();
  },

  removeServer: async (id) => {
    await invoke("mcp_remove_server", { id });
    await get().loadServers();
  },

  connectServer: async (id) => {
    // Optimistic update
    set((s) => ({
      servers: s.servers.map((srv) =>
        srv.config.id === id ? { ...srv, status: "connecting" as const } : srv,
      ),
    }));

    try {
      await invoke("mcp_connect", { id });
    } catch (err) {
      console.error("MCP connect failed:", err);
    }
    await get().loadServers();
  },

  disconnectServer: async (id) => {
    await invoke("mcp_disconnect", { id });
    await get().loadServers();
  },

  importConfig: async (jsonConfig) => {
    const configs = await invoke<McpServerConfig[]>("mcp_import_config", { jsonConfig });
    await get().loadServers();
    return configs;
  },
}));
