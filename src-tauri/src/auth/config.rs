//! Supabase project configuration for SaaS authentication.
//!
//! `SUPABASE_URL` and `SUPABASE_ANON_KEY` are public values (the anon key is
//! designed to be embedded in client-side apps and is safe to commit).
//! The *secret* Anthropic API key lives only in the Supabase Edge Function
//! environment and is never exposed to the client.

/// Base URL of the Supabase project.
///
/// Replace with your actual Supabase project URL before deploying.
pub const SUPABASE_URL: &str = "https://your-project.supabase.co";

/// Supabase anonymous (public) API key.
///
/// This key is safe to embed in client applications — it only grants access
/// that is allowed by Row Level Security policies.
pub const SUPABASE_ANON_KEY: &str = "eyJ-your-anon-key-here";

/// URL of the `proxy-chat` Edge Function that forwards requests to Anthropic.
pub const PROXY_CHAT_URL: &str = "https://your-project.supabase.co/functions/v1/proxy-chat";

/// Supabase Auth REST endpoint for email/password login.
pub fn auth_token_url() -> String {
    format!("{}/auth/v1/token?grant_type=password", SUPABASE_URL)
}

/// Supabase Auth REST endpoint for user signup.
pub fn auth_signup_url() -> String {
    format!("{}/auth/v1/signup", SUPABASE_URL)
}

/// Supabase Auth REST endpoint for token refresh.
pub fn auth_refresh_url() -> String {
    format!("{}/auth/v1/token?grant_type=refresh_token", SUPABASE_URL)
}

/// Supabase Auth REST endpoint for logout.
pub fn auth_logout_url() -> String {
    format!("{}/auth/v1/logout", SUPABASE_URL)
}

/// Supabase Auth REST endpoint to retrieve the current user.
pub fn auth_user_url() -> String {
    format!("{}/auth/v1/user", SUPABASE_URL)
}

/// Supabase REST endpoint to query subscription info (via PostgREST).
pub fn subscriptions_url() -> String {
    format!(
        "{}/rest/v1/subscriptions?select=*,plan:plans(*)&limit=1",
        SUPABASE_URL
    )
}
