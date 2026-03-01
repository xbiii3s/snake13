use std::sync::Arc;

use serde_json::Value;
use tauri::State;

use crate::core::stream::{self, ApiMessage, StreamEvent};
use crate::data::repo::{
    conversation::{ConversationRepo, CreateConversation, UpdateConversation},
    message::{CreateMessage, MessageRepo},
    settings::SettingsRepo,
    template::TemplateRepo,
};
use crate::error::AppResult;
use crate::mcp::manager::{McpServerConfig, McpServerInfo};
use crate::AppState;

/// Temporary greeting command for testing IPC
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Claude Desktop Pro.", name)
}

// ===================== Conversation Commands =====================

#[tauri::command]
pub fn conversation_create(
    state: State<'_, AppState>,
    input: CreateConversation,
) -> AppResult<crate::data::repo::conversation::Conversation> {
    // Validate input lengths
    if let Some(ref title) = input.title {
        if title.len() > 500 {
            return Err(crate::error::AppError::Validation("Title must be 500 characters or less".into()));
        }
    }
    if let Some(ref prompt) = input.system_prompt {
        if prompt.len() > 50_000 {
            return Err(crate::error::AppError::Validation("System prompt must be 50000 characters or less".into()));
        }
    }
    state.db.with_conn(|conn| ConversationRepo::create(conn, &input))
}

#[tauri::command]
pub fn conversation_list(
    state: State<'_, AppState>,
    include_archived: Option<bool>,
) -> AppResult<Vec<crate::data::repo::conversation::Conversation>> {
    state
        .db
        .with_conn(|conn| ConversationRepo::list(conn, include_archived.unwrap_or(false)))
}

#[tauri::command]
pub fn conversation_get(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<crate::data::repo::conversation::Conversation> {
    state.db.with_conn(|conn| ConversationRepo::get_by_id(conn, &id))
}

#[tauri::command]
pub fn conversation_update(
    state: State<'_, AppState>,
    id: String,
    input: UpdateConversation,
) -> AppResult<crate::data::repo::conversation::Conversation> {
    state
        .db
        .with_conn(|conn| ConversationRepo::update(conn, &id, &input))
}

#[tauri::command]
pub fn conversation_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.with_conn(|conn| ConversationRepo::delete(conn, &id))
}

// ===================== Message Commands =====================

#[tauri::command]
pub fn message_create(
    state: State<'_, AppState>,
    input: CreateMessage,
) -> AppResult<crate::data::repo::message::Message> {
    if input.content.len() > 500_000 {
        return Err(crate::error::AppError::Validation("Message content must be 500000 characters or less".into()));
    }
    state.db.with_conn(|conn| MessageRepo::create(conn, &input))
}

#[tauri::command]
pub fn message_list(
    state: State<'_, AppState>,
    conversation_id: String,
) -> AppResult<Vec<crate::data::repo::message::Message>> {
    state
        .db
        .with_conn(|conn| MessageRepo::list_by_conversation(conn, &conversation_id))
}

#[tauri::command]
pub fn message_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> AppResult<Vec<crate::data::repo::message::SearchResult>> {
    // Validate search query to prevent abuse
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if query.len() > 1000 {
        return Err(crate::error::AppError::Validation(
            "Search query must be 1000 characters or less".to_string(),
        ));
    }
    let limit = limit.unwrap_or(20).min(100); // Cap maximum results
    state
        .db
        .with_conn(|conn| MessageRepo::search(conn, &query, limit))
}

// ===================== Chat Stream Command =====================

