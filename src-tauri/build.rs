use std::{fs, path::Path, process::Command};

fn main() {
    if let Some(commit) = git_commit_hash() {
        println!("cargo:rustc-env=TOMOSONA_GIT_COMMIT={commit}");
    }
    if let Some(tauri_version) = tauri_version_from_lockfile() {
        println!("cargo:rustc-env=TOMOSONA_TAURI_VERSION={tauri_version}");
    }
    tauri_build::build()
}

fn git_commit_hash() -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--short=8", "HEAD"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

fn tauri_version_from_lockfile() -> Option<String> {
    let lockfile = fs::read_to_string(Path::new("Cargo.lock")).ok()?;
    let mut lines = lockfile.lines().peekable();
    while let Some(line) = lines.next() {
        if line.trim() != "name = \"tauri\"" {
            continue;
        }
        while let Some(next_line) = lines.peek() {
            let trimmed = next_line.trim();
            if trimmed.starts_with("version = ") {
                return trimmed
                    .strip_prefix("version = \"")
                    .and_then(|value| value.strip_suffix('"'))
                    .map(ToOwned::to_owned);
            }
            if trimmed == "[[package]]" {
                break;
            }
            lines.next();
        }
    }
    None
}
