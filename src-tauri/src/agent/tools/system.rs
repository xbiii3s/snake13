use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::process::Command;

use super::{PermissionLevel, Tool, ToolDefinition, ToolError, ToolOutput, ToolResult};

// ===========================================================================
// clipboard_read
// ===========================================================================

pub struct ClipboardRead;

#[async_trait]
impl Tool for ClipboardRead {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "clipboard_read".into(),
            description: "Read the current system clipboard contents.".into(),
            input_schema: json!({ "type": "object", "properties": {}, "required": [] }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Approval
    }

    async fn execute(&self, _input: Value) -> ToolResult<ToolOutput> {
        let output = Command::new("pbpaste")
            .output()
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to run pbpaste: {e}")))?;

        if !output.status.success() {
            return Err(ToolError::ExecutionFailed(format!(
                "pbpaste failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        let content = String::from_utf8_lossy(&output.stdout).into_owned();
        let len = content.len();
        Ok(ToolOutput::with_metadata(content, json!({ "length": len })))
    }
}

// ===========================================================================
// clipboard_write
// ===========================================================================

pub struct ClipboardWrite;

#[async_trait]
impl Tool for ClipboardWrite {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "clipboard_write".into(),
            description: "Write text to the system clipboard.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "Text to copy to clipboard." }
                },
                "required": ["content"]
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Approval
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let content = input["content"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'content' must be a string".into()))?;

        use tokio::io::AsyncWriteExt;
        let mut child = Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to run pbcopy: {e}")))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(content.as_bytes())
                .await
                .map_err(|e| ToolError::ExecutionFailed(format!("Failed to write to pbcopy: {e}")))?;
        }

        let status = child.wait()
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("pbcopy wait failed: {e}")))?;

        if !status.success() {
            return Err(ToolError::ExecutionFailed("pbcopy exited with non-zero status".into()));
        }

        Ok(ToolOutput::text(format!("Copied {} bytes to clipboard.", content.len())))
    }
}

// ===========================================================================
// notification_send
// ===========================================================================

pub struct NotificationSend;

#[async_trait]
impl Tool for NotificationSend {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "notification_send".into(),
            description: "Send a macOS desktop notification.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Notification title." },
                    "body": { "type": "string", "description": "Notification body text." },
                    "subtitle": { "type": "string" },
                    "sound": { "type": "string", "default": "default" }
                },
                "required": ["title", "body"]
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Auto
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let title = input["title"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'title' must be a string".into()))?;
        let body = input["body"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'body' must be a string".into()))?;
        let subtitle = input["subtitle"].as_str().unwrap_or("");
        let sound = input["sound"].as_str().unwrap_or("default");

        let subtitle_clause = if subtitle.is_empty() {
            String::new()
        } else {
            format!(" subtitle \"{}\"", escape_applescript(subtitle))
        };

        let sound_clause = if sound == "default" || sound.is_empty() {
            " sound name \"default\"".to_string()
        } else {
            format!(" sound name \"{}\"", escape_applescript(sound))
        };

        let script = format!(
            "display notification \"{}\" with title \"{}\"{subtitle_clause}{sound_clause}",
            escape_applescript(body),
            escape_applescript(title),
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to run osascript: {e}")))?;

        if !output.status.success() {
            return Err(ToolError::ExecutionFailed(format!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(ToolOutput::text(format!("Notification sent: \"{title}\"")))
    }
}

fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
