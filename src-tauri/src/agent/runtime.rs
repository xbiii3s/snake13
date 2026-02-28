use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::agent::security::PermissionManager;
use crate::agent::tools::{PermissionLevel, ToolRegistry};

/// Maximum number of tool-use rounds before stopping.
/// Referenced by the frontend agent loop to cap iterations.
#[allow(dead_code)]
pub const MAX_AGENT_ITERATIONS: usize = 10;

/// Represents a tool use request from the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUseRequest {
    pub id: String,
    pub name: String,
    pub input: Value,
}

/// Represents a tool result to send back to the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    #[serde(rename = "type")]
    pub result_type: String, // always "tool_result"
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

/// Agent runtime that handles multi-turn tool calling.
///
/// The runtime accepts tool-use requests extracted from model responses,
/// executes them against the registered tool registry with permission checks,
/// and returns tool results that can be fed back into the next model turn.
///
/// The caller (frontend) is responsible for:
/// 1. Sending messages to the model and receiving streamed responses
/// 2. Collecting `tool_use` blocks from the response
/// 3. Calling `execute_tools` to run them
/// 4. Sending results back to the model as the next turn
/// 5. Repeating until the model responds with only text (no tool calls)
/// 6. Enforcing `MAX_AGENT_ITERATIONS` to prevent infinite loops
pub struct AgentRuntime {
    tools: Arc<ToolRegistry>,
    permissions: Arc<PermissionManager>,
}

impl AgentRuntime {
    pub fn new(tools: Arc<ToolRegistry>, permissions: Arc<PermissionManager>) -> Self {
        Self { tools, permissions }
    }

    /// Execute a single tool and return the result.
    ///
    /// Permission checks are performed before execution:
    /// - `Deny` -> returns an error result
    /// - `Approval` -> returns an error result indicating user approval is needed
    /// - `Auto` -> proceeds with execution
    pub async fn execute_tool(&self, request: &ToolUseRequest) -> ToolResult {
        let tool = match self.tools.get(&request.name) {
            Some(t) => t,
            None => {
                return ToolResult {
                    result_type: "tool_result".to_string(),
                    tool_use_id: request.id.clone(),
                    content: format!("Tool '{}' not found", request.name),
                    is_error: true,
                }
            }
        };

        // Check permission
        let level = match self.permissions.check(&request.name, tool.permission_level()) {
            Ok(l) => l,
            Err(e) => {
                return ToolResult {
                    result_type: "tool_result".to_string(),
                    tool_use_id: request.id.clone(),
                    content: format!("Permission error: {}", e),
                    is_error: true,
                }
            }
        };

        if level == PermissionLevel::Deny {
            return ToolResult {
                result_type: "tool_result".to_string(),
                tool_use_id: request.id.clone(),
                content: "Permission denied".to_string(),
                is_error: true,
            };
        }

        // For approval-level tools, signal that frontend interaction is needed
        if level == PermissionLevel::Approval {
            return ToolResult {
                result_type: "tool_result".to_string(),
                tool_use_id: request.id.clone(),
                content: format!("Tool '{}' requires user approval", request.name),
                is_error: true,
            };
        }

        // Execute the tool
        match tool.execute(request.input.clone()).await {
            Ok(output) => ToolResult {
                result_type: "tool_result".to_string(),
                tool_use_id: request.id.clone(),
                content: output.content,
                is_error: output.is_error,
            },
            Err(e) => ToolResult {
                result_type: "tool_result".to_string(),
                tool_use_id: request.id.clone(),
                content: format!("Tool execution failed: {}", e),
                is_error: true,
            },
        }
    }

    /// Process multiple tool use requests and return results.
    ///
    /// Tools are executed sequentially in the order provided.
    /// Each tool result is collected and returned together.
    pub async fn execute_tools(&self, requests: &[ToolUseRequest]) -> Vec<ToolResult> {
        let mut results = Vec::with_capacity(requests.len());
        for req in requests {
            results.push(self.execute_tool(req).await);
        }
        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_result_serialization() {
        let result = ToolResult {
            result_type: "tool_result".to_string(),
            tool_use_id: "test-id".to_string(),
            content: "hello".to_string(),
            is_error: false,
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["type"], "tool_result");
        assert_eq!(json["tool_use_id"], "test-id");
        assert_eq!(json["content"], "hello");
        assert_eq!(json["is_error"], false);
    }

    #[test]
    fn test_tool_use_request_deserialization() {
        let json = serde_json::json!({
            "id": "call-123",
            "name": "fs_read",
            "input": { "path": "/tmp/test.txt" }
        });
        let req: ToolUseRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.id, "call-123");
        assert_eq!(req.name, "fs_read");
        assert_eq!(req.input["path"], "/tmp/test.txt");
    }

    #[test]
    fn test_max_iterations_constant() {
        assert_eq!(MAX_AGENT_ITERATIONS, 10);
    }
}
