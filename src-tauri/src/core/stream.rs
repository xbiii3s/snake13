use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

/// Global cancellation flag for the current stream
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

pub fn request_cancel() {
    CANCEL_FLAG.store(true, Ordering::Relaxed);
}

fn is_cancelled() -> bool {
    CANCEL_FLAG.load(Ordering::Relaxed)
}

fn reset_cancel() {
    CANCEL_FLAG.store(false, Ordering::Relaxed);
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
    reset_cancel();
    let message_id = uuid::Uuid::new_v4().to_string();

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
            if is_cancelled() {
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
        if is_cancelled() {
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
    fn test_cancel_flag() {
        reset_cancel();
        assert!(!is_cancelled());
        request_cancel();
        assert!(is_cancelled());
        reset_cancel();
        assert!(!is_cancelled());
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
