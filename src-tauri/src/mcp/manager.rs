use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::protocol::*;
use super::transport::StdioTransport;
use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// MCP Server Configuration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    #[serde(default)]
    pub auto_start: bool,
}

// ---------------------------------------------------------------------------
// MCP Server State
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum McpServerStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub config: McpServerConfig,
    pub status: McpServerStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_info: Option<Implementation>,
    #[serde(default)]
    pub tools: Vec<McpTool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// MCP Manager
// ---------------------------------------------------------------------------

struct ServerInstance {
    info: McpServerInfo,
    transport: Option<StdioTransport>,
    request_id: u64,
}

pub struct McpManager {
    servers: Arc<RwLock<HashMap<String, ServerInstance>>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Add a server configuration (does not connect)
    pub async fn add_server(&self, config: McpServerConfig) {
        let id = config.id.clone();
        let instance = ServerInstance {
            info: McpServerInfo {
                config,
                status: McpServerStatus::Disconnected,
                server_info: None,
                tools: Vec::new(),
                error: None,
            },
            transport: None,
            request_id: 0,
        };
        let mut servers = self.servers.write().await;
        servers.insert(id, instance);
    }

    /// Remove a server (disconnects if connected)
    pub async fn remove_server(&self, id: &str) -> AppResult<()> {
        let mut servers = self.servers.write().await;
        if let Some(mut instance) = servers.remove(id) {
            if let Some(ref mut transport) = instance.transport {
                let _ = transport.kill().await;
            }
        }
        Ok(())
    }

