use std::path::PathBuf;
use std::time::Duration;

use async_trait::async_trait;
use regex::Regex;
use serde_json::{json, Value};
use tokio::process::Command;

use super::{PermissionLevel, Tool, ToolDefinition, ToolError, ToolOutput, ToolResult};

/// Blocked command patterns as regex strings.
/// Uses word boundaries and flexible whitespace to prevent simple bypass tricks
/// like inserting extra spaces or using single quotes instead of double quotes.
const BLOCKED_REGEX_PATTERNS: &[&str] = &[
    r"rm\s+(-\w+\s+)*-r\w*\s+/",     // rm -rf / variants
    r"rm\s+(-\w+\s+)*-r\w*\s+~",      // rm -rf ~ variants
    r"\bsudo\b",                        // sudo
    r"\bsu\s",                          // su (followed by space)
    r"chmod\s+777",                     // chmod 777
    r"\bmkfs\b",                        // mkfs
    r"\bdd\s+if=",                      // dd if=
    r">\s*/dev/",                       // redirect to /dev/
    r":\(\)\s*\{",                      // fork bomb
    r"\bshutdown\b",                    // shutdown
    r"\breboot\b",                      // reboot
    r"\bhalt\b",                        // halt
    r"\bpoweroff\b",                    // poweroff
    r"\binit\s+[06]\b",                // init 0/6
    r"\blaunchctl\s+unload\b",         // launchctl unload
    r"\bcsrutil\s+disable\b",          // csrutil disable
    r"\bnvram\b",                       // nvram
    r"diskutil\s+(erase|partition)",    // diskutil eraseDisk/partitionDisk
    r"curl\s+.*\|\s*(sh|bash)",         // curl | sh/bash
    r"wget\s+.*\|\s*(sh|bash)",         // wget | sh/bash
];

/// Shell command execution tool with security blocklist
pub struct ShellExec {
    working_dir: PathBuf,
    blocked_patterns: Vec<Regex>,
}

impl ShellExec {
    /// Create a new ShellExec tool.
    ///
    /// Compiles blocked command regex patterns at initialization time
    /// so they don't need to be recompiled on every invocation.
    pub fn new(working_dir: PathBuf) -> Self {
        let blocked_patterns = BLOCKED_REGEX_PATTERNS
            .iter()
            .filter_map(|p| {
                regex::RegexBuilder::new(p)
                    .case_insensitive(true)
                    .build()
                    .ok()
            })
            .collect();
        Self {
            working_dir,
            blocked_patterns,
        }
    }

    fn check_blocklist(&self, command: &str) -> ToolResult<()> {
        for pattern in &self.blocked_patterns {
            if pattern.is_match(command) {
                return Err(ToolError::CommandBlocked(format!(
                    "Command matches blocked pattern: '{}'",
                    pattern.as_str()
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

        self.check_blocklist(command)?;

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
                if !stdout.is_empty() {
                    content.push_str(&stdout);
                }
                if !stderr.is_empty() {
                    if !content.is_empty() {
                        content.push_str("\n--- stderr ---\n");
                    }
                    content.push_str(&stderr);
                }
                if content.is_empty() {
                    content = "(no output)".to_string();
                }

                Ok(ToolOutput {
                    content,
                    metadata: Some(json!({
                        "exit_code": exit_code,
                        "command": command,
                        "working_dir": cwd.display().to_string()
                    })),
                    is_error: exit_code != 0,
                })
            }
            Ok(Err(e)) => Err(ToolError::ExecutionFailed(format!(
                "Failed to execute command: {e}"
            ))),
            Err(_) => Err(ToolError::Timeout),
        }
    }
}
