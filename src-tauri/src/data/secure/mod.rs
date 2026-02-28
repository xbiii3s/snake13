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
    pub fn set_proxy_credential(key: &str, value: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, &format!("proxy_{key}"))
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        entry
            .set_password(value)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        Ok(())
    }

    /// Retrieve a proxy credential
    pub fn get_proxy_credential(key: &str) -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(SERVICE_NAME, &format!("proxy_{key}"))
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }
}
