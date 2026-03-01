use futures::StreamExt;
use reqwest::header;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Generation-based cancellation for concurrent stream safety.
///
/// Each new stream increments the generation counter and captures its value.
/// `request_cancel()` stores a sentinel (0) that is different from any active
/// generation, causing `is_cancelled(gen)` to return true for whichever stream
/// is currently running. This avoids the race condition of a single AtomicBool
/// where cancelling one stream could affect a newly started stream.
static STREAM_GENERATION: AtomicU64 = AtomicU64::new(1);

/// Signal cancellation for the currently active stream.
pub fn request_cancel() {
    STREAM_GENERATION.store(0, Ordering::SeqCst);
}

/// Start a new stream generation. Returns the generation ID for this stream.
///
/// `fetch_add` returns the old value; we return old+1 which is the new stored value.
/// This ensures `is_cancelled(gen)` comparing `load() != gen` works correctly.
fn new_generation() -> u64 {
    let old = STREAM_GENERATION.fetch_add(1, Ordering::SeqCst);
    let gen = old.wrapping_add(1);
    // If the new value is 0 (the cancel sentinel), skip it
    if gen == 0 {
        let old2 = STREAM_GENERATION.fetch_add(1, Ordering::SeqCst);
        old2.wrapping_add(1)
    } else {
        gen
    }
}

/// Check if the given stream generation has been cancelled.
fn is_cancelled(gen: u64) -> bool {
    STREAM_GENERATION.load(Ordering::SeqCst) != gen
}

/// Events emitted during streaming, sent to frontend via Tauri Channel
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "message_start")]
    MessageStart { message_id: String },

    #[serde(rename = "thinking_start")]
    ThinkingStart,

    #[serde(rename = "thinking_delta")]
    ThinkingDelta { text: String },

    #[serde(rename = "thinking_stop")]
    ThinkingStop { duration_ms: u64 },

    #[serde(rename = "content_start")]
    ContentStart,

    #[serde(rename = "content_delta")]
    ContentDelta { text: String },

    #[serde(rename = "content_stop")]
    ContentStop,

    #[serde(rename = "tool_use_start")]
    ToolUseStart { id: String, name: String },

    #[serde(rename = "tool_use_delta")]
    ToolUseDelta { partial_json: String },

    #[serde(rename = "tool_use_stop")]
    ToolUseStop,

    #[serde(rename = "message_stop")]
    MessageStop { usage: Usage },

    #[serde(rename = "error")]
    Error { kind: String, message: String },
}

#[derive(Debug, Clone, Serialize)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost: f64,
}

/// Generate a mock streaming response for development
pub async fn mock_stream(
    channel: tauri::ipc::Channel<StreamEvent>,
    model_id: &str,
    _user_message: &str,
    enable_thinking: bool,
) -> crate::error::AppResult<()> {
    let gen = new_generation();
    let message_id = uuid::Uuid::now_v7().to_string();

    // 1. Message start
    channel
        .send(StreamEvent::MessageStart {
            message_id: message_id.clone(),
        })
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    // 2. Optional: Extended Thinking
    if enable_thinking {
        channel
            .send(StreamEvent::ThinkingStart)
            .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

        let thinking_text = "Let me analyze this question step by step.\n\n\
            First, I need to consider the key aspects...\n\
            The main points to address are:\n\
            1. Understanding the context\n\
            2. Identifying the core requirements\n\
            3. Formulating a comprehensive response\n\n\
            Based on my analysis, I can now provide a detailed answer.";

        for chunk in thinking_text.chars().collect::<Vec<_>>().chunks(5) {
            if is_cancelled(gen) {
                return Err(crate::error::AppError::Cancelled);
            }
            let text: String = chunk.iter().collect();
            channel
                .send(StreamEvent::ThinkingDelta { text })
                .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }

        channel
            .send(StreamEvent::ThinkingStop { duration_ms: 2500 })
            .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    }

    // 3. Content streaming
    channel
        .send(StreamEvent::ContentStart)
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    let response = get_mock_response(model_id);

    // Stream token by token (in chunks of ~3 chars for realism)
    for chunk in response.chars().collect::<Vec<_>>().chunks(3) {
        if is_cancelled(gen) {
            return Err(crate::error::AppError::Cancelled);
        }
        let text: String = chunk.iter().collect();
        channel
            .send(StreamEvent::ContentDelta { text })
            .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
        tokio::time::sleep(std::time::Duration::from_millis(15)).await;
    }

    channel
        .send(StreamEvent::ContentStop)
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    // 4. Usage stats
    let input_tokens = 150u64;
    let output_tokens = response.len() as u64 / 4; // rough estimate
    let cost = calculate_cost(model_id, input_tokens, output_tokens);

    channel
        .send(StreamEvent::MessageStop {
            usage: Usage {
                input_tokens,
                output_tokens,
                cost,
            },
        })
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    Ok(())
}