#[tauri::command]
pub async fn chat_send(
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
    model_id: String,
    enable_thinking: bool,
    on_event: tauri::ipc::Channel<StreamEvent>,
) -> AppResult<crate::data::repo::message::Message> {
    // 1. Check if API key is configured (from macOS Keychain)
    let api_key = crate::data::secure::SecureStore::get_api_key()?;

    // Construct proxy URL from separate settings
    let proxy_url = {
        let proxy_type = state.db.with_conn(|conn| SettingsRepo::get(conn, "proxy_type"))?;
        let proxy_host = state.db.with_conn(|conn| SettingsRepo::get(conn, "proxy_host"))?;
        let proxy_port = state.db.with_conn(|conn| SettingsRepo::get(conn, "proxy_port"))?;

        match (proxy_type.as_deref(), proxy_host, proxy_port) {
            (Some("http"), Some(h), Some(p)) if !h.is_empty() && !p.is_empty() => {
                Some(format!("http://{}:{}", h, p))
            }
            (Some("socks5"), Some(h), Some(p)) if !h.is_empty() && !p.is_empty() => {
                Some(format!("socks5://{}:{}", h, p))
            }
            _ => None,
        }
    };

    // 2. Get conversation details (for system prompt)
    let conversation = state.db.with_conn(|conn| ConversationRepo::get_by_id(conn, &conversation_id))?;

    // 3. Save user message
    let user_msg = state.db.with_conn(|conn| {
        MessageRepo::create(
            conn,
            &CreateMessage {
                conversation_id: conversation_id.clone(),
                parent_id: None,
                role: "user".to_string(),
                content: content.clone(),
                model_used: None,
                tokens_in: None,
                tokens_out: None,
                cost: None,
                thinking_content: None,
                thinking_duration_ms: None,
                attachments: None,
                tool_calls: None,
            },
        )
    })?;

    // 4. Determine whether to use real API or mock
    let has_api_key = api_key
        .as_ref()
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false);

    if has_api_key {
        // Safety: has_api_key is true only when api_key is Some with non-empty content
        let api_key = api_key.ok_or_else(|| crate::error::AppError::Internal(
            "API key unexpectedly missing".to_string()
        ))?;

        // Build messages history from database
        let db_messages = state
            .db
            .with_conn(|conn| MessageRepo::list_by_conversation(conn, &conversation_id))?;

        let mut api_messages: Vec<ApiMessage> = Vec::new();
        for msg in &db_messages {
            // Only include user and assistant messages
            if msg.role != "user" && msg.role != "assistant" {
                continue;
            }
            api_messages.push(ApiMessage {
                role: msg.role.clone(),
                content: serde_json::Value::String(msg.content.clone()),
            });
        }

        // Stream real API response
        stream::claude_stream(
            on_event.clone(),
            &api_key,
            &model_id,
            api_messages,
            conversation.system_prompt.as_deref(),
            enable_thinking,
            None, // tools
            None, // max_tokens (defaults to 8192)
            proxy_url.as_deref(),
        )
        .await?;

        // Save assistant message placeholder (content was streamed)
        let assistant_msg = state.db.with_conn(|conn| {
            MessageRepo::create(
                conn,
                &CreateMessage {
                    conversation_id: conversation_id.clone(),
                    parent_id: Some(user_msg.id.clone()),
                    role: "assistant".to_string(),
                    content: "[Streamed response]".to_string(),
                    model_used: Some(model_id.clone()),
                    tokens_in: None,
                    tokens_out: None,
                    cost: None,
                    thinking_content: None,
                    thinking_duration_ms: None,
                    attachments: None,
                    tool_calls: None,
                },
            )
        })?;

        Ok(assistant_msg)
    } else {
        // Fall back to mock stream
        stream::mock_stream(on_event.clone(), &model_id, &content, enable_thinking).await?;

        // Save assistant message (with mock content)
        let assistant_msg = state.db.with_conn(|conn| {
            MessageRepo::create(
                conn,
                &CreateMessage {
                    conversation_id: conversation_id.clone(),
                    parent_id: Some(user_msg.id.clone()),
                    role: "assistant".to_string(),
                    content: "[Mock response - see stream]".to_string(),
                    model_used: Some(model_id.clone()),
                    tokens_in: Some(150),
                    tokens_out: Some(200),
                    cost: Some(0.001),
                    thinking_content: if enable_thinking {
                        Some("Mock thinking content".to_string())
                    } else {
                        None
                    },
                    thinking_duration_ms: if enable_thinking { Some(2500) } else { None },
                    attachments: None,
                    tool_calls: None,
                },
            )
        })?;

        Ok(assistant_msg)
    }
}

// ===================== Chat Cancel Command =====================

#[tauri::command]
pub fn chat_cancel() {
    stream::request_cancel();
}

// ===================== Settings Commands =====================

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    state.db.with_conn(|conn| SettingsRepo::get(conn, &key))
}

#[tauri::command]
pub fn settings_set(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    state
        .db
        .with_conn(|conn| SettingsRepo::set(conn, &key, &value))
}

// ===================== MCP Commands =====================

#[tauri::command]
pub async fn mcp_add_server(state: State<'_, AppState>, config: McpServerConfig) -> AppResult<()> {
    state.mcp.add_server(config).await;
    Ok(())
}

