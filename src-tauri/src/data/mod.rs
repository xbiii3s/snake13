pub mod schema;
pub mod repo;
pub mod secure;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::{AppError, AppResult};

/// Database manager wrapping a SQLite connection with WAL mode
pub struct Database {
    conn: Mutex<Connection>,
}

/// Create an in-memory connection with schema for testing
#[cfg(test)]
pub fn test_connection() -> Connection {
    let conn = Connection::open_in_memory().expect("Failed to open in-memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    schema::run_migrations(&conn).unwrap();
    conn
}

impl Database {
    /// Open or create the database at the given path
    pub fn new(db_path: PathBuf) -> AppResult<Self> {
        let parent = db_path
            .parent()
            .ok_or_else(|| AppError::Internal("Invalid database path: no parent directory".to_string()))?;
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Internal(format!("Failed to create data directory: {e}")))?;

        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;
             PRAGMA synchronous=NORMAL;",
        )?;

        // Set file permissions to 600 (owner only) on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(&db_path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o600);
                let _ = std::fs::set_permissions(&db_path, perms);
            }
        }

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Run all pending migrations
    pub fn run_migrations(&self) -> AppResult<()> {
        let conn = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        schema::run_migrations(&conn)
    }

    /// Execute a closure with the database connection
    pub fn with_conn<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&Connection) -> AppResult<T>,
    {
        let conn = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        f(&conn)
    }
}