// ===================== Claude API Types =====================

#[derive(Serialize)]
struct ApiRequest {
    model: String,
    max_tokens: u32,
    stream: bool,
    messages: Vec<ApiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<ThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Value>,
}

#[derive(Serialize)]
pub struct ApiMessage {
    pub role: String,
    pub content: Value,
}

#[derive(Serialize)]
struct ThinkingConfig {
    #[serde(rename = "type")]
    thinking_type: String,
    budget_tokens: u32,
}

/// SSE event data structures for parsing Claude API responses
#[derive(Deserialize)]
struct SseMessageStart {
    message: SseMessage,
}

#[derive(Deserialize)]
struct SseMessage {
    id: String,
    usage: Option<SseUsage>,
}

#[derive(Deserialize)]
struct SseUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

#[derive(Deserialize)]
struct SseContentBlockStart {
    content_block: SseContentBlock,
}

#[derive(Deserialize)]
struct SseContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct SseContentBlockDelta {
    delta: SseDelta,
}

#[derive(Deserialize)]
struct SseDelta {
    #[serde(rename = "type")]
    delta_type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    thinking: Option<String>,
    #[serde(default)]
    partial_json: Option<String>,
}

#[derive(Deserialize)]
struct SseMessageDelta {
    usage: Option<SseUsage>,
}

#[derive(Deserialize)]
struct SseError {
    error: SseErrorDetail,
}

#[derive(Deserialize)]
struct SseErrorDetail {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}

// ===================== Claude API Stream =====================

