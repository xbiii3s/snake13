use std::collections::HashMap;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::tools::{PermissionLevel, ToolError, ToolResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRule {
    pub tool_name: String,
    pub level: PermissionLevel,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub id: String,
    pub tool_name: String,
    pub description: String,
    pub input_summary: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    Allow,
    Deny,
    AllowAlways,
    DenyAlways,
}

pub struct PermissionManager {
    overrides: RwLock<HashMap<String, PermissionLevel>>,
    #[allow(dead_code)]
    global_default: RwLock<PermissionLevel>,
}

impl PermissionManager {
    pub fn new() -> Self {
        Self {
            overrides: RwLock::new(HashMap::new()),
            global_default: RwLock::new(PermissionLevel::Approval),
        }
    }

    pub fn effective_level(&self, tool_name: &str, tool_default: PermissionLevel) -> PermissionLevel {
        let overrides = self.overrides.read().expect("RwLock poisoned");
        if let Some(&level) = overrides.get(tool_name) {
            return level;
        }
        tool_default
    }

    pub fn check(&self, tool_name: &str, tool_default: PermissionLevel) -> ToolResult<PermissionLevel> {
        let level = self.effective_level(tool_name, tool_default);
        match level {
            PermissionLevel::Deny => Err(ToolError::PermissionDenied(format!(
                "Tool '{tool_name}' is denied by permission policy"
            ))),
            other => Ok(other),
        }
    }

    pub fn apply_decision(&self, tool_name: &str, decision: PermissionDecision) {
        match decision {
            PermissionDecision::AllowAlways => {
                let mut overrides = self.overrides.write().expect("RwLock poisoned");
                overrides.insert(tool_name.to_string(), PermissionLevel::Auto);
            }
            PermissionDecision::DenyAlways => {
                let mut overrides = self.overrides.write().expect("RwLock poisoned");
                overrides.insert(tool_name.to_string(), PermissionLevel::Deny);
            }
            PermissionDecision::Allow | PermissionDecision::Deny => {}
        }
    }

    pub fn set_override(&self, tool_name: impl Into<String>, level: PermissionLevel) {
        let mut overrides = self.overrides.write().expect("RwLock poisoned");
        overrides.insert(tool_name.into(), level);
    }

    pub fn remove_override(&self, tool_name: &str) {
        let mut overrides = self.overrides.write().expect("RwLock poisoned");
        overrides.remove(tool_name);
    }

    pub fn list_overrides(&self) -> Vec<PermissionRule> {
        let overrides = self.overrides.read().expect("RwLock poisoned");
        overrides
            .iter()
            .map(|(name, level)| PermissionRule {
                tool_name: name.clone(),
                level: *level,
                reason: None,
            })
            .collect()
    }

    pub fn load_overrides(&self, rules: &[PermissionRule]) {
        let mut overrides = self.overrides.write().expect("RwLock poisoned");
        for rule in rules {
            overrides.insert(rule.tool_name.clone(), rule.level);
        }
    }

    pub fn clear_overrides(&self) {
        let mut overrides = self.overrides.write().expect("RwLock poisoned");
        overrides.clear();
    }

    pub fn create_request(
        &self,
        tool_name: &str,
        description: &str,
        input: &Value,
    ) -> PermissionRequest {
        let id = uuid::Uuid::new_v4().to_string();
        let input_summary = summarise_input(input);
        PermissionRequest {
            id,
            tool_name: tool_name.to_string(),
            description: description.to_string(),
            input_summary,
        }
    }
}

impl Default for PermissionManager {
    fn default() -> Self {
        Self::new()
    }
}

fn summarise_input(input: &Value) -> String {
    match input {
        Value::Object(map) => {
            let parts: Vec<String> = map
                .iter()
                .take(5)
                .map(|(k, v)| {
                    let v_str = match v {
                        Value::String(s) => {
                            if s.len() > 80 { format!("\"{}...\"", &s[..77]) } else { format!("\"{s}\"") }
                        }
                        other => {
                            let s = other.to_string();
                            if s.len() > 80 { format!("{}...", &s[..77]) } else { s }
                        }
                    };
                    format!("{k}: {v_str}")
                })
                .collect();
            let suffix = if map.len() > 5 { format!(" (+{} more)", map.len() - 5) } else { String::new() };
            format!("{{{}}}{suffix}", parts.join(", "))
        }
        other => other.to_string(),
    }
}