    /// Connect to a server
    pub async fn connect(&self, id: &str) -> AppResult<()> {
        let mut servers = self.servers.write().await;
        let instance = servers.get_mut(id).ok_or_else(|| {
            AppError::NotFound(format!("MCP server '{}' not found", id))
        })?;

        instance.info.status = McpServerStatus::Connecting;
        instance.info.error = None;

        let config = &instance.info.config;
        let transport_result = StdioTransport::spawn(
            &config.command,
            &config.args,
            &config.env,
        ).await;

        let mut transport = match transport_result {
            Ok(t) => t,
            Err(e) => {
                instance.info.status = McpServerStatus::Error;
                instance.info.error = Some(e.to_string());
                return Err(e);
            }
        };

        // Send initialize request
        instance.request_id += 1;
        let init_request = JsonRpcRequest::new(
            instance.request_id,
            "initialize",
            Some(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "roots": { "listChanged": true }
                },
                "clientInfo": {
                    "name": "Claude Desktop Pro",
                    "version": "0.1.0"
                }
            })),
        );

        let response = match transport.send_request(&init_request).await {
            Ok(r) => r,
            Err(e) => {
                instance.info.status = McpServerStatus::Error;
                instance.info.error = Some(format!("Initialize failed: {}", e));
                let _ = transport.kill().await;
                return Err(e);
            }
        };

        // Parse initialize result
        if let Some(result) = response.result {
            if let Ok(init_result) = serde_json::from_value::<InitializeResult>(result) {
                instance.info.server_info = Some(init_result.server_info);
            }
        }

        // Send initialized notification
        let initialized_notification = JsonRpcRequest::notification("notifications/initialized", None);
        let _ = transport.send_notification(&initialized_notification).await;

        // List tools
        instance.request_id += 1;
        let tools_request = JsonRpcRequest::new(instance.request_id, "tools/list", None);
        if let Ok(tools_response) = transport.send_request(&tools_request).await {
            if let Some(result) = tools_response.result {
                if let Some(tools_array) = result["tools"].as_array() {
                    instance.info.tools = tools_array
                        .iter()
                        .filter_map(|t| serde_json::from_value(t.clone()).ok())
                        .collect();
                }
            }
        }

        instance.info.status = McpServerStatus::Connected;
        instance.transport = Some(transport);

        Ok(())
    }

    /// Disconnect from a server
    pub async fn disconnect(&self, id: &str) -> AppResult<()> {
        let mut servers = self.servers.write().await;
        if let Some(instance) = servers.get_mut(id) {
            if let Some(ref mut transport) = instance.transport {
                let _ = transport.kill().await;
            }
            instance.transport = None;
            instance.info.status = McpServerStatus::Disconnected;
            instance.info.tools.clear();
            instance.info.server_info = None;
        }
        Ok(())
    }

    /// Call a tool on a connected MCP server
    pub async fn call_tool(&self, server_id: &str, tool_name: &str, arguments: Value) -> AppResult<ToolCallResult> {
        let mut servers = self.servers.write().await;
        let instance = servers.get_mut(server_id).ok_or_else(|| {
            AppError::NotFound(format!("MCP server '{}' not found", server_id))
        })?;

        let transport = instance.transport.as_mut().ok_or_else(|| {
            AppError::Internal(format!("MCP server '{}' is not connected", server_id))
        })?;

        instance.request_id += 1;
        let request = JsonRpcRequest::new(
            instance.request_id,
            "tools/call",
            Some(json!({
                "name": tool_name,
                "arguments": arguments,
            })),
        );

        let response = transport.send_request(&request).await?;

        if let Some(error) = response.error {
            return Err(AppError::Api {
                status: error.code as u16,
                message: error.message,
            });
        }

        let result = response.result.ok_or_else(|| {
            AppError::Internal("Empty tool call result".to_string())
        })?;

        serde_json::from_value(result).map_err(|e| {
            AppError::Internal(format!("Failed to parse tool result: {}", e))
        })
    }

    /// List all servers and their status
    pub async fn list_servers(&self) -> Vec<McpServerInfo> {
        let servers = self.servers.read().await;
        servers.values().map(|s| s.info.clone()).collect()
    }

    /// Get all tools from all connected servers
    pub async fn all_tools(&self) -> Vec<(String, McpTool)> {
        let servers = self.servers.read().await;
        let mut tools = Vec::new();
        for (id, instance) in servers.iter() {
            if instance.info.status == McpServerStatus::Connected {
                for tool in &instance.info.tools {
                    tools.push((id.clone(), tool.clone()));
                }
            }
        }
        tools
    }

    /// Allowed MCP server commands (safe executables).
    /// Commands not in this list will be rejected during config import.
    const ALLOWED_MCP_COMMANDS: &'static [&'static str] = &[
        "npx", "node", "python", "python3", "uvx", "deno", "bun",
        "docker", "podman", "cargo", "go",
    ];

    /// Validate that an MCP server command is allowed
    fn validate_command(command: &str) -> AppResult<()> {
        let base_command = std::path::Path::new(command)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(command);

        if !Self::ALLOWED_MCP_COMMANDS.contains(&base_command) {
            return Err(AppError::Validation(format!(
                "MCP server command '{}' is not in the allowed list. Allowed: {:?}",
                command,
                Self::ALLOWED_MCP_COMMANDS
            )));
        }
        Ok(())
    }

    /// Import server configs from Claude Desktop format.
    ///
    /// Commands are validated against a whitelist to prevent execution of
    /// arbitrary or dangerous executables.
    pub fn parse_claude_config(json_str: &str) -> AppResult<Vec<McpServerConfig>> {
        let value: Value = serde_json::from_str(json_str)
            .map_err(|e| AppError::Internal(format!("Invalid JSON: {}", e)))?;

        let servers = value["mcpServers"]
            .as_object()
            .ok_or_else(|| AppError::Internal("Missing 'mcpServers' key".to_string()))?;

        let mut configs = Vec::new();
        for (name, config) in servers {
            let command = config["command"]
                .as_str()
                .unwrap_or("npx")
                .to_string();

            // Validate command against whitelist
            Self::validate_command(&command)?;

            let args: Vec<String> = config["args"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let env: Vec<(String, String)> = config["env"]
                .as_object()
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| {
                            v.as_str().map(|val| (k.clone(), val.to_string()))
                        })
                        .collect()
                })
                .unwrap_or_default();

            configs.push(McpServerConfig {
                id: uuid::Uuid::now_v7().to_string(),
                name: name.clone(),
                command,
                args,
                env,
                auto_start: true,
            });
        }

        Ok(configs)
    }
}

impl Default for McpManager {
    fn default() -> Self {
        Self::new()
    }
}