#[tauri::command]
pub async fn mcp_remove_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.mcp.remove_server(&id).await
}

#[tauri::command]
pub async fn mcp_connect(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.mcp.connect(&id).await
}

#[tauri::command]
pub async fn mcp_disconnect(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.mcp.disconnect(&id).await
}

#[tauri::command]
pub async fn mcp_list_servers(state: State<'_, AppState>) -> AppResult<Vec<McpServerInfo>> {
    Ok(state.mcp.list_servers().await)
}

#[tauri::command]
pub async fn mcp_call_tool(
    state: State<'_, AppState>,
    server_id: String,
    tool_name: String,
    arguments: Value,
) -> AppResult<Value> {
    let result = state.mcp.call_tool(&server_id, &tool_name, arguments).await?;
    serde_json::to_value(result).map_err(|e| crate::error::AppError::Internal(e.to_string()))
}

#[tauri::command]
pub async fn mcp_import_config(
    state: State<'_, AppState>,
    json_config: String,
) -> AppResult<Vec<McpServerConfig>> {
    let configs = crate::mcp::manager::McpManager::parse_claude_config(&json_config)?;
    for config in &configs {
        state.mcp.add_server(config.clone()).await;
    }
    Ok(configs)
}

// ===================== Agent Commands =====================

#[tauri::command]
pub fn agent_list_tools(state: State<'_, AppState>) -> AppResult<Vec<crate::agent::tools::ToolDefinition>> {
    Ok(state.tools.definitions())
}

#[tauri::command]
pub async fn agent_execute_tool(
    state: State<'_, AppState>,
    tool_name: String,
    input: Value,
) -> AppResult<crate::agent::tools::ToolOutput> {
    // Check permission first
    let tool = state.tools.get(&tool_name)
        .ok_or_else(|| crate::error::AppError::NotFound(format!("Tool '{}' not found", tool_name)))?;

    let level = state.permissions.check(&tool_name, tool.permission_level())
        .map_err(|e| crate::error::AppError::PermissionDenied(e.to_string()))?;

    // If approval needed, return error (frontend should show approval dialog)
    if level == crate::agent::tools::PermissionLevel::Approval {
        return Err(crate::error::AppError::PermissionDenied(
            format!("Tool '{}' requires approval", tool_name)
        ));
    }

    let output = tool.execute(input).await
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    Ok(output)
}

#[tauri::command]
pub fn agent_decide_permission(
    state: State<'_, AppState>,
    tool_name: String,
    decision: crate::agent::security::PermissionDecision,
) -> AppResult<()> {
    state.permissions.apply_decision(&tool_name, decision);
    Ok(())
}

#[tauri::command]
pub async fn agent_execute_tools(
    state: State<'_, AppState>,
    tool_calls: Vec<crate::agent::runtime::ToolUseRequest>,
) -> AppResult<Vec<crate::agent::runtime::ToolResult>> {
    let runtime = crate::agent::runtime::AgentRuntime::new(
        Arc::clone(&state.tools),
        Arc::clone(&state.permissions),
    );
    let results = runtime.execute_tools(&tool_calls).await;
    Ok(results)
}

// ===================== Folder Commands =====================

#[tauri::command]
pub fn folder_create(
    state: State<'_, AppState>,
    input: crate::data::repo::folder::CreateFolder,
) -> AppResult<crate::data::repo::folder::Folder> {
    if input.name.is_empty() || input.name.len() > 200 {
        return Err(crate::error::AppError::Validation("Folder name must be 1-200 characters".into()));
    }
    state.db.with_conn(|conn| crate::data::repo::folder::FolderRepo::create(conn, &input))
}

#[tauri::command]
pub fn folder_list(state: State<'_, AppState>) -> AppResult<Vec<crate::data::repo::folder::Folder>> {
    state.db.with_conn(|conn| crate::data::repo::folder::FolderRepo::list(conn))
}

#[tauri::command]
pub fn folder_update(
    state: State<'_, AppState>,
    id: String,
    input: crate::data::repo::folder::UpdateFolder,
) -> AppResult<crate::data::repo::folder::Folder> {
    state.db.with_conn(|conn| crate::data::repo::folder::FolderRepo::update(conn, &id, &input))
}

