use rusqlite::{params, Connection};

use crate::error::AppResult;

pub struct SettingsRepo;

impl SettingsRepo {
    /// Get a setting value by key
    pub fn get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
        let result = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        );

        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Set a setting value (upsert)
    pub fn set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Delete a setting
    pub fn delete(conn: &Connection, key: &str) -> AppResult<()> {
        conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// Get all settings as key-value pairs
    pub fn get_all(conn: &Connection) -> AppResult<Vec<(String, String)>> {
        let mut stmt = conn.prepare("SELECT key, value FROM settings WHERE encrypted = 0")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::test_connection;

    #[test]
    fn test_set_and_get() {
        let conn = test_connection();
        SettingsRepo::set(&conn, "theme", "dark").unwrap();
        let val = SettingsRepo::get(&conn, "theme").unwrap();
        assert_eq!(val, Some("dark".to_string()));
    }

    #[test]
    fn test_get_missing_key() {
        let conn = test_connection();
        let val = SettingsRepo::get(&conn, "nonexistent").unwrap();
        assert_eq!(val, None);
    }

    #[test]
    fn test_upsert() {
        let conn = test_connection();
        SettingsRepo::set(&conn, "key1", "value1").unwrap();
        SettingsRepo::set(&conn, "key1", "value2").unwrap();
        let val = SettingsRepo::get(&conn, "key1").unwrap();
        assert_eq!(val, Some("value2".to_string()));
    }

    #[test]
    fn test_delete() {
        let conn = test_connection();
        SettingsRepo::set(&conn, "key1", "value1").unwrap();
        SettingsRepo::delete(&conn, "key1").unwrap();
        let val = SettingsRepo::get(&conn, "key1").unwrap();
        assert_eq!(val, None);
    }

    #[test]
    fn test_get_all() {
        let conn = test_connection();
        SettingsRepo::set(&conn, "a", "1").unwrap();
        SettingsRepo::set(&conn, "b", "2").unwrap();
        let all = SettingsRepo::get_all(&conn).unwrap();
        assert_eq!(all.len(), 2);
    }
}
