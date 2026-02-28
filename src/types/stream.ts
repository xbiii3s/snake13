/** Events emitted during streaming response */
export type StreamEvent =
  | { type: "message_start"; message_id: string }
  | { type: "thinking_start" }
  | { type: "thinking_delta"; text: string }
  | { type: "thinking_stop"; duration_ms: number }
  | { type: "content_start" }
  | { type: "content_delta"; text: string }
  | { type: "content_stop" }
  | { type: "tool_use_start"; tool_call: ToolCallStart }
  | { type: "tool_use_delta"; partial_json: string }
  | { type: "tool_use_stop" }
  | { type: "message_stop"; usage: Usage }
  | { type: "error"; error: StreamError };

/** Token/cost usage info */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

/** Content delta types */
export interface ContentDelta {
  type: "text_delta";
  text: string;
}

/** Tool call start info */
export interface ToolCallStart {
  id: string;
  name: string;
}

/** Stream error info */
export interface StreamError {
  kind: string;
  message: string;
}
