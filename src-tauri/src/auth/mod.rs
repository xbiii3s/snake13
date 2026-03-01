pub mod config;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::data::secure::SecureStore;
use crate::error::AppResult;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// User profile returned after login / session restore.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    #[serde(default)]
    pub created_at: String,
}

/// Subscription info attached to the current user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub plan_name: String,
    pub display_name: String,
    pub status: String,
    pub max_messages_per_day: i32,
    pub max_tokens_per_day: i64,
    pub allowed_models: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

/// Combined session state surfaced to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub is_authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserProfile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription: Option<Subscription>,
}

/// Login / register response from Supabase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: Option<SupabaseUser>,
    #[serde(default)]
    pub expires_in: u64,
}

/// Minimal Supabase user record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseUser {
    pub id: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// Row returned when querying subscriptions with embedded plan.
#[derive(Debug, Clone, Deserialize)]
pub struct SubscriptionRow {
    pub status: String,
    #[serde(default)]
    pub expires_at: Option<String>,
    pub plan: Option<PlanRow>,
}

/// Embedded plan from the subscriptions query.
#[derive(Debug, Clone, Deserialize)]
pub struct PlanRow {
    pub name: String,
    pub display_name: String,
    pub max_messages_per_day: i32,
    pub max_tokens_per_day: i64,
    pub allowed_models: Vec<String>,
}

// ---------------------------------------------------------------------------
// In-memory auth state (lives inside AppState)
// ---------------------------------------------------------------------------

/// Runtime authentication state held in memory.
///
/// Tokens are *also* persisted in the macOS Keychain so they survive restarts.
pub struct AuthManager {
    inner: RwLock<AuthInner>,
}

struct AuthInner {
    access_token: Option<String>,
    refresh_token: Option<String>,
    user: Option<UserProfile>,
    subscription: Option<Subscription>,
}

impl AuthManager {
    /// Create a new, unauthenticated manager.
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(AuthInner {
                access_token: None,
                refresh_token: None,
                user: None,
                subscription: None,
            }),
        }
    }

    /// Try to restore a session from the macOS Keychain on startup.
    pub async fn restore_from_keychain(&self) {
        let access = SecureStore::get_auth_token().ok().flatten();
        let refresh = SecureStore::get_refresh_token().ok().flatten();

        if access.is_some() || refresh.is_some() {
            let mut inner = self.inner.write().await;
            inner.access_token = access;
            inner.refresh_token = refresh;
            log::info!("Auth session restored from Keychain");
        }
    }

    /// Store tokens after a successful login / refresh.
    pub async fn set_tokens(
        &self,
        access_token: &str,
        refresh_token: &str,
    ) -> AppResult<()> {
        // Persist to Keychain
        SecureStore::set_auth_token(access_token)?;
        SecureStore::set_refresh_token(refresh_token)?;

        // Update in-memory state
        let mut inner = self.inner.write().await;
        inner.access_token = Some(access_token.to_string());
        inner.refresh_token = Some(refresh_token.to_string());
        Ok(())
    }

    /// Store user profile.
    pub async fn set_user(&self, user: UserProfile) {
        let mut inner = self.inner.write().await;
        inner.user = Some(user);
    }

    /// Store subscription info.
    pub async fn set_subscription(&self, sub: Option<Subscription>) {
        let mut inner = self.inner.write().await;
        inner.subscription = sub;
    }

    /// Get the current access token (if any).
    pub async fn access_token(&self) -> Option<String> {
        let inner = self.inner.read().await;
        inner.access_token.clone()
    }

    /// Get the current refresh token (if any).
    pub async fn refresh_token(&self) -> Option<String> {
        let inner = self.inner.read().await;
        inner.refresh_token.clone()
    }

    /// Build an `AuthSession` snapshot for the frontend.
    pub async fn session(&self) -> AuthSession {
        let inner = self.inner.read().await;
        AuthSession {
            is_authenticated: inner.access_token.is_some(),
            user: inner.user.clone(),
            subscription: inner.subscription.clone(),
        }
    }

    /// Clear all auth state (logout).
    pub async fn clear(&self) -> AppResult<()> {
        // Clear Keychain
        let _ = SecureStore::delete_auth_token();
        let _ = SecureStore::delete_refresh_token();

        // Clear memory
        let mut inner = self.inner.write().await;
        inner.access_token = None;
        inner.refresh_token = None;
        inner.user = None;
        inner.subscription = None;
        Ok(())
    }
}

impl Default for AuthManager {
    fn default() -> Self {
        Self::new()
    }
}
