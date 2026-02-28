use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Current schema version (referenced in migration logic)
#[allow(dead_code)]
const CURRENT_VERSION: i64 = 2;

/// Run all pending database migrations
pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    let current = get_schema_version(conn)?;

    if current < 1 {
        migrate_v1(conn)?;
    }

    if current < 2 {
        migrate_v2(conn)?;
    }

    Ok(())
}

fn get_schema_version(conn: &Connection) -> AppResult<i64> {
    // Check if _schema_version table exists
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='_schema_version')",
        [],
        |row| row.get(0),
    )?;

    if !exists {
        return Ok(0);
    }

    let version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(version)
}

/// Initial schema — all Phase 1 tables
fn migrate_v1(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        -- ===================== Schema Version =====================
        CREATE TABLE IF NOT EXISTS _schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );

        -- ===================== Folders =====================
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            icon TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );

        -- ===================== Conversations =====================
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
            parent_message_id TEXT,
            model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
            system_prompt TEXT,
            agent_mode INTEGER NOT NULL DEFAULT 0,
            pinned INTEGER NOT NULL DEFAULT 0,
            tags TEXT DEFAULT '[]',
            token_total INTEGER NOT NULL DEFAULT 0,
            cost_total REAL NOT NULL DEFAULT 0.0,
            archived INTEGER NOT NULL DEFAULT 0,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_conv_folder ON conversations(folder_id);
        CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_conv_archived ON conversations(archived, deleted_at);

        -- ===================== Messages =====================
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            parent_id TEXT,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            model_used TEXT,
            tokens_in INTEGER DEFAULT 0,
            tokens_out INTEGER DEFAULT 0,
            cost REAL DEFAULT 0.0,
            thinking_content TEXT,
            thinking_duration_ms INTEGER,
            attachments TEXT DEFAULT '[]',
            tool_calls TEXT DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_msg_parent ON messages(parent_id);

        -- ===================== Full-Text Search =====================
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            content='messages',
            content_rowid='rowid',
            tokenize='unicode61'
        );

        CREATE TRIGGER IF NOT EXISTS msg_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS msg_ad AFTER DELETE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS msg_au AFTER UPDATE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
            INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;

        -- ===================== Permission Rules =====================
        CREATE TABLE IF NOT EXISTS permission_rules (
            id TEXT PRIMARY KEY,
            tool_name TEXT NOT NULL,
            action_pattern TEXT NOT NULL,
            permission TEXT NOT NULL CHECK(permission IN ('auto', 'denied')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );

        -- ===================== MCP Servers =====================
        CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            args TEXT DEFAULT '[]',
            env TEXT DEFAULT '{}',
            enabled INTEGER NOT NULL DEFAULT 1,
            status TEXT DEFAULT 'stopped',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );

        -- ===================== Usage Stats =====================
        CREATE TABLE IF NOT EXISTS usage_stats (
            date TEXT NOT NULL,
            model_id TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'chat',
            tokens_in INTEGER DEFAULT 0,
            tokens_out INTEGER DEFAULT 0,
            cost REAL DEFAULT 0.0,
            request_count INTEGER DEFAULT 0,
            PRIMARY KEY (date, model_id, source)
        );

        -- ===================== Settings =====================
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            encrypted INTEGER NOT NULL DEFAULT 0
        );

        -- Record migration
        INSERT INTO _schema_version (version) VALUES (1);
        ",
    )
    .map_err(|e| AppError::Internal(format!("Migration v1 failed: {e}")))?;

    log::info!("Database migrated to version 1");
    Ok(())
}

/// Migration v2 — templates table
fn migrate_v2(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            system_prompt TEXT NOT NULL,
            model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
            enable_thinking INTEGER NOT NULL DEFAULT 0,
            agent_mode INTEGER NOT NULL DEFAULT 0,
            icon TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );

        INSERT INTO _schema_version (version) VALUES (2);
    ").map_err(|e| AppError::Internal(format!("Migration v2 failed: {e}")))?;
    log::info!("Database migrated to version 2");
    Ok(())
}
