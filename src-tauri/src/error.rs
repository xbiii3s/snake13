use serde::Serialize;

/// Unified application error type
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Keychain error: {0}")]
    Keychain(String),

    #[error("API error: status={status}, message={message}")]
    Api { status: u16, message: String },

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Cancelled")]
    Cancelled,

    #[error("Authentication required: {0}")]
    AuthRequired(String),

    #[error("Subscription expired: {0}")]
    SubscriptionExpired(String),

    #[error("Quota exceeded: {0}")]
    QuotaExceeded(String),

    #[error("{0}")]
    Internal(String),
}

/// Tauri commands require errors to be Serialize
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", &self.error_kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl AppError {
    fn error_kind(&self) -> &'static str {
        match self {
            Self::Database(_) => "database",
            Self::Network(_) => "network",
            Self::Json(_) => "json",
            Self::Io(_) => "io",
            Self::Keychain(_) => "keychain",
            Self::Api { .. } => "api",
            Self::NotFound(_) => "not_found",
            Self::Validation(_) => "validation",
            Self::PermissionDenied(_) => "permission_denied",
            Self::Cancelled => "cancelled",
            Self::AuthRequired(_) => "auth_required",
            Self::SubscriptionExpired(_) => "subscription_expired",
            Self::QuotaExceeded(_) => "quota_exceeded",
            Self::Internal(_) => "internal",
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
