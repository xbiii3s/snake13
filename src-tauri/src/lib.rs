mod agent;
mod commands;
mod core;
mod data;
mod error;
mod mcp;
mod system;

use std::sync::Arc;
use tauri::{Emitter, Manager};

/// Global application state managed by Tauri
pub struct AppState {
    pub db: Arc<data::Database>,
    pub mcp: Arc<mcp::manager::McpManager>,
    pub tools: Arc<agent::tools::ToolRegistry>,
    pub permissions: Arc<agent::security::PermissionManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // Initialize database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            let db_path = app_data_dir.join("claude-desktop-pro.db");

            log::info!("Database path: {}", db_path.display());

            let db = data::Database::new(db_path)
                .expect("Failed to open database");
            db.run_migrations()
                .expect("Failed to run database migrations");

            let mcp_manager = mcp::manager::McpManager::new();

            let tool_registry = agent::tools::ToolRegistry::with_defaults(&app_data_dir);
            let permission_manager = agent::security::PermissionManager::new();

            let state = AppState {
                db: Arc::new(db),
                mcp: Arc::new(mcp_manager),
                tools: Arc::new(tool_registry),
                permissions: Arc::new(permission_manager),
            };
            app.manage(state);

            // Setup system tray
            let handle = app.handle().clone();
            if let Err(e) = system::tray::setup_tray(&handle) {
                log::warn!("Failed to setup tray: {}", e);
            }

            // Register global shortcuts
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let spotlight_shortcut =
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
                let handle_clone = handle.clone();

                if let Err(e) = app.global_shortcut().on_shortcut(
                    spotlight_shortcut,
                    move |_app, shortcut, event| {
                        if event.state == ShortcutState::Pressed
                            && shortcut == &spotlight_shortcut
                        {
                            if let Some(window) = handle_clone.get_webview_window("main") {
                                let _ = window.emit("global-shortcut", "spotlight");
                                let _ = window.set_focus();
                            }
                        }
                    },
                ) {
                    log::warn!("Failed to register global shortcuts: {}", e);
                }
            }

            log::info!("Claude Desktop Pro initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::conversation_create,
            commands::conversation_list,
            commands::conversation_get,
            commands::conversation_update,
            commands::conversation_delete,
            commands::message_create,
            commands::message_list,
            commands::message_search,
            commands::settings_get,
            commands::settings_set,
            commands::chat_send,
            commands::chat_cancel,
            commands::mcp_add_server,
            commands::mcp_remove_server,
            commands::mcp_connect,
            commands::mcp_disconnect,
            commands::mcp_list_servers,
            commands::mcp_call_tool,
            commands::mcp_import_config,
            commands::agent_list_tools,
            commands::agent_execute_tool,
            commands::agent_decide_permission,
            commands::agent_execute_tools,
            commands::folder_create,
            commands::folder_list,
            commands::folder_update,
            commands::folder_delete,
            commands::usage_record,
            commands::usage_summary,
            commands::usage_daily,
            commands::usage_total,
            commands::export_conversation,
            commands::import_conversation,
            commands::template_create,
            commands::template_list,
            commands::template_update,
            commands::template_delete,
            commands::conversation_fork,
            commands::send_notification,
            commands::secure_set_api_key,
            commands::secure_get_api_key,
            commands::secure_delete_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
