use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::error::AppResult;

/// A conversation template with preset configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub model_id: String,
    pub enable_thinking: bool,
    pub agent_mode: bool,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Input for creating a new template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTemplate {
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: String,
    pub model_id: Option<String>,
    pub enable_thinking: Option<bool>,
    pub agent_mode: Option<bool>,
    pub icon: Option<String>,
}

/// Input for updating an existing template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub model_id: Option<String>,
    pub enable_thinking: Option<bool>,
    pub agent_mode: Option<bool>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

/// Repository for conversation template CRUD operations
pub struct TemplateRepo;

impl TemplateRepo {
    /// Create a new template
    pub fn create(conn: &Connection, input: &CreateTemplate) -> AppResult<Template> {
        let id = uuid::Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO templates (id, name, description, system_prompt, model_id, enable_thinking, agent_mode, icon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                id,
                input.name,
                input.description.as_deref().unwrap_or(""),
                input.system_prompt,
                input.model_id.as_deref().unwrap_or("claude-sonnet-4-5"),
                input.enable_thinking.unwrap_or(false) as i32,
                input.agent_mode.unwrap_or(false) as i32,
                input.icon,
            ],
        )?;
        Self::get_by_id(conn, &id)
    }

    /// List all templates ordered by sort_order then name
    pub fn list(conn: &Connection) -> AppResult<Vec<Template>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, system_prompt, model_id, enable_thinking, agent_mode, icon, sort_order, created_at, updated_at FROM templates ORDER BY sort_order, name"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Template {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                system_prompt: row.get(3)?,
                model_id: row.get(4)?,
                enable_thinking: row.get::<_, i32>(5)? != 0,
                agent_mode: row.get::<_, i32>(6)? != 0,
                icon: row.get(7)?,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows { result.push(r?); }
        Ok(result)
    }

    /// Get a template by ID
    pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Template> {
        conn.query_row(
            "SELECT id, name, description, system_prompt, model_id, enable_thinking, agent_mode, icon, sort_order, created_at, updated_at FROM templates WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(Template {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    system_prompt: row.get(3)?,
                    model_id: row.get(4)?,
                    enable_thinking: row.get::<_, i32>(5)? != 0,
                    agent_mode: row.get::<_, i32>(6)? != 0,
                    icon: row.get(7)?,
                    sort_order: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => crate::error::AppError::NotFound("Template not found".to_string()),
            _ => crate::error::AppError::Database(e),
        })
    }

    /// Update an existing template (partial update)
    pub fn update(conn: &Connection, id: &str, input: &UpdateTemplate) -> AppResult<Template> {
        let current = Self::get_by_id(conn, id)?;
        let name = input.name.as_deref().unwrap_or(&current.name);
        let description = input.description.as_deref().unwrap_or(&current.description);
        let system_prompt = input.system_prompt.as_deref().unwrap_or(&current.system_prompt);
        let model_id = input.model_id.as_deref().unwrap_or(&current.model_id);
        let enable_thinking = input.enable_thinking.unwrap_or(current.enable_thinking);
        let agent_mode = input.agent_mode.unwrap_or(current.agent_mode);
        let icon = input.icon.as_deref().or(current.icon.as_deref());
        let sort_order = input.sort_order.unwrap_or(current.sort_order);

        conn.execute(
            "UPDATE templates SET name=?2, description=?3, system_prompt=?4, model_id=?5, enable_thinking=?6, agent_mode=?7, icon=?8, sort_order=?9, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id=?1",
            rusqlite::params![id, name, description, system_prompt, model_id, enable_thinking as i32, agent_mode as i32, icon, sort_order],
        )?;
        Self::get_by_id(conn, id)
    }

    /// Delete a template by ID
    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        let affected = conn.execute("DELETE FROM templates WHERE id = ?1", rusqlite::params![id])?;
        if affected == 0 {
            return Err(crate::error::AppError::NotFound("Template not found".to_string()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::test_connection;

    #[test]
    fn test_create_template() {
        let conn = test_connection();
        let t = TemplateRepo::create(&conn, &CreateTemplate {
            name: "Code Review".to_string(),
            description: Some("For reviewing code".to_string()),
            system_prompt: "You are a code reviewer.".to_string(),
            model_id: None,
            enable_thinking: Some(true),
            agent_mode: None,
            icon: None,
        }).unwrap();
        assert_eq!(t.name, "Code Review");
        assert!(t.enable_thinking);
    }

    #[test]
    fn test_list_templates() {
        let conn = test_connection();
        TemplateRepo::create(&conn, &CreateTemplate {
            name: "A".to_string(), description: None, system_prompt: "p".to_string(),
            model_id: None, enable_thinking: None, agent_mode: None, icon: None,
        }).unwrap();
        TemplateRepo::create(&conn, &CreateTemplate {
            name: "B".to_string(), description: None, system_prompt: "q".to_string(),
            model_id: None, enable_thinking: None, agent_mode: None, icon: None,
        }).unwrap();
        let list = TemplateRepo::list(&conn).unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_update_template() {
        let conn = test_connection();
        let t = TemplateRepo::create(&conn, &CreateTemplate {
            name: "Old".to_string(), description: None, system_prompt: "p".to_string(),
            model_id: None, enable_thinking: None, agent_mode: None, icon: None,
        }).unwrap();
        let updated = TemplateRepo::update(&conn, &t.id, &UpdateTemplate {
            name: Some("New".to_string()), description: None, system_prompt: None,
            model_id: None, enable_thinking: None, agent_mode: None, icon: None, sort_order: None,
        }).unwrap();
        assert_eq!(updated.name, "New");
    }

    #[test]
    fn test_delete_template() {
        let conn = test_connection();
        let t = TemplateRepo::create(&conn, &CreateTemplate {
            name: "X".to_string(), description: None, system_prompt: "p".to_string(),
            model_id: None, enable_thinking: None, agent_mode: None, icon: None,
        }).unwrap();
        TemplateRepo::delete(&conn, &t.id).unwrap();
        assert!(TemplateRepo::get_by_id(&conn, &t.id).is_err());
    }
}
