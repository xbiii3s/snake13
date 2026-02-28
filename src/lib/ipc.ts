import { invoke, Channel } from "@tauri-apps/api/core";
import type { Conversation, CreateConversation, UpdateConversation } from "@/types/conversation";
import type { Message, CreateMessage } from "@/types/message";
import type { StreamEvent } from "@/types/stream";

// ===================== Conversations =====================

export async function createConversation(
  input: CreateConversation,
): Promise<Conversation> {
  return invoke("conversation_create", { input });
}

export async function listConversations(
  includeArchived = false,
): Promise<Conversation[]> {
  return invoke("conversation_list", { includeArchived });
}

export async function getConversation(id: string): Promise<Conversation> {
  return invoke("conversation_get", { id });
}

export async function updateConversation(
  id: string,
  input: UpdateConversation,
): Promise<Conversation> {
  return invoke("conversation_update", { id, input });
}

export async function deleteConversation(id: string): Promise<void> {
  return invoke("conversation_delete", { id });
}

// ===================== Messages =====================

export async function createMessage(input: CreateMessage): Promise<Message> {
  return invoke("message_create", { input });
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  return invoke("message_list", { conversationId });
}

export async function searchMessages(
  query: string,
  limit?: number,
): Promise<Array<{
  message_id: string;
  conversation_id: string;
  conversation_title: string;
  role: string;
  content_snippet: string;
  created_at: string;
}>> {
  return invoke("message_search", { query, limit });
}

// ===================== Chat Stream =====================

export interface ChatSendOptions {
  conversationId: string;
  content: string;
  modelId: string;
  enableThinking?: boolean;
  onEvent: (event: StreamEvent) => void;
}

export async function chatSend(options: ChatSendOptions): Promise<Message> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = options.onEvent;

  return invoke("chat_send", {
    conversationId: options.conversationId,
    content: options.content,
    modelId: options.modelId,
    enableThinking: options.enableThinking ?? false,
    onEvent: channel,
  });
}

export async function chatCancel(): Promise<void> {
  return invoke("chat_cancel");
}

// ===================== Settings =====================

export async function getSetting(key: string): Promise<string | null> {
  return invoke("settings_get", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("settings_set", { key, value });
}

// ===================== MCP =====================

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: [string, string][];
  auto_start: boolean;
}

export interface McpServerInfo {
  config: McpServerConfig;
  status: "disconnected" | "connecting" | "connected" | "error";
  server_info: { name: string; version: string } | null;
  tools: Array<{ name: string; description: string | null; input_schema: unknown }>;
  error: string | null;
}

export async function mcpAddServer(config: McpServerConfig): Promise<void> {
  return invoke("mcp_add_server", { config });
}

export async function mcpRemoveServer(id: string): Promise<void> {
  return invoke("mcp_remove_server", { id });
}

export async function mcpConnect(id: string): Promise<void> {
  return invoke("mcp_connect", { id });
}

export async function mcpDisconnect(id: string): Promise<void> {
  return invoke("mcp_disconnect", { id });
}

export async function mcpListServers(): Promise<McpServerInfo[]> {
  return invoke("mcp_list_servers");
}

export async function mcpCallTool(
  serverId: string,
  toolName: string,
  arguments_: unknown,
): Promise<unknown> {
  return invoke("mcp_call_tool", { serverId, toolName, arguments: arguments_ });
}

export async function mcpImportConfig(jsonConfig: string): Promise<McpServerConfig[]> {
  return invoke("mcp_import_config", { jsonConfig });
}

// ===================== Agent =====================

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: unknown;
}

export interface ToolOutput {
  content: string;
  metadata?: unknown;
  is_error: boolean;
}

export type PermissionDecision = "allow" | "deny" | "allow_always" | "deny_always";

export async function agentListTools(): Promise<ToolDefinition[]> {
  return invoke("agent_list_tools");
}

export async function agentExecuteTool(
  toolName: string,
  input: unknown,
): Promise<ToolOutput> {
  return invoke("agent_execute_tool", { toolName, input });
}

export async function agentDecidePermission(
  toolName: string,
  decision: PermissionDecision,
): Promise<void> {
  return invoke("agent_decide_permission", { toolName, decision });
}

// Agent Runtime: batch tool execution for multi-turn agent loop

export interface ToolUseRequest {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultItem {
  result_type: string;
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

export async function agentExecuteTools(
  toolCalls: ToolUseRequest[],
): Promise<ToolResultItem[]> {
  return invoke("agent_execute_tools", { toolCalls });
}

// ===================== Folders =====================

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export async function createFolder(input: {
  name: string;
  parent_id?: string;
  icon?: string;
}): Promise<Folder> {
  return invoke("folder_create", { input });
}

export async function listFolders(): Promise<Folder[]> {
  return invoke("folder_list");
}

export async function updateFolder(
  id: string,
  input: { name?: string; parent_id?: string | null; sort_order?: number; icon?: string | null },
): Promise<Folder> {
  return invoke("folder_update", { id, input });
}

export async function deleteFolder(id: string): Promise<void> {
  return invoke("folder_delete", { id });
}

// ===================== Usage =====================

export interface UsageSummary {
  model_id: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  message_count: number;
}

export interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

export async function usageRecord(conversationId: string, modelId: string, inputTokens: number, outputTokens: number, cost: number): Promise<void> {
  return invoke("usage_record", { conversationId, modelId, inputTokens, outputTokens, cost });
}

export async function usageSummary(fromDate: string, toDate: string): Promise<UsageSummary[]> {
  return invoke("usage_summary", { fromDate, toDate });
}

export async function usageDaily(fromDate: string, toDate: string): Promise<DailyUsage[]> {
  return invoke("usage_daily", { fromDate, toDate });
}

export async function usageTotal(): Promise<UsageSummary> {
  return invoke("usage_total");
}

// ===================== Import/Export =====================

export async function exportConversation(
  conversationId: string,
  format: "json" | "markdown",
): Promise<string> {
  return invoke("export_conversation", { conversationId, format });
}

export async function importConversation(jsonData: string): Promise<Conversation> {
  return invoke("import_conversation", { jsonData });
}

// ===================== Templates =====================

export interface Template {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model_id: string;
  enable_thinking: boolean;
  agent_mode: boolean;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplate {
  name: string;
  description?: string;
  system_prompt: string;
  model_id?: string;
  enable_thinking?: boolean;
  agent_mode?: boolean;
  icon?: string;
}

export async function templateCreate(input: CreateTemplate): Promise<Template> {
  return invoke("template_create", { input });
}

export async function templateList(): Promise<Template[]> {
  return invoke("template_list");
}

export async function templateUpdate(id: string, input: Partial<CreateTemplate> & { sort_order?: number }): Promise<Template> {
  return invoke("template_update", { id, input });
}

export async function templateDelete(id: string): Promise<void> {
  return invoke("template_delete", { id });
}

// ===================== Conversation Fork =====================

export async function forkConversation(conversationId: string, fromMessageId: string): Promise<Conversation> {
  return invoke("conversation_fork", { conversationId, fromMessageId });
}

// ===================== Desktop Notifications =====================

export async function sendNotification(title: string, body: string): Promise<void> {
  return invoke("send_notification", { title, body });
}
