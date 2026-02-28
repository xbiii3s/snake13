pub mod fs;
pub mod shell;
pub mod system;
pub mod web;

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum ToolError {
    #[error("Tool not found: {0}")]
    NotFound(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Execution failed: {0}")]
    ExecutionFailed(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Path not allowed: {0}")]
    PathNotAllowed(String),

    #[error("Command blocked: {0}")]
    CommandBlocked(String),

    #[error("Timeout")]
    Timeout,
}

pub type ToolResult<T> = Result<T, ToolError>;

// ---------------------------------------------------------------------------
// Permission levels
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionLevel {
    Auto,
    Approval,
    Deny,
}

// ---------------------------------------------------------------------------
// Tool definition (for LLM schema advertisement)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

// ---------------------------------------------------------------------------
// Tool output
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    #[serde(default)]
    pub is_error: bool,
}

impl ToolOutput {
    pub fn text(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            metadata: None,
            is_error: false,
        }
    }

    pub fn with_metadata(content: impl Into<String>, metadata: Value) -> Self {
        Self {
            content: content.into(),
            metadata: Some(metadata),
            is_error: false,
        }
    }

    pub fn error(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            metadata: None,
            is_error: true,
        }
    }
}

// ---------------------------------------------------------------------------
// The Tool trait
// ---------------------------------------------------------------------------

#[async_trait]
pub trait Tool: Send + Sync {
    fn definition(&self) -> ToolDefinition;
    async fn execute(&self, input: Value) -> ToolResult<ToolOutput>;
    fn permission_level(&self) -> PermissionLevel;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Arc<dyn Tool>) -> Option<Arc<dyn Tool>> {
        let name = tool.definition().name;
        self.tools.insert(name, tool)
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools.values().map(|t| t.definition()).collect()
    }

    pub fn names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    pub fn len(&self) -> usize {
        self.tools.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }

    pub fn with_defaults(workspace_root: impl Into<std::path::PathBuf>) -> Self {
        let workspace = workspace_root.into();
        let mut reg = Self::new();

        reg.register(Arc::new(fs::FsRead::new(workspace.clone())));
        reg.register(Arc::new(fs::FsWrite::new(workspace.clone())));
        reg.register(Arc::new(fs::FsList::new(workspace.clone())));
        reg.register(Arc::new(fs::FsSearch::new(workspace.clone())));

        reg.register(Arc::new(web::WebSearch::new()));
        reg.register(Arc::new(web::WebFetch::new()));

        reg.register(Arc::new(system::ClipboardRead));
        reg.register(Arc::new(system::ClipboardWrite));
        reg.register(Arc::new(system::NotificationSend));

        reg.register(Arc::new(shell::ShellExec::new(workspace)));

        reg
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}
