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
        let overrides = match self.overrides.read() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!("PermissionManager RwLock poisoned on read, recovering");
                poisoned.into_inner()
            }
        };
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
        let mut overrides = match self.overrides.write() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!("PermissionManager RwLock poisoned on write, recovering");
                poisoned.into_inner()
            }
        };
        match decision {
            PermissionDecision::AllowAlways => {
                overrides.insert(tool_name.to_string(), PermissionLevel::Auto);
            }
            PermissionDecision::DenyAlways => {
                overrides.insert(tool_name.to_string(), PermissionLevel::Deny);
            }
            PermissionDecision::Allow | PermissionDecision::Deny => {}
        }
    }

    pub fn set_override(&self, tool_name: impl Into<String>, level: PermissionLevel) {
        let mut overrides = match self.overrides.write() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!("PermissionManager RwLock poisoned on write, recovering");
                poisoned.into_inner()
            }
        };
        overrides.insert(tool_name.into(), level);
    }

    pub fn remove_override(&self, tool_name: &str) {
        let mut overrides = match self.overrides.write() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!("PermissionManager RwLock poisoned on write, recovering");
                poisoned.into_inner()
            }
        };
        overrides.remove(tool_name);
    }

    pub fn list_overrides(&self) -> Vec<PermissionRule> {
        let overrides = match self.overrides.read() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!("PermissionManager RwLock poisoned on read, recovering");
                poisoned.into_inner()
            }
        };
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
        let mut overrides = match self.overrides.write() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!("PermissionManager RwLock poisoned on write, recovering");
                poisoned.into_inner()
            }
        };
        for rule in rules {
            overrides.insert(rule.tool_name.clone(), rule.level);
        }
    }

    pub fn clear_overrides(&self) {
        let mut overrides = match self.overrides.write() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!("PermissionManager RwLock poisoned on write, recovering");
                poisoned.into_inner()
            }
        };
        overrides.clear();
    }

    pub fn create_request(
        &self,
        tool_name: &str,
        description: &str,
        input: &Value,
    ) -> PermissionRequest {
        let id = uuid::Uuid::now_v7().to_string();
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

fn truncate_str(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let truncated: String = s.chars().take(max_chars.saturating_sub(3)).collect();
    format!("{truncated}...")
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
                            if s.chars().count() > 80 { format!("\"{}\"", truncate_str(s, 80)) } else { format!("\"{s}\"") }
                        }
                        other => {
                            let s = other.to_string();
                            if s.chars().count() > 80 { truncate_str(&s, 80) } else { s }
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
