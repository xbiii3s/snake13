use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub parent_message_id: Option<String>,
    pub model_id: String,
    pub system_prompt: Option<String>,
    pub agent_mode: bool,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub token_total: i64,
    pub cost_total: f64,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateConversation {
    pub title: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub folder_id: Option<String>,
    pub agent_mode: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConversation {
    pub title: Option<String>,
    pub folder_id: Option<Option<String>>,
    pub model_id: Option<String>,
    pub system_prompt: Option<Option<String>>,
    pub agent_mode: Option<bool>,
    pub pinned: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub archived: Option<bool>,
}

pub struct ConversationRepo;

impl ConversationRepo {
    /// Create a new conversation
    pub fn create(conn: &Connection, input: &CreateConversation) -> AppResult<Conversation> {
        let id = uuid::Uuid::new_v4().to_string();
        let title = input.title.clone().unwrap_or_else(|| "New Chat".to_string());
        let model_id = input
            .model_id
            .clone()
            .unwrap_or_else(|| "claude-sonnet-4-5".to_string());
        let agent_mode = input.agent_mode.unwrap_or(false);

        conn.execute(
            "INSERT INTO conversations (id, title, model_id, system_prompt, folder_id, agent_mode)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                title,
                model_id,
                input.system_prompt,
                input.folder_id,
                agent_mode as i32,
            ],
        )?;

        Self::get_by_id(conn, &id)
    }

    /// Get a conversation by ID
    pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Conversation> {
        conn.query_row(
            "SELECT id, title, folder_id, parent_message_id, model_id, system_prompt,
                    agent_mode, pinned, tags, token_total, cost_total, archived,
                    created_at, updated_at
             FROM conversations WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    folder_id: row.get(2)?,
                    parent_message_id: row.get(3)?,
                    model_id: row.get(4)?,
                    system_prompt: row.get(5)?,
                    agent_mode: row.get::<_, i32>(6)? != 0,
                    pinned: row.get::<_, i32>(7)? != 0,
                    tags: serde_json::from_str(&row.get::<_, String>(8).unwrap_or_else(|_| "[]".to_string()))
                        .unwrap_or_default(),
                    token_total: row.get(9)?,
                    cost_total: row.get(10)?,
                    archived: row.get::<_, i32>(11)? != 0,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("Conversation {id} not found"))
            }
            _ => AppError::Database(e),
        })
    }

    /// List conversations (not deleted, not archived unless specified)
    pub fn list(conn: &Connection, include_archived: bool) -> AppResult<Vec<Conversation>> {
        let sql = if include_archived {
            "SELECT id, title, folder_id, parent_message_id, model_id, system_prompt,
                    agent_mode, pinned, tags, token_total, cost_total, archived,
                    created_at, updated_at
             FROM conversations WHERE deleted_at IS NULL
             ORDER BY pinned DESC, updated_at DESC"
        } else {
            "SELECT id, title, folder_id, parent_message_id, model_id, system_prompt,
                    agent_mode, pinned, tags, token_total, cost_total, archived,
                    created_at, updated_at
             FROM conversations WHERE deleted_at IS NULL AND archived = 0
             ORDER BY pinned DESC, updated_at DESC"
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                folder_id: row.get(2)?,
                parent_message_id: row.get(3)?,
                model_id: row.get(4)?,
                system_prompt: row.get(5)?,
                agent_mode: row.get::<_, i32>(6)? != 0,
                pinned: row.get::<_, i32>(7)? != 0,
                tags: serde_json::from_str(&row.get::<_, String>(8).unwrap_or_else(|_| "[]".to_string()))
                    .unwrap_or_default(),
                token_total: row.get(9)?,
                cost_total: row.get(10)?,
                archived: row.get::<_, i32>(11)? != 0,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Update a conversation
    pub fn update(conn: &Connection, id: &str, input: &UpdateConversation) -> AppResult<Conversation> {
        // Build dynamic update query
        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref title) = input.title {
            sets.push("title = ?");
            values.push(Box::new(title.clone()));
        }
        if let Some(ref folder_id) = input.folder_id {
            sets.push("folder_id = ?");
            values.push(Box::new(folder_id.clone()));
        }
        if let Some(ref model_id) = input.model_id {
            sets.push("model_id = ?");
            values.push(Box::new(model_id.clone()));
        }
        if let Some(ref system_prompt) = input.system_prompt {
            sets.push("system_prompt = ?");
            values.push(Box::new(system_prompt.clone()));
        }
        if let Some(agent_mode) = input.agent_mode {
            sets.push("agent_mode = ?");
            values.push(Box::new(agent_mode as i32));
        }
        if let Some(pinned) = input.pinned {
            sets.push("pinned = ?");
            values.push(Box::new(pinned as i32));
        }
        if let Some(ref tags) = input.tags {
            sets.push("tags = ?");
            values.push(Box::new(serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())));
        }
        if let Some(archived) = input.archived {
            sets.push("archived = ?");
            values.push(Box::new(archived as i32));
        }

        if sets.is_empty() {
            return Self::get_by_id(conn, id);
        }

        sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
        values.push(Box::new(id.to_string()));

        let sql = format!(
            "UPDATE conversations SET {} WHERE id = ?",
            sets.join(", ")
        );

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        Self::get_by_id(conn, id)
    }

    /// Soft delete a conversation
    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        conn.execute(
            "UPDATE conversations SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Update token totals for a conversation
    #[allow(dead_code)]
    pub fn update_tokens(
        conn: &Connection,
        id: &str,
        tokens_in: i64,
        tokens_out: i64,
        cost: f64,
    ) -> AppResult<()> {
        conn.execute(
            "UPDATE conversations
             SET token_total = token_total + ?1 + ?2,
                 cost_total = cost_total + ?3,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?4",
            params![tokens_in, tokens_out, cost, id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::test_connection;

    fn default_input() -> CreateConversation {
        CreateConversation {
            title: None,
            model_id: None,
            system_prompt: None,
            folder_id: None,
            agent_mode: None,
        }
    }

    #[test]
    fn test_create_default() {
        let conn = test_connection();
        let conv = ConversationRepo::create(&conn, &default_input()).unwrap();
        assert_eq!(conv.title, "New Chat");
        assert_eq!(conv.model_id, "claude-sonnet-4-5");
        assert!(!conv.agent_mode);
        assert!(!conv.pinned);
    }

    #[test]
    fn test_create_with_title() {
        let conn = test_connection();
        let input = CreateConversation {
            title: Some("My Chat".into()),
            ..default_input()
        };
        let conv = ConversationRepo::create(&conn, &input).unwrap();
        assert_eq!(conv.title, "My Chat");
    }

    #[test]
    fn test_list_empty() {
        let conn = test_connection();
        let list = ConversationRepo::list(&conn, false).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_list_after_create() {
        let conn = test_connection();
        ConversationRepo::create(&conn, &default_input()).unwrap();
        ConversationRepo::create(&conn, &default_input()).unwrap();
        let list = ConversationRepo::list(&conn, false).unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_update_title() {
        let conn = test_connection();
        let conv = ConversationRepo::create(&conn, &default_input()).unwrap();
        let updated = ConversationRepo::update(
            &conn,
            &conv.id,
            &UpdateConversation {
                title: Some("Updated".into()),
                folder_id: None,
                model_id: None,
                system_prompt: None,
                agent_mode: None,
                pinned: None,
                tags: None,
                archived: None,
            },
        )
        .unwrap();
        assert_eq!(updated.title, "Updated");
    }

    #[test]
    fn test_soft_delete() {
        let conn = test_connection();
        let conv = ConversationRepo::create(&conn, &default_input()).unwrap();
        ConversationRepo::delete(&conn, &conv.id).unwrap();
        let list = ConversationRepo::list(&conn, false).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_update_tokens() {
        let conn = test_connection();
        let conv = ConversationRepo::create(&conn, &default_input()).unwrap();
        ConversationRepo::update_tokens(&conn, &conv.id, 100, 200, 0.05).unwrap();
        let updated = ConversationRepo::get_by_id(&conn, &conv.id).unwrap();
        assert_eq!(updated.token_total, 300);
        assert!((updated.cost_total - 0.05).abs() < 0.001);
    }

    #[test]
    fn test_get_not_found() {
        let conn = test_connection();
        let result = ConversationRepo::get_by_id(&conn, "nonexistent");
        assert!(result.is_err());
    }
}
