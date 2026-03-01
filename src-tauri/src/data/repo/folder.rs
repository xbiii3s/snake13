use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i32,
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateFolder {
    pub name: String,
    pub parent_id: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFolder {
    pub name: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub sort_order: Option<i32>,
    pub icon: Option<Option<String>>,
}

pub struct FolderRepo;

impl FolderRepo {
    pub fn create(conn: &Connection, input: &CreateFolder) -> AppResult<Folder> {
        let id = uuid::Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO folders (id, name, parent_id, icon) VALUES (?1, ?2, ?3, ?4)",
            params![id, input.name, input.parent_id, input.icon],
        )?;
        Self::get_by_id(conn, &id)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Folder> {
        conn.query_row(
            "SELECT id, name, parent_id, sort_order, icon, created_at, updated_at FROM folders WHERE id = ?1",
            params![id],
            |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2)?,
                    sort_order: row.get(3)?,
                    icon: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Folder {id} not found")),
            _ => AppError::Database(e),
        })
    }

    pub fn list(conn: &Connection) -> AppResult<Vec<Folder>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, sort_order, icon, created_at, updated_at FROM folders ORDER BY sort_order ASC, name ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                sort_order: row.get(3)?,
                icon: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn update(conn: &Connection, id: &str, input: &UpdateFolder) -> AppResult<Folder> {
        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref name) = input.name {
            sets.push("name = ?");
            values.push(Box::new(name.clone()));
        }
        if let Some(ref parent_id) = input.parent_id {
            sets.push("parent_id = ?");
            values.push(Box::new(parent_id.clone()));
        }
        if let Some(sort_order) = input.sort_order {
            sets.push("sort_order = ?");
            values.push(Box::new(sort_order));
        }
        if let Some(ref icon) = input.icon {
            sets.push("icon = ?");
            values.push(Box::new(icon.clone()));
        }

        if sets.is_empty() {
            return Self::get_by_id(conn, id);
        }

        sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE folders SET {} WHERE id = ?", sets.join(", "));
        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        Self::get_by_id(conn, id)
    }

    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::test_connection;

    #[test]
    fn test_create_folder() {
        let conn = test_connection();
        let folder = FolderRepo::create(&conn, &CreateFolder {
            name: "Work".to_string(),
            parent_id: None,
            icon: None,
        }).unwrap();
        assert_eq!(folder.name, "Work");
        assert_eq!(folder.parent_id, None);
    }

    #[test]
    fn test_list_folders() {
        let conn = test_connection();
        FolderRepo::create(&conn, &CreateFolder { name: "A".into(), parent_id: None, icon: None }).unwrap();
        FolderRepo::create(&conn, &CreateFolder { name: "B".into(), parent_id: None, icon: None }).unwrap();
        let list = FolderRepo::list(&conn).unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_nested_folders() {
        let conn = test_connection();
        let parent = FolderRepo::create(&conn, &CreateFolder { name: "Parent".into(), parent_id: None, icon: None }).unwrap();
        let child = FolderRepo::create(&conn, &CreateFolder { name: "Child".into(), parent_id: Some(parent.id.clone()), icon: None }).unwrap();
        assert_eq!(child.parent_id, Some(parent.id));
    }

    #[test]
    fn test_update_folder() {
        let conn = test_connection();
        let folder = FolderRepo::create(&conn, &CreateFolder { name: "Old".into(), parent_id: None, icon: None }).unwrap();
        let updated = FolderRepo::update(&conn, &folder.id, &UpdateFolder {
            name: Some("New".into()),
            parent_id: None,
            sort_order: None,
            icon: None,
        }).unwrap();
        assert_eq!(updated.name, "New");
    }

    #[test]
    fn test_delete_folder() {
        let conn = test_connection();
        let folder = FolderRepo::create(&conn, &CreateFolder { name: "Temp".into(), parent_id: None, icon: None }).unwrap();
        FolderRepo::delete(&conn, &folder.id).unwrap();
        let list = FolderRepo::list(&conn).unwrap();
        assert!(list.is_empty());
    }
}