#[tauri::command]
pub fn folder_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.with_conn(|conn| crate::data::repo::folder::FolderRepo::delete(conn, &id))
}

// ===================== Usage Commands =====================

#[tauri::command]
pub fn usage_record(
    state: State<'_, AppState>,
    conversation_id: String,
    model_id: String,
    input_tokens: i64,
    output_tokens: i64,
    cost: f64,
) -> AppResult<()> {
    state.db.with_conn(|conn| {
        crate::data::repo::usage::UsageRepo::record_message(conn, &conversation_id, &model_id, input_tokens, output_tokens, cost)
    })
}

#[tauri::command]
pub fn usage_summary(
    state: State<'_, AppState>,
    from_date: String,
    to_date: String,
) -> AppResult<Vec<crate::data::repo::usage::UsageSummary>> {
    state.db.with_conn(|conn| {
        crate::data::repo::usage::UsageRepo::summary_by_model(conn, &from_date, &to_date)
    })
}

#[tauri::command]
pub fn usage_daily(
    state: State<'_, AppState>,
    from_date: String,
    to_date: String,
) -> AppResult<Vec<crate::data::repo::usage::DailyUsage>> {
    state.db.with_conn(|conn| {
        crate::data::repo::usage::UsageRepo::daily_usage(conn, &from_date, &to_date)
    })
}

#[tauri::command]
pub fn usage_total(state: State<'_, AppState>) -> AppResult<crate::data::repo::usage::UsageSummary> {
    state.db.with_conn(|conn| crate::data::repo::usage::UsageRepo::total(conn))
}

// ===================== Import/Export Commands =====================

#[tauri::command]
pub fn export_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
    format: String,
) -> AppResult<String> {
    state.db.with_conn(|conn| {
        let conv = ConversationRepo::get_by_id(conn, &conversation_id)?;
        let msgs = MessageRepo::list_by_conversation(conn, &conversation_id)?;

        match format.as_str() {
            "markdown" => {
                let mut md = format!("# {}\n\n", conv.title);
                md.push_str(&format!("*Model: {} | Created: {}*\n\n---\n\n", conv.model_id, conv.created_at));
                for msg in &msgs {
                    let role_label = if msg.role == "user" { "**You**" } else { "**Claude**" };
                    md.push_str(&format!("### {}\n\n{}\n\n", role_label, msg.content));
                }
                Ok(md)
            }
            _ => {
                // JSON format (default)
                let export = serde_json::json!({
                    "version": "1.0",
                    "conversation": conv,
                    "messages": msgs,
                    "exported_at": chrono::Utc::now().to_rfc3339(),
                });
                serde_json::to_string_pretty(&export)
                    .map_err(|e| crate::error::AppError::Internal(e.to_string()))
            }
        }
    })
}

#[tauri::command]
pub fn import_conversation(
    state: State<'_, AppState>,
    json_data: String,
) -> AppResult<crate::data::repo::conversation::Conversation> {
    let parsed: Value = serde_json::from_str(&json_data)?;

    let title = parsed["conversation"]["title"]
        .as_str()
        .unwrap_or("Imported Chat")
        .to_string();
    let model_id = parsed["conversation"]["model_id"]
        .as_str()
        .unwrap_or("claude-sonnet-4-5")
        .to_string();

    state.db.with_conn(|conn| {
        // Create new conversation
        let conv = ConversationRepo::create(conn, &CreateConversation {
            title: Some(title),
            model_id: Some(model_id),
            system_prompt: None,
            folder_id: None,
            agent_mode: None,
        })?;

        // Import messages
        if let Some(messages) = parsed["messages"].as_array() {
            for msg in messages {
                let role = msg["role"].as_str().unwrap_or("user").to_string();
                let content = msg["content"].as_str().unwrap_or("").to_string();
                if content.is_empty() { continue; }

                MessageRepo::create(conn, &crate::data::repo::message::CreateMessage {
                    conversation_id: conv.id.clone(),
                    parent_id: None,
                    role,
                    content,
                    model_used: msg["model_used"].as_str().map(|s| s.to_string()),
                    tokens_in: msg["tokens_in"].as_i64(),
                    tokens_out: msg["tokens_out"].as_i64(),
                    cost: msg["cost"].as_f64(),
                    thinking_content: msg["thinking_content"].as_str().map(|s| s.to_string()),
                    thinking_duration_ms: msg["thinking_duration_ms"].as_i64(),
                    attachments: None,
                    tool_calls: None,
                })?;
            }
        }

        Ok(conv)
    })
}

