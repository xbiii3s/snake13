use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub parent_id: Option<String>,
    pub role: String,
    pub content: String,
    pub model_used: Option<String>,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub cost: f64,
    pub thinking_content: Option<String>,
    pub thinking_duration_ms: Option<i64>,
    pub attachments: String,
    pub tool_calls: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMessage {
    pub conversation_id: String,
    pub parent_id: Option<String>,
    pub role: String,
    pub content: String,
    pub model_used: Option<String>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub cost: Option<f64>,
    pub thinking_content: Option<String>,
    pub thinking_duration_ms: Option<i64>,
    pub attachments: Option<String>,
    pub tool_calls: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub message_id: String,
    pub conversation_id: String,
    pub conversation_title: String,
    pub role: String,
    pub content_snippet: String,
    pub created_at: String,
}

pub struct MessageRepo;

impl MessageRepo {
    /// Create a new message
    pub fn create(conn: &Connection, input: &CreateMessage) -> AppResult<Message> {
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO messages (id, conversation_id, parent_id, role, content, model_used,
                                   tokens_in, tokens_out, cost, thinking_content,
                                   thinking_duration_ms, attachments, tool_calls)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                id,
                input.conversation_id,
                input.parent_id,
                input.role,
                input.content,
                input.model_used,
                input.tokens_in.unwrap_or(0),
                input.tokens_out.unwrap_or(0),
                input.cost.unwrap_or(0.0),
                input.thinking_content,
                input.thinking_duration_ms,
                input.attachments.as_deref().unwrap_or("[]"),
                input.tool_calls.as_deref().unwrap_or("[]"),
            ],
        )?;

        // Update conversation's updated_at
        conn.execute(
            "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            params![input.conversation_id],
        )?;

        Self::get_by_id(conn, &id)
    }

    /// Get a message by ID
    pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Message> {
        conn.query_row(
            "SELECT id, conversation_id, parent_id, role, content, model_used,
                    tokens_in, tokens_out, cost, thinking_content,
                    thinking_duration_ms, attachments, tool_calls, created_at
             FROM messages WHERE id = ?1",
            params![id],
            Self::row_to_message,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("Message {id} not found"))
            }
            _ => AppError::Database(e),
        })
    }

    /// List messages for a conversation (ordered by creation time)
    pub fn list_by_conversation(conn: &Connection, conversation_id: &str) -> AppResult<Vec<Message>> {
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, parent_id, role, content, model_used,
                    tokens_in, tokens_out, cost, thinking_content,
                    thinking_duration_ms, attachments, tool_calls, created_at
             FROM messages WHERE conversation_id = ?1
             ORDER BY created_at ASC",
        )?;

        let rows = stmt.query_map(params![conversation_id], Self::row_to_message)?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Full-text search across all messages
    pub fn search(conn: &Connection, query: &str, limit: i64) -> AppResult<Vec<SearchResult>> {
        let mut stmt = conn.prepare(
            "SELECT m.id, m.conversation_id, c.title, m.role,
                    snippet(messages_fts, 0, '<<', '>>', '...', 48) as snippet,
                    m.created_at
             FROM messages_fts
             JOIN messages m ON m.rowid = messages_fts.rowid
             JOIN conversations c ON c.id = m.conversation_id
             WHERE messages_fts MATCH ?1 AND c.deleted_at IS NULL
             ORDER BY rank
             LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![query, limit], |row| {
            Ok(SearchResult {
                message_id: row.get(0)?,
                conversation_id: row.get(1)?,
                conversation_title: row.get(2)?,
                role: row.get(3)?,
                content_snippet: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Delete all messages in a conversation
    #[allow(dead_code)]
    pub fn delete_by_conversation(conn: &Connection, conversation_id: &str) -> AppResult<()> {
        conn.execute(
            "DELETE FROM messages WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        Ok(())
    }

    fn row_to_message(row: &rusqlite::Row) -> rusqlite::Result<Message> {
        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            parent_id: row.get(2)?,
            role: row.get(3)?,
            content: row.get(4)?,
            model_used: row.get(5)?,
            tokens_in: row.get(6)?,
            tokens_out: row.get(7)?,
            cost: row.get(8)?,
            thinking_content: row.get(9)?,
            thinking_duration_ms: row.get(10)?,
            attachments: row.get(11)?,
            tool_calls: row.get(12)?,
            created_at: row.get(13)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::repo::conversation::{ConversationRepo, CreateConversation};
    use crate::data::test_connection;

    fn create_test_conv(conn: &Connection) -> String {
        let conv = ConversationRepo::create(
            conn,
            &CreateConversation {
                title: None,
                model_id: None,
                system_prompt: None,
                folder_id: None,
                agent_mode: None,
            },
        )
        .unwrap();
        conv.id
    }

    fn user_msg(conv_id: &str, content: &str) -> CreateMessage {
        CreateMessage {
            conversation_id: conv_id.to_string(),
            parent_id: None,
            role: "user".to_string(),
            content: content.to_string(),
            model_used: None,
            tokens_in: None,
            tokens_out: None,
            cost: None,
            thinking_content: None,
            thinking_duration_ms: None,
            attachments: None,
            tool_calls: None,
        }
    }

    #[test]
    fn test_create_message() {
        let conn = test_connection();
        let conv_id = create_test_conv(&conn);
        let msg = MessageRepo::create(&conn, &user_msg(&conv_id, "Hello")).unwrap();
        assert_eq!(msg.role, "user");
        assert_eq!(msg.content, "Hello");
        assert_eq!(msg.conversation_id, conv_id);
    }

    #[test]
    fn test_list_messages_ordered() {
        let conn = test_connection();
        let conv_id = create_test_conv(&conn);
        MessageRepo::create(&conn, &user_msg(&conv_id, "First")).unwrap();
        MessageRepo::create(&conn, &user_msg(&conv_id, "Second")).unwrap();
        let msgs = MessageRepo::list_by_conversation(&conn, &conv_id).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].content, "First");
        assert_eq!(msgs[1].content, "Second");
    }

    #[test]
    fn test_fts_search() {
        let conn = test_connection();
        let conv_id = create_test_conv(&conn);
        MessageRepo::create(&conn, &user_msg(&conv_id, "The quick brown fox")).unwrap();
        MessageRepo::create(&conn, &user_msg(&conv_id, "Hello world")).unwrap();
        let results = MessageRepo::search(&conn, "fox", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content_snippet.contains("fox"));
    }

    #[test]
    fn test_delete_by_conversation() {
        let conn = test_connection();
        let conv_id = create_test_conv(&conn);
        MessageRepo::create(&conn, &user_msg(&conv_id, "msg1")).unwrap();
        MessageRepo::create(&conn, &user_msg(&conv_id, "msg2")).unwrap();
        MessageRepo::delete_by_conversation(&conn, &conv_id).unwrap();
        let msgs = MessageRepo::list_by_conversation(&conn, &conv_id).unwrap();
        assert!(msgs.is_empty());
    }

    #[test]
    fn test_get_not_found() {
        let conn = test_connection();
        let result = MessageRepo::get_by_id(&conn, "nonexistent");
        assert!(result.is_err());
    }
}
