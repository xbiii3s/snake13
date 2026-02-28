/** A chat message stored in the database */
export interface Message {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  model_used: string | null;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  thinking_content: string | null;
  thinking_duration_ms: number | null;
  attachments: string; // JSON string of Attachment[]
  tool_calls: string; // JSON string of ToolCall[]
  created_at: string;
}

/** Input to create a new message */
export interface CreateMessage {
  conversation_id: string;
  parent_id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  model_used?: string | null;
  tokens_in?: number;
  tokens_out?: number;
  cost?: number;
  thinking_content?: string | null;
  thinking_duration_ms?: number | null;
  attachments?: string;
  tool_calls?: string;
}

/** File or image attachment */
export interface Attachment {
  type: "image" | "file";
  name: string;
  mime_type: string;
  data: string; // base64 encoded
  size: number;
}

/** A tool call made by the assistant */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "success" | "error";
  duration_ms?: number;
}
