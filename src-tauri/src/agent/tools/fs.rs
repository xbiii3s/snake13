use std::path::{Path, PathBuf};

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::fs as async_fs;

use super::{PermissionLevel, Tool, ToolDefinition, ToolError, ToolOutput, ToolResult};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_path(workspace: &Path, requested: &str) -> ToolResult<PathBuf> {
    let requested = PathBuf::from(requested);
    let resolved = if requested.is_absolute() {
        requested
    } else {
        workspace.join(requested)
    };

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|e| ToolError::ExecutionFailed(format!("Cannot canonicalize workspace: {e}")))?;

    let canonical = if resolved.exists() {
        resolved.canonicalize().map_err(ToolError::Io)?
    } else {
        let parent = resolved
            .parent()
            .ok_or_else(|| ToolError::InvalidInput("Path has no parent".into()))?;
        let parent_canon = parent.canonicalize().map_err(ToolError::Io)?;
        parent_canon.join(
            resolved
                .file_name()
                .ok_or_else(|| ToolError::InvalidInput("Path has no file name".into()))?,
        )
    };

    if !canonical.starts_with(&canonical_workspace) {
        return Err(ToolError::PathNotAllowed(format!(
            "Path '{}' is outside the workspace '{}'",
            canonical.display(),
            canonical_workspace.display()
        )));
    }

    Ok(canonical)
}

// ===========================================================================
// fs_read
// ===========================================================================

pub struct FsRead {
    workspace: PathBuf,
}

impl FsRead {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

#[async_trait]
impl Tool for FsRead {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "fs_read".into(),
            description: "Read the contents of a file within the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative or absolute path to the file." },
                    "max_bytes": { "type": "integer", "description": "Maximum bytes to read.", "default": 1048576 }
                },
                "required": ["path"]
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Auto
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'path' must be a string".into()))?;
        let max_bytes = input["max_bytes"].as_u64().unwrap_or(1_048_576) as usize;

        let resolved = validate_path(&self.workspace, path_str)?;
        let bytes = async_fs::read(&resolved).await.map_err(ToolError::Io)?;

        let content = if bytes.len() > max_bytes {
            let truncated = &bytes[..max_bytes];
            let text = String::from_utf8_lossy(truncated).into_owned();
            format!("{text}\n\n--- truncated at {max_bytes} bytes ---")
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        };

        Ok(ToolOutput::with_metadata(
            content,
            json!({ "path": resolved.display().to_string(), "size": bytes.len() }),
        ))
    }
}

// ===========================================================================
// fs_write
// ===========================================================================

pub struct FsWrite {
    workspace: PathBuf,
}

impl FsWrite {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

#[async_trait]
impl Tool for FsWrite {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "fs_write".into(),
            description: "Write content to a file within the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative or absolute path to the file." },
                    "content": { "type": "string", "description": "The content to write." },
                    "append": { "type": "boolean", "description": "Append instead of overwrite.", "default": false }
                },
                "required": ["path", "content"]
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Approval
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'path' must be a string".into()))?;
        let content = input["content"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'content' must be a string".into()))?;
        let append = input["append"].as_bool().unwrap_or(false);

        let resolved = validate_path(&self.workspace, path_str)?;

        if let Some(parent) = resolved.parent() {
            async_fs::create_dir_all(parent).await.map_err(ToolError::Io)?;
        }

        if append {
            use tokio::io::AsyncWriteExt;
            let mut file = async_fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&resolved)
                .await
                .map_err(ToolError::Io)?;
            file.write_all(content.as_bytes()).await.map_err(ToolError::Io)?;
        } else {
            async_fs::write(&resolved, content.as_bytes()).await.map_err(ToolError::Io)?;
        }

        Ok(ToolOutput::with_metadata(
            format!(
                "Successfully {} {} bytes to {}",
                if append { "appended" } else { "wrote" },
                content.len(),
                resolved.display()
            ),
            json!({ "path": resolved.display().to_string(), "bytes_written": content.len(), "append": append }),
        ))
    }
}

// ===========================================================================
// fs_list
// ===========================================================================

pub struct FsList {
    workspace: PathBuf,
}

