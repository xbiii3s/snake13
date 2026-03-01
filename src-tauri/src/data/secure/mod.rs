use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "com.ai-boundless.claude-desktop-pro";

/// Secure credential storage using macOS Keychain
pub struct SecureStore;

impl SecureStore {
    /// Store the API key in the system keychain
    pub fn set_api_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, "api_key")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        entry
            .set_password(key)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        Ok(())
    }

    /// Retrieve the API key from the system keychain
    pub fn get_api_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(SERVICE_NAME, "api_key")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }

    /// Delete the API key from the system keychain
    pub fn delete_api_key() -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, "api_key")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // Already gone
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }

    /// Store a proxy credential
    #[allow(dead_code)]
    pub fn set_proxy_credential(key: &str, value: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, &format!("proxy_{key}"))
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        entry
            .set_password(value)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        Ok(())
    }

    /// Retrieve a proxy credential
    #[allow(dead_code)]
    pub fn get_proxy_credential(key: &str) -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(SERVICE_NAME, &format!("proxy_{key}"))
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }

    // ===================== Auth Token Storage =====================

    /// Store the authentication access token in the system keychain.
    pub fn set_auth_token(token: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, "auth_token")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        entry
            .set_password(token)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        Ok(())
    }

    /// Retrieve the authentication access token from the system keychain.
    pub fn get_auth_token() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(SERVICE_NAME, "auth_token")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }

    /// Delete the authentication access token from the system keychain.
    pub fn delete_auth_token() -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, "auth_token")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }

    /// Store the authentication refresh token in the system keychain.
    pub fn set_refresh_token(token: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, "refresh_token")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        entry
            .set_password(token)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        Ok(())
    }

    /// Retrieve the authentication refresh token from the system keychain.
    pub fn get_refresh_token() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(SERVICE_NAME, "refresh_token")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }

    /// Delete the authentication refresh token from the system keychain.
    pub fn delete_refresh_token() -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, "refresh_token")
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }
}