/// Stream a real response from the Claude API
pub async fn claude_stream(
    channel: tauri::ipc::Channel<StreamEvent>,
    api_key: &str,
    model_id: &str,
    messages: Vec<ApiMessage>,
    system_prompt: Option<&str>,
    enable_thinking: bool,
    tools: Option<Value>,
    max_tokens: Option<u32>,
    proxy_url: Option<&str>,
) -> crate::error::AppResult<()> {
    let gen = new_generation();

    let max_tokens = max_tokens.unwrap_or(8192);

    // Build request body
    let body = ApiRequest {
        model: model_id.to_string(),
        max_tokens,
        stream: true,
        messages,
        system: system_prompt.map(|s| s.to_string()),
        thinking: if enable_thinking {
            Some(ThinkingConfig {
                thinking_type: "enabled".to_string(),
                budget_tokens: 4096,
            })
        } else {
            None
        },
        tools,
    };

    // Build reqwest client (with optional proxy)
    let mut client_builder = reqwest::Client::builder();
    if let Some(proxy) = proxy_url {
        if !proxy.is_empty() {
            let reqwest_proxy = reqwest::Proxy::all(proxy)
                .map_err(|e| crate::error::AppError::Internal(format!("Invalid proxy URL: {}", e)))?;
            client_builder = client_builder.proxy(reqwest_proxy);
        }
    }
    let client = client_builder
        .build()
        .map_err(|e| crate::error::AppError::Internal(format!("Failed to build HTTP client: {}", e)))?;

    // Send request
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await?;

    // Check for HTTP errors
    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        // Try to parse the error response
        if let Ok(sse_err) = serde_json::from_str::<SseError>(&error_body) {
            return Err(crate::error::AppError::Api {
                status: status.as_u16(),
                message: sse_err.error.message,
            });
        }
        return Err(crate::error::AppError::Api {
            status: status.as_u16(),
            message: error_body,
        });
    }

    // Process SSE stream
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut current_event_type = String::new();
    let mut _message_id = String::new();
    let mut input_tokens: u64 = 0;
    let mut output_tokens: u64 = 0;
    let mut thinking_start_time: Option<Instant> = None;
    let mut current_block_type = String::new();

    let send = |event: StreamEvent| -> crate::error::AppResult<()> {
        channel
            .send(event)
            .map_err(|e| crate::error::AppError::Internal(e.to_string()))
    };

    while let Some(chunk_result) = stream.next().await {
        if is_cancelled(gen) {
            return Err(crate::error::AppError::Cancelled);
        }

        let chunk = chunk_result?;
        let chunk_str = String::from_utf8_lossy(&chunk);
        buffer.push_str(&chunk_str);

        // Process complete lines from the buffer
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() {
                // Empty line = end of SSE event, process the accumulated event
                continue;
            }

            if let Some(event_type) = line.strip_prefix("event: ") {
                current_event_type = event_type.to_string();
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                match current_event_type.as_str() {
                    "message_start" => {
                        if let Ok(msg_start) = serde_json::from_str::<SseMessageStart>(data) {
                            _message_id = msg_start.message.id.clone();
                            if let Some(usage) = msg_start.message.usage {
                                input_tokens = usage.input_tokens.unwrap_or(0);
                            }
                            send(StreamEvent::MessageStart {
                                message_id: _message_id.clone(),
                            })?;
                        }
                    }
                    "content_block_start" => {
                        if let Ok(block_start) = serde_json::from_str::<SseContentBlockStart>(data) {
                            current_block_type = block_start.content_block.block_type.clone();
                            match current_block_type.as_str() {
                                "thinking" => {
                                    thinking_start_time = Some(Instant::now());
                                    send(StreamEvent::ThinkingStart)?;
                                }
                                "text" => {
                                    send(StreamEvent::ContentStart)?;
                                }
                                "tool_use" => {
                                    let id = block_start.content_block.id.unwrap_or_default();
                                    let name = block_start.content_block.name.unwrap_or_default();
                                    send(StreamEvent::ToolUseStart { id, name })?;
                                }
                                _ => {}
                            }
                        }
                    }
                    "content_block_delta" => {
                        if let Ok(block_delta) = serde_json::from_str::<SseContentBlockDelta>(data) {
                            match block_delta.delta.delta_type.as_str() {
                                "thinking_delta" => {
                                    if let Some(text) = block_delta.delta.thinking {
                                        send(StreamEvent::ThinkingDelta { text })?;
                                    }
                                }
                                "text_delta" => {
                                    if let Some(text) = block_delta.delta.text {
                                        send(StreamEvent::ContentDelta { text })?;
                                    }
                                }
                                "input_json_delta" => {
                                    if let Some(partial_json) = block_delta.delta.partial_json {
                                        send(StreamEvent::ToolUseDelta { partial_json })?;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    "content_block_stop" => {
                        match current_block_type.as_str() {
                            "thinking" => {
                                let duration_ms = thinking_start_time
                                    .map(|t| t.elapsed().as_millis() as u64)
                                    .unwrap_or(0);
                                thinking_start_time = None;
                                send(StreamEvent::ThinkingStop { duration_ms })?;
                            }
                            "text" => {
                                send(StreamEvent::ContentStop)?;
                            }
                            "tool_use" => {
                                send(StreamEvent::ToolUseStop)?;
                            }
                            _ => {}
                        }
                        current_block_type.clear();
                    }
                    "message_delta" => {
                        if let Ok(msg_delta) = serde_json::from_str::<SseMessageDelta>(data) {
                            if let Some(usage) = msg_delta.usage {
                                output_tokens = usage.output_tokens.unwrap_or(0);
                            }
                        }
                    }
                    "message_stop" => {
                        let cost = calculate_cost(model_id, input_tokens, output_tokens);
                        send(StreamEvent::MessageStop {
                            usage: Usage {
                                input_tokens,
                                output_tokens,
                                cost,
                            },
                        })?;
                    }
                    "error" => {
                        if let Ok(err) = serde_json::from_str::<SseError>(data) {
                            send(StreamEvent::Error {
                                kind: err.error.error_type,
                                message: err.error.message,
                            })?;
                        } else {
                            send(StreamEvent::Error {
                                kind: "unknown".to_string(),
                                message: data.to_string(),
                            })?;
                        }
                    }
                    "ping" => {
                        // Ping events are heartbeats, ignore them
                    }
                    _ => {
                        log::debug!("Unknown SSE event type: {}", current_event_type);
                    }
                }
                current_event_type.clear();
            }
        }
    }

    Ok(())
}

fn get_mock_response(model_id: &str) -> String {
    let model_name = match model_id {
        "claude-opus-4-6" => "Opus 4.6",
        "claude-sonnet-4-5" => "Sonnet 4.5",
        "claude-haiku-4-5" => "Haiku 4.5",
        _ => "Claude",
    };

    format!(
        "Hello! I'm **Claude {}** running in Claude Desktop Pro. \
        This is a mock response for development.\n\n\
        ## Features\n\n\
        Here's what I can do:\n\n\
        - **Markdown rendering** with full support\n\
        - Code blocks with syntax highlighting:\n\n\
        ```rust\n\
        fn main() {{\n    \
            println!(\"Hello from Claude Desktop Pro!\");\n\
        }}\n\
        ```\n\n\
        - Mathematical formulas: $E = mc^2$\n\
        - Tables:\n\n\
        | Model | Speed | Quality |\n\
        |-------|-------|---------|\n\
        | Opus  | ⭐⭐  | ⭐⭐⭐⭐⭐ |\n\
        | Sonnet| ⭐⭐⭐⭐| ⭐⭐⭐⭐ |\n\
        | Haiku | ⭐⭐⭐⭐⭐| ⭐⭐⭐ |\n\n\
        > This is a blockquote to test styling.\n\n\
        Feel free to ask me anything!",
        model_name
    )
}

fn calculate_cost(model_id: &str, input_tokens: u64, output_tokens: u64) -> f64 {
    let (input_rate, output_rate) = match model_id {
        "claude-opus-4-6" => (15.0, 75.0),
        "claude-sonnet-4-5" => (3.0, 15.0),
        "claude-haiku-4-5" => (1.0, 5.0),
        _ => (3.0, 15.0),
    };

    (input_tokens as f64 * input_rate + output_tokens as f64 * output_rate) / 1_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cancel_generation() {
        let gen = new_generation();
        assert!(!is_cancelled(gen));
        request_cancel();
        assert!(is_cancelled(gen));
        // New generation should not be cancelled
        let gen2 = new_generation();
        assert!(!is_cancelled(gen2));
    }

    #[test]
    fn test_calculate_cost_opus() {
        let cost = calculate_cost("claude-opus-4-6", 1000, 500);
        let expected = (1000.0 * 15.0 + 500.0 * 75.0) / 1_000_000.0;
        assert!((cost - expected).abs() < 1e-10);
    }

    #[test]
    fn test_calculate_cost_sonnet() {
        let cost = calculate_cost("claude-sonnet-4-5", 1000, 500);
        let expected = (1000.0 * 3.0 + 500.0 * 15.0) / 1_000_000.0;
        assert!((cost - expected).abs() < 1e-10);
    }

    #[test]
    fn test_calculate_cost_haiku() {
        let cost = calculate_cost("claude-haiku-4-5", 1000, 500);
        let expected = (1000.0 * 1.0 + 500.0 * 5.0) / 1_000_000.0;
        assert!((cost - expected).abs() < 1e-10);
    }

    #[test]
    fn test_mock_response_contains_model_name() {
        let resp = get_mock_response("claude-opus-4-6");
        assert!(resp.contains("Opus 4.6"));
        let resp = get_mock_response("claude-sonnet-4-5");
        assert!(resp.contains("Sonnet 4.5"));
        let resp = get_mock_response("claude-haiku-4-5");
        assert!(resp.contains("Haiku 4.5"));
    }
}