impl FsList {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

#[async_trait]
impl Tool for FsList {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "fs_list".into(),
            description: "List files and directories at a given path.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Directory path.", "default": "." },
                    "recursive": { "type": "boolean", "default": false },
                    "max_entries": { "type": "integer", "default": 500 }
                },
                "required": []
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Auto
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let path_str = input["path"].as_str().unwrap_or(".");
        let recursive = input["recursive"].as_bool().unwrap_or(false);
        let max_entries = input["max_entries"].as_u64().unwrap_or(500) as usize;

        let resolved = validate_path(&self.workspace, path_str)?;
        let mut entries = Vec::new();
        collect_entries(&resolved, &resolved, recursive, max_entries, &mut entries).await?;

        let lines: Vec<String> = entries
            .iter()
            .map(|e| {
                let kind = if e.is_dir { "dir " } else { "file" };
                let size_str = if e.is_dir { String::new() } else { format!("  ({} bytes)", e.size) };
                format!("[{kind}] {}{size_str}", e.relative_path)
            })
            .collect();

        let total = entries.len();
        let output = if lines.is_empty() { "Directory is empty.".to_string() } else { lines.join("\n") };

        Ok(ToolOutput::with_metadata(output, json!({ "total_entries": total, "truncated": total >= max_entries })))
    }
}

struct DirEntry {
    relative_path: String,
    is_dir: bool,
    size: u64,
}

async fn collect_entries(
    base: &Path, dir: &Path, recursive: bool, max: usize, out: &mut Vec<DirEntry>,
) -> ToolResult<()> {
    let mut read_dir = async_fs::read_dir(dir).await.map_err(ToolError::Io)?;
    while let Some(entry) = read_dir.next_entry().await.map_err(ToolError::Io)? {
        if out.len() >= max { break; }
        let metadata = entry.metadata().await.map_err(ToolError::Io)?;
        let rel = entry.path().strip_prefix(base).unwrap_or(entry.path().as_path()).to_string_lossy().into_owned();
        out.push(DirEntry { relative_path: rel, is_dir: metadata.is_dir(), size: metadata.len() });
        if recursive && metadata.is_dir() && out.len() < max {
            Box::pin(collect_entries(base, &entry.path(), true, max, out)).await?;
        }
    }
    Ok(())
}

// ===========================================================================
// fs_search
// ===========================================================================

pub struct FsSearch {
    workspace: PathBuf,
}

impl FsSearch {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

#[async_trait]
impl Tool for FsSearch {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "fs_search".into(),
            description: "Search for files by name or content pattern.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "default": "." },
                    "pattern": { "type": "string", "description": "File name substring to match." },
                    "content_pattern": { "type": "string", "description": "Content substring to search." },
                    "max_results": { "type": "integer", "default": 50 }
                },
                "required": []
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Auto
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let path_str = input["path"].as_str().unwrap_or(".");
        let name_pattern = input["pattern"].as_str().map(|s| s.to_lowercase());
        let content_pattern = input["content_pattern"].as_str().map(|s| s.to_string());
        let max_results = input["max_results"].as_u64().unwrap_or(50) as usize;

        let resolved = validate_path(&self.workspace, path_str)?;
        let mut results: Vec<String> = Vec::new();
        search_recursive(&resolved, &resolved, name_pattern.as_deref(), content_pattern.as_deref(), max_results, &mut results).await?;

        let total = results.len();
        let output = if results.is_empty() { "No matches found.".to_string() } else { results.join("\n") };
        Ok(ToolOutput::with_metadata(output, json!({ "total_results": total, "truncated": total >= max_results })))
    }
}

async fn search_recursive(
    base: &Path, dir: &Path, name_pattern: Option<&str>, content_pattern: Option<&str>, max: usize, out: &mut Vec<String>,
) -> ToolResult<()> {
    let mut read_dir = async_fs::read_dir(dir).await.map_err(ToolError::Io)?;
    while let Some(entry) = read_dir.next_entry().await.map_err(ToolError::Io)? {
        if out.len() >= max { break; }
        let metadata = entry.metadata().await.map_err(ToolError::Io)?;
        let path = entry.path();
        let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().into_owned();

        if metadata.is_file() {
            let name_lower = entry.file_name().to_string_lossy().to_lowercase();
            let name_matches = name_pattern.map(|p| name_lower.contains(p)).unwrap_or(true);
            if name_matches {
                if let Some(cp) = content_pattern {
                    if metadata.len() < 2_000_000 {
                        if let Ok(text) = async_fs::read_to_string(&path).await {
                            for (i, line) in text.lines().enumerate() {
                                if out.len() >= max { break; }
                                if line.contains(cp) {
                                    out.push(format!("{}:{}: {}", rel, i + 1, line.trim()));
                                }
                            }
                        }
                    }
                } else {
                    out.push(rel);
                }
            }
        } else if metadata.is_dir() {
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if !dir_name.starts_with('.') {
                Box::pin(search_recursive(base, &path, name_pattern, content_pattern, max, out)).await?;
            }
        }
    }
    Ok(())
}
