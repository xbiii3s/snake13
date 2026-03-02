use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

use super::protocol::{JsonRpcRequest, JsonRpcResponse};
use crate::error::{AppError, AppResult};

/// Stdio transport for MCP servers
pub struct StdioTransport {
    child: Child,
    sender: mpsc::Sender<String>,
    receiver: mpsc::Receiver<String>,
}

impl StdioTransport {
    /// Spawn a new MCP server process with stdio transport
    pub async fn spawn(command: &str, args: &[String], env: &[(String, String)]) -> AppResult<Self> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (key, value) in env {
            cmd.env(key, value);
        }

        let mut child = cmd.spawn().map_err(|e| {
            AppError::Internal(format!("Failed to spawn MCP server '{}': {}", command, e))
        })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            AppError::Internal("Failed to open stdin for MCP server".to_string())
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            AppError::Internal("Failed to open stdout for MCP server".to_string())
        })?;

        // Channel for sending messages to server
        let (tx_send, mut rx_send) = mpsc::channel::<String>(64);
        // Channel for receiving messages from server
        let (tx_recv, rx_recv) = mpsc::channel::<String>(64);

        // Writer task: sends JSON-RPC messages to server stdin
        let mut stdin = stdin;
        tokio::spawn(async move {
            while let Some(msg) = rx_send.recv().await {
                let line = format!("{}\n", msg);
                if stdin.write_all(line.as_bytes()).await.is_err() {
                    break;
                }
                if stdin.flush().await.is_err() {
                    break;
                }
            }
        });

        // Reader task: reads JSON-RPC messages from server stdout
        let reader = BufReader::new(stdout);
        tokio::spawn(async move {
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                if tx_recv.send(trimmed).await.is_err() {
                    break;
                }
            }
        });

        Ok(Self {
            child,
            sender: tx_send,
            receiver: rx_recv,
        })
    }

    /// Send a JSON-RPC request and wait for a response
    pub async fn send_request(&mut self, request: &JsonRpcRequest) -> AppResult<JsonRpcResponse> {
        let json_str = serde_json::to_string(request)
            .map_err(|e| AppError::Internal(format!("Failed to serialize request: {}", e)))?;

        self.sender.send(json_str).await.map_err(|_| {
            AppError::Internal("Failed to send message to MCP server".to_string())
        })?;

        // Wait for response with timeout
        let response_str = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            self.receiver.recv(),
        )
        .await
        .map_err(|_| AppError::Internal("MCP server response timeout (30s)".to_string()))?
        .ok_or_else(|| AppError::Internal("MCP server closed connection".to_string()))?;

        let response: JsonRpcResponse = serde_json::from_str(&response_str)
            .map_err(|e| AppError::Internal(format!("Failed to parse MCP response: {}", e)))?;

        Ok(response)
    }

    /// Send a notification (no response expected)
    pub async fn send_notification(&self, request: &JsonRpcRequest) -> AppResult<()> {
        let json_str = serde_json::to_string(request)
            .map_err(|e| AppError::Internal(format!("Failed to serialize notification: {}", e)))?;

        self.sender.send(json_str).await.map_err(|_| {
            AppError::Internal("Failed to send notification to MCP server".to_string())
        })?;

        Ok(())
    }

    /// Check if the process is still running
    #[allow(dead_code)]
    pub fn is_alive(&mut self) -> bool {
        self.child.try_wait().ok().flatten().is_none()
    }

    /// Kill the server process
    pub async fn kill(&mut self) -> AppResult<()> {
        self.child.kill().await.map_err(|e| {
            AppError::Internal(format!("Failed to kill MCP server: {}", e))
        })
    }
}

impl Drop for StdioTransport {
    fn drop(&mut self) {
        // Try to kill the child process on drop
        let _ = self.child.start_kill();
    }
}