// ===================== Template Commands =====================

/// Create a new conversation template
#[tauri::command]
pub fn template_create(
    state: State<'_, AppState>,
    input: crate::data::repo::template::CreateTemplate,
) -> AppResult<crate::data::repo::template::Template> {
    state.db.with_conn(|conn| TemplateRepo::create(conn, &input))
}

/// List all conversation templates
#[tauri::command]
pub fn template_list(state: State<'_, AppState>) -> AppResult<Vec<crate::data::repo::template::Template>> {
    state.db.with_conn(|conn| TemplateRepo::list(conn))
}

/// Update an existing template
#[tauri::command]
pub fn template_update(
    state: State<'_, AppState>,
    id: String,
    input: crate::data::repo::template::UpdateTemplate,
) -> AppResult<crate::data::repo::template::Template> {
    state.db.with_conn(|conn| TemplateRepo::update(conn, &id, &input))
}

/// Delete a template by ID
#[tauri::command]
pub fn template_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.with_conn(|conn| TemplateRepo::delete(conn, &id))
}

// ===================== Conversation Fork Command =====================

/// Fork a conversation from a specific message, copying all messages up to and including the target
#[tauri::command]
pub fn conversation_fork(
    state: State<'_, AppState>,
    conversation_id: String,
    from_message_id: String,
) -> AppResult<crate::data::repo::conversation::Conversation> {
    state.db.with_conn(|conn| {
        // Get the original conversation
        let orig = ConversationRepo::get_by_id(conn, &conversation_id)?;

        // Create a new conversation based on the original
        let forked = ConversationRepo::create(conn, &CreateConversation {
            title: Some(format!("{} (fork)", orig.title)),
            model_id: Some(orig.model_id.clone()),
            system_prompt: orig.system_prompt.clone(),
            folder_id: orig.folder_id.clone(),
            agent_mode: Some(orig.agent_mode),
        })?;

        // Copy messages up to and including from_message_id
        let messages = MessageRepo::list_by_conversation(conn, &conversation_id)?;
        for msg in &messages {
            MessageRepo::create(conn, &CreateMessage {
                conversation_id: forked.id.clone(),
                parent_id: None,
                role: msg.role.clone(),
                content: msg.content.clone(),
                model_used: msg.model_used.clone(),
                tokens_in: Some(msg.tokens_in),
                tokens_out: Some(msg.tokens_out),
                cost: Some(msg.cost),
                thinking_content: msg.thinking_content.clone(),
                thinking_duration_ms: Some(msg.thinking_duration_ms.unwrap_or(0)),
                attachments: None,
                tool_calls: None,
            })?;
            // Stop after copying the target message
            if msg.id == from_message_id {
                break;
            }
        }

        Ok(forked)
    })
}

// ===================== Secure Store Commands =====================

/// Store the API key securely in macOS Keychain
#[tauri::command]
pub fn secure_set_api_key(key: String) -> AppResult<()> {
    crate::data::secure::SecureStore::set_api_key(&key)
}

/// Retrieve the API key from macOS Keychain
#[tauri::command]
pub fn secure_get_api_key() -> AppResult<Option<String>> {
    crate::data::secure::SecureStore::get_api_key()
}

/// Delete the API key from macOS Keychain
#[tauri::command]
pub fn secure_delete_api_key() -> AppResult<()> {
    crate::data::secure::SecureStore::delete_api_key()
}

// ===================== Auto-start Commands =====================

/// Enable or disable launch at startup
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> AppResult<()> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| crate::error::AppError::Internal(format!("Failed to enable autostart: {}", e)))?;
    } else {
        manager.disable().map_err(|e| crate::error::AppError::Internal(format!("Failed to disable autostart: {}", e)))?;
    }
    Ok(())
}

/// Check if auto-start is currently enabled
#[tauri::command]
pub fn get_autostart(app: tauri::AppHandle) -> AppResult<bool> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    manager.is_enabled().map_err(|e| crate::error::AppError::Internal(format!("Failed to check autostart: {}", e)))
}

// ===================== Desktop Notification Command =====================

/// Send a macOS desktop notification
#[tauri::command]
pub async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> AppResult<()> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| crate::error::AppError::Internal(format!("Notification failed: {}", e)))?;
    Ok(())
}
