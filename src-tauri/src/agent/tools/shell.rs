use std::path::PathBuf;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::process::Command;

use super::{PermissionLevel, Tool, ToolDefinition, ToolError, ToolOutput, ToolResult};

const BLOCKED_PATTERNS: &[&str] = &[
    "rm -rf /", "rm -rf ~", "rm -rf /*", "rm -rf ~/*",
    "sudo ", "su ", "chmod 777", "mkfs", "dd if=",
    "> /dev/sd", "> /dev/disk",
    ":(){ :|:", "shutdown", "reboot", "halt", "poweroff",
    "init 0", "init 6", "launchctl unload", "csrutil disable",
    "nvram ", "diskutil eraseDisk", "diskutil partitionDisk",
    "curl | sh", "curl | bash", "wget | sh", "wget | bash",
];

pub struct ShellExec {
    working_dir: PathBuf,
}

impl ShellExec {
    pub fn new(working_dir: PathBuf) -> Self {
        Self { working_dir }
    }

    fn check_blocklist(command: &str) -> ToolResult<()> {
        let lower = command.to_lowercase();
        for pattern in BLOCKED_PATTERNS {
            if lower.contains(&pattern.to_lowercase()) {
                return Err(ToolError::CommandBlocked(format!(
                    "Command contains blocked pattern: '{pattern}'"
                )));
            }
        }
        Ok(())
    }
}

#[async_trait]
impl Tool for ShellExec {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "shell_exec".into(),
            description: "Execute a shell command in the workspace directory.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "The shell command to execute." },
                    "timeout_secs": { "type": "integer", "default": 30 },
                    "working_dir": { "type": "string", "description": "Working directory override." }
                },
                "required": ["command"]
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Approval
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let command = input["command"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'command' must be a string".into()))?;

        let timeout_secs = input["timeout_secs"].as_u64().unwrap_or(30).min(300);

        Self::check_blocklist(command)?;

        let cwd = if let Some(wd) = input["working_dir"].as_str() {
            let wd_path = PathBuf::from(wd);
            let canonical_workspace = self.working_dir.canonicalize().map_err(ToolError::Io)?;
            let canonical_wd = wd_path.canonicalize().map_err(ToolError::Io)?;
            if !canonical_wd.starts_with(&canonical_workspace) {
                return Err(ToolError::PathNotAllowed(format!(
                    "Working directory '{}' is outside the workspace",
                    wd_path.display()
                )));
            }
            canonical_wd
        } else {
            self.working_dir.clone()
        };

        let result = tokio::time::timeout(
            Duration::from_secs(timeout_secs),
            Command::new("sh")
                .arg("-c")
                .arg(command)
                .current_dir(&cwd)
                .output(),
        )
        .await;

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
                let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
                let exit_code = output.status.code().unwrap_or(-1);

                let mut content = String::new();
                if !stdout.is_empty() { content.push_str(&stdout); }
                if !stderr.is_empty() {
                    if !content.is_empty() { content.push_str("\n--- stderr ---\n"); }
                    content.push_str(&stderr);
                }
                if content.is_empty() { content = "(no output)".to_string(); }

                Ok(ToolOutput {
                    content,
                    metadata: Some(json!({ "exit_code": exit_code, "command": command, "working_dir": cwd.display().to_string() })),
                    is_error: exit_code != 0,
                })
            }
            Ok(Err(e)) => Err(ToolError::ExecutionFailed(format!("Failed to execute command: {e}"))),
            Err(_) => Err(ToolError::Timeout),
        }
    }
}
