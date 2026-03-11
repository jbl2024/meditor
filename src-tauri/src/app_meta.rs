use std::{env::consts, fs};

use directories::BaseDirs;
use serde::Serialize;

use crate::{AppError, Result};

const APP_SUPPORT_DIR_NAME: &str = ".tomosona";

#[derive(Debug, Clone, Serialize)]
pub struct AboutMetadata {
    pub version: String,
    pub build_commit: Option<String>,
    pub build_channel: String,
    pub platform_label: String,
    pub app_support_dir: String,
    pub tauri_version: Option<String>,
}

fn app_support_dir() -> Result<std::path::PathBuf> {
    let base_dirs = BaseDirs::new().ok_or_else(|| {
        AppError::InvalidOperation("Could not resolve user home directory.".to_string())
    })?;
    Ok(base_dirs.home_dir().join(APP_SUPPORT_DIR_NAME))
}

fn platform_label() -> String {
    let os = match consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        "ios" => "iOS",
        "android" => "Android",
        other => other,
    };
    format!("{os} {}", consts::ARCH)
}

#[tauri::command]
pub fn read_about_metadata() -> Result<AboutMetadata> {
    let app_support_dir = app_support_dir()?;
    let build_channel = if cfg!(debug_assertions) {
        "development"
    } else {
        "release"
    };

    Ok(AboutMetadata {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_commit: option_env!("TOMOSONA_GIT_COMMIT").map(ToOwned::to_owned),
        build_channel: build_channel.to_string(),
        platform_label: platform_label(),
        app_support_dir: app_support_dir.to_string_lossy().to_string(),
        tauri_version: option_env!("TOMOSONA_TAURI_VERSION").map(ToOwned::to_owned),
    })
}

#[tauri::command]
pub fn open_app_support_dir() -> Result<()> {
    let path = app_support_dir()?;
    fs::create_dir_all(&path)?;
    open::that_detached(path).map_err(|_| AppError::OperationFailed)?;
    Ok(())
}
