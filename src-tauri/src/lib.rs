mod fs_ops;
mod workspace_watch;

use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use directories::UserDirs;
use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection};
use serde::Serialize;
use thiserror::Error;

use fs_ops::{
    clear_working_folder, copy_entry, create_entry, duplicate_entry, list_children,
    list_markdown_files, move_entry, open_external_url, open_path_external, path_exists,
    read_text_file, rename_entry, reveal_in_file_manager, select_working_folder,
    set_working_folder, trash_entry, write_text_file,
};

const INTERNAL_DIR_NAME: &str = ".meditor";
const TRASH_DIR_NAME: &str = ".meditor-trash";
const DB_FILE_NAME: &str = "meditor.sqlite";
const PROPERTY_TYPE_SCHEMA_FILE: &str = "property-types.json";
const RESERVED_WORKSPACE_ERROR: &str =
    "Cannot use this folder as a workspace. Choose a dedicated project folder.";

static ACTIVE_WORKSPACE_ROOT: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

#[derive(Debug, Error)]
enum AppError {
    #[error("File operation failed.")]
    Io(#[from] std::io::Error),
    #[error("Database operation failed.")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Invalid path.")]
    InvalidPath,
    #[error("Invalid name.")]
    InvalidName,
    #[error("File or folder already exists.")]
    AlreadyExists,
    #[error("Operation failed.")]
    OperationFailed,
    #[error("{0}")]
    InvalidOperation(String),
}

type Result<T> = std::result::Result<T, AppError>;

impl From<AppError> for tauri::ipc::InvokeError {
    fn from(err: AppError) -> Self {
        tauri::ipc::InvokeError::from(err.to_string())
    }
}

fn normalize_existing_dir(path: &str) -> Result<PathBuf> {
    let pb = PathBuf::from(path);
    if pb.as_os_str().is_empty() || !pb.is_dir() {
        return Err(AppError::InvalidPath);
    }
    Ok(pb)
}

fn active_workspace_slot() -> &'static Mutex<Option<PathBuf>> {
    ACTIVE_WORKSPACE_ROOT.get_or_init(|| Mutex::new(None))
}

fn lock_workspace_slot() -> Result<std::sync::MutexGuard<'static, Option<PathBuf>>> {
    active_workspace_slot()
        .lock()
        .map_err(|_| AppError::OperationFailed)
}

fn is_reserved_workspace_root(path: &Path) -> bool {
    if path.parent().is_none() {
        return true;
    }

    let Some(user_dirs) = UserDirs::new() else {
        return false;
    };

    if path == user_dirs.home_dir() {
        return true;
    }

    let has_special_match = [
        user_dirs.desktop_dir(),
        user_dirs.document_dir(),
        user_dirs.download_dir(),
        user_dirs.picture_dir(),
        user_dirs.audio_dir(),
        user_dirs.video_dir(),
        user_dirs.public_dir(),
    ]
    .into_iter()
    .flatten()
    .any(|dir| path == dir);

    has_special_match
}

fn canonical_workspace_root(path: &str) -> Result<PathBuf> {
    let dir = normalize_existing_dir(path)?;
    let canonical = fs::canonicalize(dir)?;
    if is_reserved_workspace_root(&canonical) {
        return Err(AppError::InvalidOperation(
            RESERVED_WORKSPACE_ERROR.to_string(),
        ));
    }
    Ok(canonical)
}

pub(crate) fn set_active_workspace(path: &str) -> Result<PathBuf> {
    let canonical = canonical_workspace_root(path)?;
    let mut guard = lock_workspace_slot()?;
    *guard = Some(canonical.clone());
    Ok(canonical)
}

pub(crate) fn clear_active_workspace() -> Result<()> {
    let mut guard = lock_workspace_slot()?;
    *guard = None;
    Ok(())
}

pub(crate) fn active_workspace_root() -> Result<PathBuf> {
    let guard = lock_workspace_slot()?;
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| AppError::InvalidOperation("No workspace is selected.".to_string()))
}

fn open_db() -> Result<Connection> {
    let root = active_workspace_root()?;
    let db_dir = root.join(INTERNAL_DIR_NAME);
    fs::create_dir_all(&db_dir)?;

    let db_path = db_dir.join(DB_FILE_NAME);
    Ok(Connection::open(db_path)?)
}

fn property_type_schema_path() -> Result<PathBuf> {
    let root = active_workspace_root()?;
    let schema_dir = root.join(INTERNAL_DIR_NAME);
    fs::create_dir_all(&schema_dir)?;
    Ok(schema_dir.join(PROPERTY_TYPE_SCHEMA_FILE))
}

fn normalize_existing_file(path: &str) -> Result<PathBuf> {
    let pb = PathBuf::from(path);
    if pb.as_os_str().is_empty() || !pb.is_file() {
        return Err(AppError::InvalidPath);
    }
    Ok(pb)
}

fn ensure_within_root(root: &Path, path: &Path) -> Result<()> {
    let root_canonical = fs::canonicalize(root)?;
    let path_canonical = fs::canonicalize(path)?;

    if !path_canonical.starts_with(&root_canonical) {
        return Err(AppError::InvalidPath);
    }

    Ok(())
}

fn heading_anchor(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut previous_dash = false;

    for ch in text.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            previous_dash = false;
            continue;
        }

        if !previous_dash {
            out.push('-');
            previous_dash = true;
        }
    }

    out.trim_matches('-').to_string()
}

fn chunk_markdown(markdown: &str) -> Vec<(String, String)> {
    let mut chunks: Vec<(String, String)> = Vec::new();
    let mut current_anchor = String::new();
    let mut current_lines: Vec<String> = Vec::new();

    for raw_line in markdown.replace("\r\n", "\n").replace('\r', "\n").lines() {
        let line = raw_line.trim_end().to_string();

        let heading_data = {
            let level = line.chars().take_while(|ch| *ch == '#').count();
            if !(1..=6).contains(&level) {
                None
            } else {
                let title = line[level..].trim();
                if title.is_empty() {
                    None
                } else {
                    Some((heading_anchor(title), title.to_string()))
                }
            }
        };

        if let Some((anchor, title)) = heading_data {
            if !current_lines.is_empty() {
                let text = current_lines.join("\n").trim().to_string();
                if !text.is_empty() {
                    chunks.push((current_anchor.clone(), text));
                }
            }

            current_anchor = anchor;
            current_lines.clear();
            current_lines.push(title);
            continue;
        }

        current_lines.push(line);
    }

    if !current_lines.is_empty() {
        let text = current_lines.join("\n").trim().to_string();
        if !text.is_empty() {
            chunks.push((current_anchor, text));
        }
    }

    if chunks.is_empty() {
        let fallback = markdown.trim();
        if !fallback.is_empty() {
            chunks.push((String::new(), fallback.to_string()));
        }
    }

    chunks
}

fn strip_markdown_extension(path: &Path) -> PathBuf {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
        path.with_extension("")
    } else {
        path.to_path_buf()
    }
}

fn normalize_note_key(root: &Path, path: &Path) -> Result<String> {
    let relative = path.strip_prefix(root).map_err(|_| AppError::InvalidPath)?;
    let normalized = strip_markdown_extension(relative);
    let mut key = normalized
        .to_string_lossy()
        .replace('\\', "/")
        .trim()
        .to_string();
    while key.starts_with("./") {
        key = key[2..].to_string();
    }
    Ok(key.to_lowercase())
}

fn normalize_workspace_relative_path(root: &Path, path: &Path) -> Result<String> {
    let relative = path.strip_prefix(root).map_err(|_| AppError::InvalidPath)?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn workspace_absolute_path(root: &Path, stored_path: &str) -> String {
    root.join(stored_path).to_string_lossy().to_string()
}

fn note_link_target(root: &Path, path: &Path) -> Result<String> {
    let relative = path.strip_prefix(root).map_err(|_| AppError::InvalidPath)?;
    let normalized = strip_markdown_extension(relative);
    let mut target = normalized
        .to_string_lossy()
        .replace('\\', "/")
        .trim()
        .to_string();
    while target.starts_with("./") {
        target = target[2..].to_string();
    }
    if target.is_empty() {
        return Err(AppError::InvalidPath);
    }
    Ok(target)
}

fn normalize_workspace_path(root: &Path, raw: &str) -> Result<PathBuf> {
    let mut path = PathBuf::from(raw);
    if path.as_os_str().is_empty() {
        return Err(AppError::InvalidPath);
    }
    if !path.is_absolute() {
        path = root.join(path);
    }

    if path.exists() {
        let canonical = fs::canonicalize(path)?;
        ensure_within_root(root, &canonical)?;
        return Ok(canonical);
    }

    let parent = path.parent().ok_or(AppError::InvalidPath)?;
    let parent_canonical = fs::canonicalize(parent)?;
    let root_canonical = fs::canonicalize(root)?;
    if !parent_canonical.starts_with(root_canonical) {
        return Err(AppError::InvalidPath);
    }

    Ok(path)
}

fn normalize_wikilink_target(raw: &str) -> Option<String> {
    let mut target = raw.trim().replace('\\', "/");
    if target.is_empty() {
        return None;
    }

    while target.starts_with('/') {
        target.remove(0);
    }

    while target.starts_with("./") {
        target = target[2..].to_string();
    }

    if target
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return None;
    }

    let target_lower = target.to_ascii_lowercase();
    if target_lower.ends_with(".markdown") {
        target.truncate(target.len().saturating_sub(".markdown".len()));
    } else if target_lower.ends_with(".md") {
        target.truncate(target.len().saturating_sub(".md".len()));
    }

    let key = target.trim_matches('/').to_lowercase();
    if key.is_empty() {
        return None;
    }
    Some(key)
}

fn parse_wikilink_targets(markdown: &str) -> Vec<String> {
    let mut targets = Vec::new();
    let mut offset = 0usize;

    while let Some(start) = markdown[offset..].find("[[") {
        let content_start = offset + start + 2;
        let Some(end_rel) = markdown[content_start..].find("]]") else {
            break;
        };

        let content_end = content_start + end_rel;
        let content = &markdown[content_start..content_end];
        let target = content
            .split_once('|')
            .map(|(left, _)| left)
            .unwrap_or(content)
            .split_once('#')
            .map(|(left, _)| left)
            .unwrap_or(content)
            .trim();

        if !target.is_empty() {
            targets.push(target.to_string());
        }

        offset = content_end + 2;
    }

    targets
}

fn is_iso_date_token(input: &str) -> bool {
    if input.len() != 10 {
        return false;
    }
    let bytes = input.as_bytes();
    for (idx, value) in bytes.iter().enumerate() {
        if idx == 4 || idx == 7 {
            if *value != b'-' {
                return false;
            }
            continue;
        }
        if !value.is_ascii_digit() {
            return false;
        }
    }

    let year = input[0..4].parse::<u16>().ok().unwrap_or(0);
    let month = input[5..7].parse::<u8>().ok().unwrap_or(0);
    let day = input[8..10].parse::<u8>().ok().unwrap_or(0);
    if year == 0 || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return false;
    }
    true
}

fn parse_iso_date_targets(markdown: &str) -> Vec<String> {
    let mut out = Vec::new();
    for token in markdown.split(|ch: char| ch.is_whitespace() || ",.;:()[]{}<>!?\"'`".contains(ch))
    {
        if is_iso_date_token(token) {
            out.push(format!("journal/{token}"));
        }
    }
    out
}

fn parse_note_targets(markdown: &str) -> Vec<String> {
    let content = strip_yaml_frontmatter(markdown);
    let mut targets = HashSet::new();

    for target in parse_wikilink_targets(content) {
        if let Some(normalized) = normalize_wikilink_target(&target) {
            targets.insert(normalized);
        }
    }

    for target in parse_iso_date_targets(content) {
        targets.insert(target.to_lowercase());
    }

    targets.into_iter().collect()
}

fn strip_yaml_frontmatter(markdown: &str) -> &str {
    if !markdown.starts_with("---\n") {
        return markdown;
    }

    let rest = &markdown[4..];
    if let Some(end) = rest.find("\n---\n") {
        return &rest[(end + 5)..];
    }

    markdown
}

fn extract_yaml_frontmatter(markdown: &str) -> Option<&str> {
    if !markdown.starts_with("---\n") {
        return None;
    }
    let rest = &markdown[4..];
    let end = rest.find("\n---\n")?;
    Some(&rest[..end])
}

#[derive(Debug, Clone)]
struct IndexedProperty {
    key: String,
    kind: &'static str,
    value_text: Option<String>,
    value_num: Option<f64>,
    value_bool: Option<i64>,
    value_date: Option<String>,
}

fn unquote_yaml_scalar(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        let first = bytes[0] as char;
        let last = bytes[trimmed.len() - 1] as char;
        if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }
    trimmed.to_string()
}

fn is_iso_date_value(input: &str) -> bool {
    if input.len() != 10 {
        return false;
    }
    let bytes = input.as_bytes();
    for (idx, value) in bytes.iter().enumerate() {
        if idx == 4 || idx == 7 {
            if *value != b'-' {
                return false;
            }
            continue;
        }
        if !value.is_ascii_digit() {
            return false;
        }
    }
    true
}

fn parse_yaml_frontmatter_properties(markdown: &str) -> Vec<IndexedProperty> {
    let Some(raw_yaml) = extract_yaml_frontmatter(markdown) else {
        return Vec::new();
    };

    let lines: Vec<&str> = raw_yaml.lines().collect();
    let mut out = Vec::new();
    let mut idx = 0usize;

    while idx < lines.len() {
        let line = lines[idx];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            idx += 1;
            continue;
        }
        if line.starts_with(' ') || line.starts_with('\t') {
            idx += 1;
            continue;
        }

        let Some((raw_key, raw_value_part)) = line.split_once(':') else {
            idx += 1;
            continue;
        };

        let key = raw_key.trim().to_lowercase();
        if key.is_empty() {
            idx += 1;
            continue;
        }

        let value_part = raw_value_part.trim_start();

        if value_part == "|" {
            idx += 1;
            let mut text_lines: Vec<String> = Vec::new();
            while idx < lines.len() {
                let next = lines[idx];
                if let Some(stripped) = next.strip_prefix("  ") {
                    text_lines.push(stripped.to_string());
                    idx += 1;
                    continue;
                }
                if next.trim().is_empty() {
                    text_lines.push(String::new());
                    idx += 1;
                    continue;
                }
                break;
            }
            let text = text_lines.join("\n");
            out.push(IndexedProperty {
                key,
                kind: "text",
                value_text: Some(text.to_lowercase()),
                value_num: None,
                value_bool: None,
                value_date: None,
            });
            continue;
        }

        if value_part.starts_with('[') && value_part.ends_with(']') {
            let inner = value_part[1..value_part.len() - 1].trim();
            if !inner.is_empty() {
                for item in inner.split(',') {
                    let value = unquote_yaml_scalar(item);
                    if value.is_empty() {
                        continue;
                    }
                    out.push(IndexedProperty {
                        key: key.clone(),
                        kind: "list",
                        value_text: Some(value.to_lowercase()),
                        value_num: None,
                        value_bool: None,
                        value_date: None,
                    });
                }
            }
            idx += 1;
            continue;
        }

        if value_part.is_empty() {
            idx += 1;
            let mut consumed = false;
            while idx < lines.len() {
                let next = lines[idx];
                let Some(item) = next.strip_prefix("  - ") else {
                    if next.trim().is_empty() {
                        idx += 1;
                        continue;
                    }
                    break;
                };
                consumed = true;
                let value = unquote_yaml_scalar(item);
                if !value.is_empty() {
                    out.push(IndexedProperty {
                        key: key.clone(),
                        kind: "list",
                        value_text: Some(value.to_lowercase()),
                        value_num: None,
                        value_bool: None,
                        value_date: None,
                    });
                }
                idx += 1;
            }
            if !consumed {
                out.push(IndexedProperty {
                    key,
                    kind: "text",
                    value_text: Some(String::new()),
                    value_num: None,
                    value_bool: None,
                    value_date: None,
                });
            }
            continue;
        }

        let scalar = unquote_yaml_scalar(value_part);
        if scalar.eq_ignore_ascii_case("true") || scalar.eq_ignore_ascii_case("false") {
            out.push(IndexedProperty {
                key,
                kind: "bool",
                value_text: Some(scalar.to_lowercase()),
                value_num: None,
                value_bool: Some(if scalar.eq_ignore_ascii_case("true") {
                    1
                } else {
                    0
                }),
                value_date: None,
            });
            idx += 1;
            continue;
        }

        if let Ok(num) = scalar.parse::<f64>() {
            if num.is_finite() {
                out.push(IndexedProperty {
                    key,
                    kind: "number",
                    value_text: Some(scalar.to_lowercase()),
                    value_num: Some(num),
                    value_bool: None,
                    value_date: None,
                });
                idx += 1;
                continue;
            }
        }

        if is_iso_date_value(&scalar) {
            out.push(IndexedProperty {
                key,
                kind: "date",
                value_text: Some(scalar.to_lowercase()),
                value_num: None,
                value_bool: None,
                value_date: Some(scalar),
            });
            idx += 1;
            continue;
        }

        out.push(IndexedProperty {
            key,
            kind: "text",
            value_text: Some(scalar.to_lowercase()),
            value_num: None,
            value_bool: None,
            value_date: None,
        });
        idx += 1;
    }

    out
}

fn split_wikilink_target_suffix(content: &str) -> (&str, &str) {
    let pipe_idx = content.find('|');
    let heading_idx = content.find('#');

    match (pipe_idx, heading_idx) {
        (Some(pipe), Some(heading)) => {
            let idx = pipe.min(heading);
            (&content[..idx], &content[idx..])
        }
        (Some(idx), None) | (None, Some(idx)) => (&content[..idx], &content[idx..]),
        (None, None) => (content, ""),
    }
}

fn rewrite_wikilinks_for_note(
    markdown: &str,
    old_target_key: &str,
    new_target: &str,
) -> (String, bool) {
    let mut output = String::with_capacity(markdown.len());
    let mut offset = 0usize;
    let mut changed = false;

    while let Some(start_rel) = markdown[offset..].find("[[") {
        let start = offset + start_rel;
        let content_start = start + 2;
        output.push_str(&markdown[offset..content_start]);

        let Some(end_rel) = markdown[content_start..].find("]]") else {
            output.push_str(&markdown[content_start..]);
            offset = markdown.len();
            break;
        };

        let content_end = content_start + end_rel;
        let content = &markdown[content_start..content_end];
        let (target_part, suffix) = split_wikilink_target_suffix(content);

        let should_replace =
            normalize_wikilink_target(target_part).is_some_and(|key| key == old_target_key);

        if should_replace {
            output.push_str(new_target);
            output.push_str(suffix);
            changed = true;
        } else {
            output.push_str(content);
        }

        output.push_str("]]");
        offset = content_end + 2;
    }

    if offset < markdown.len() {
        output.push_str(&markdown[offset..]);
    }

    if changed {
        (output, true)
    } else {
        (markdown.to_string(), false)
    }
}

#[tauri::command]
fn init_db() -> Result<()> {
    let conn = open_db()?;

    conn.execute_batch(
    r#"
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      anchor TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      mtime INTEGER NOT NULL DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      path,
      anchor,
      text,
      content='chunks',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, path, anchor, text) VALUES (new.id, new.path, new.anchor, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, path, anchor, text) VALUES('delete', old.id, old.path, old.anchor, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, path, anchor, text) VALUES('delete', old.id, old.path, old.anchor, old.text);
      INSERT INTO chunks_fts(rowid, path, anchor, text) VALUES (new.id, new.path, new.anchor, new.text);
    END;

    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vector BLOB NOT NULL,
      FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS note_links (
      source_path TEXT NOT NULL,
      target_key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_path);
    CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_key);

    CREATE TABLE IF NOT EXISTS note_properties (
      path TEXT NOT NULL,
      key TEXT NOT NULL,
      kind TEXT NOT NULL,
      value_text TEXT,
      value_num REAL,
      value_bool INTEGER,
      value_date TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_note_properties_path ON note_properties(path);
    CREATE INDEX IF NOT EXISTS idx_note_properties_key ON note_properties(key);
    CREATE INDEX IF NOT EXISTS idx_note_properties_key_text ON note_properties(key, value_text);
    CREATE INDEX IF NOT EXISTS idx_note_properties_key_num ON note_properties(key, value_num);
    CREATE INDEX IF NOT EXISTS idx_note_properties_key_bool ON note_properties(key, value_bool);
    CREATE INDEX IF NOT EXISTS idx_note_properties_key_date ON note_properties(key, value_date);
  "#,
  )?;

    Ok(())
}

#[tauri::command]
fn reindex_markdown_file(path: String) -> Result<()> {
    let root = active_workspace_root()?;
    let file_path = normalize_existing_file(&path)?;
    ensure_within_root(&root, &file_path)?;

    let normalized_path = fs::canonicalize(&file_path)?;
    let markdown = fs::read_to_string(&normalized_path)?;
    let content_for_indexing = strip_yaml_frontmatter(&markdown);
    let chunks = chunk_markdown(content_for_indexing);
    let targets = parse_note_targets(&markdown);
    let properties = parse_yaml_frontmatter_properties(&markdown);
    let mtime = fs::metadata(&normalized_path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_secs() as i64)
                .unwrap_or(0)
        });

    let conn = open_db()?;
    let tx = conn.unchecked_transaction()?;
    let root_canonical = root;
    let path_for_db = normalize_workspace_relative_path(&root_canonical, &normalized_path)?;
    let source_key = normalize_note_key(&root_canonical, &normalized_path)?;

    tx.execute(
        "DELETE FROM chunks WHERE path = ?1",
        params![path_for_db.clone()],
    )?;
    tx.execute(
        "DELETE FROM note_links WHERE source_path = ?1",
        params![path_for_db.clone()],
    )?;
    tx.execute(
        "DELETE FROM note_properties WHERE path = ?1",
        params![path_for_db.clone()],
    )?;

    for (anchor, text) in chunks {
        tx.execute(
            "INSERT INTO chunks(path, anchor, text, mtime) VALUES (?1, ?2, ?3, ?4)",
            params![path_for_db, anchor, text, mtime],
        )?;
    }

    for target in targets {
        if target == source_key {
            continue;
        }
        tx.execute(
            "INSERT INTO note_links(source_path, target_key) VALUES (?1, ?2)",
            params![path_for_db, target],
        )?;
    }

    for property in properties {
        tx.execute(
      "INSERT INTO note_properties(path, key, kind, value_text, value_num, value_bool, value_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![
        path_for_db,
        property.key,
        property.kind,
        property.value_text,
        property.value_num,
        property.value_bool,
        property.value_date
      ],
    )?;
    }

    tx.commit()?;
    Ok(())
}

#[derive(Serialize)]
struct RebuildIndexResult {
    indexed_files: usize,
}

#[tauri::command]
fn rebuild_workspace_index() -> Result<RebuildIndexResult> {
    let root_canonical = active_workspace_root()?;
    let conn = open_db()?;

    conn.execute_batch(
        r#"
    DELETE FROM embeddings;
    DELETE FROM chunks;
    DELETE FROM note_links;
    DELETE FROM note_properties;
  "#,
    )?;

    let markdown_files = list_markdown_files_via_find(&root_canonical)?;
    let mut indexed_files = 0usize;
    for candidate in markdown_files {
        let canonical_candidate = match fs::canonicalize(&candidate) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if ensure_within_root(&root_canonical, &canonical_candidate).is_err() {
            continue;
        }
        reindex_markdown_file(canonical_candidate.to_string_lossy().to_string())?;
        indexed_files += 1;
    }

    Ok(RebuildIndexResult { indexed_files })
}

#[tauri::command]
fn read_property_type_schema() -> Result<HashMap<String, String>> {
    let schema_path = property_type_schema_path()?;
    if !schema_path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(schema_path)?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| AppError::InvalidOperation("Property type schema is invalid.".to_string()))?;

    let mut out: HashMap<String, String> = HashMap::new();
    if let Some(object) = parsed.as_object() {
        for (key, value) in object {
            let normalized_key = key.trim().to_lowercase();
            if normalized_key.is_empty() {
                continue;
            }
            let Some(raw_type) = value.as_str() else {
                continue;
            };
            if !matches!(
                raw_type,
                "text" | "list" | "number" | "checkbox" | "date" | "tags"
            ) {
                continue;
            }
            out.insert(normalized_key, raw_type.to_string());
        }
    }

    Ok(out)
}

#[tauri::command]
fn write_property_type_schema(schema: HashMap<String, String>) -> Result<()> {
    let schema_path = property_type_schema_path()?;
    let mut sanitized: HashMap<String, String> = HashMap::new();

    for (key, value) in schema {
        let normalized_key = key.trim().to_lowercase();
        if normalized_key.is_empty() {
            continue;
        }
        if !matches!(
            value.as_str(),
            "text" | "list" | "number" | "checkbox" | "date" | "tags"
        ) {
            continue;
        }
        sanitized.insert(normalized_key, value);
    }

    let serialized =
        serde_json::to_string_pretty(&sanitized).map_err(|_| AppError::OperationFailed)?;
    fs::write(schema_path, serialized)?;
    Ok(())
}

#[derive(Serialize)]
struct Hit {
    path: String,
    snippet: String,
    score: f64,
}

#[derive(Debug, Clone)]
enum PropertyFilter {
    Has { key: String },
    EqText { key: String, value: String },
    EqBool { key: String, value: i64 },
    EqNum { key: String, value: f64 },
    EqDate { key: String, value: String },
    GtNum { key: String, value: f64 },
    GteNum { key: String, value: f64 },
    LtNum { key: String, value: f64 },
    LteNum { key: String, value: f64 },
    GtDate { key: String, value: String },
    GteDate { key: String, value: String },
    LtDate { key: String, value: String },
    LteDate { key: String, value: String },
}

fn is_property_key_token(input: &str) -> bool {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return false;
    }
    trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn parse_property_filter_token(token: &str) -> Option<PropertyFilter> {
    let token = token.trim();
    if token.is_empty() {
        return None;
    }

    if let Some(raw_key) = token.strip_prefix("has:") {
        let key = raw_key.trim().to_lowercase();
        if is_property_key_token(&key) {
            return Some(PropertyFilter::Has { key });
        }
        return None;
    }

    let operators = [
        (">=", 2usize),
        ("<=", 2usize),
        (">", 1usize),
        ("<", 1usize),
        (":", 1usize),
        ("=", 1usize),
    ];
    for (op, len) in operators {
        let Some(position) = token.find(op) else {
            continue;
        };
        if position == 0 {
            return None;
        }
        let key = token[..position].trim().to_lowercase();
        if !is_property_key_token(&key) {
            return None;
        }
        let raw_value = token[(position + len)..].trim();
        if raw_value.is_empty() {
            return None;
        }
        let value = unquote_yaml_scalar(raw_value);

        if op == ":" || op == "=" {
            if value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("false") {
                return Some(PropertyFilter::EqBool {
                    key,
                    value: if value.eq_ignore_ascii_case("true") {
                        1
                    } else {
                        0
                    },
                });
            }
            if let Ok(number) = value.parse::<f64>() {
                if number.is_finite() {
                    return Some(PropertyFilter::EqNum { key, value: number });
                }
            }
            if is_iso_date_value(&value) {
                return Some(PropertyFilter::EqDate { key, value });
            }
            return Some(PropertyFilter::EqText {
                key,
                value: value.to_lowercase(),
            });
        }

        if is_iso_date_value(&value) {
            return match op {
                ">" => Some(PropertyFilter::GtDate { key, value }),
                ">=" => Some(PropertyFilter::GteDate { key, value }),
                "<" => Some(PropertyFilter::LtDate { key, value }),
                "<=" => Some(PropertyFilter::LteDate { key, value }),
                _ => None,
            };
        }

        if let Ok(number) = value.parse::<f64>() {
            if number.is_finite() {
                return match op {
                    ">" => Some(PropertyFilter::GtNum { key, value: number }),
                    ">=" => Some(PropertyFilter::GteNum { key, value: number }),
                    "<" => Some(PropertyFilter::LtNum { key, value: number }),
                    "<=" => Some(PropertyFilter::LteNum { key, value: number }),
                    _ => None,
                };
            }
        }
        return None;
    }

    None
}

fn split_search_query(raw: &str) -> (String, Vec<PropertyFilter>) {
    let mut text_terms: Vec<String> = Vec::new();
    let mut filters: Vec<PropertyFilter> = Vec::new();

    for token in raw.split_whitespace() {
        if let Some(filter) = parse_property_filter_token(token) {
            filters.push(filter);
        } else {
            text_terms.push(token.to_string());
        }
    }

    (text_terms.join(" "), filters)
}

fn path_set_for_property_filter(
    conn: &Connection,
    filter: &PropertyFilter,
) -> Result<HashSet<String>> {
    let (sql, args): (&str, Vec<SqlValue>) = match filter {
        PropertyFilter::Has { key } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1",
            vec![SqlValue::Text(key.clone())],
        ),
        PropertyFilter::EqText { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_text = ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Text(value.clone())],
        ),
        PropertyFilter::EqBool { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_bool = ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Integer(*value)],
        ),
        PropertyFilter::EqNum { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_num = ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Real(*value)],
        ),
        PropertyFilter::EqDate { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_date = ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Text(value.clone())],
        ),
        PropertyFilter::GtNum { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_num > ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Real(*value)],
        ),
        PropertyFilter::GteNum { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_num >= ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Real(*value)],
        ),
        PropertyFilter::LtNum { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_num < ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Real(*value)],
        ),
        PropertyFilter::LteNum { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_num <= ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Real(*value)],
        ),
        PropertyFilter::GtDate { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_date > ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Text(value.clone())],
        ),
        PropertyFilter::GteDate { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_date >= ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Text(value.clone())],
        ),
        PropertyFilter::LtDate { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_date < ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Text(value.clone())],
        ),
        PropertyFilter::LteDate { key, value } => (
            "SELECT DISTINCT path FROM note_properties WHERE key = ?1 AND value_date <= ?2",
            vec![SqlValue::Text(key.clone()), SqlValue::Text(value.clone())],
        ),
    };

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query(params_from_iter(args.iter()))?;
    let mut out = HashSet::new();
    while let Some(row) = rows.next()? {
        let path: String = row.get(0)?;
        out.insert(path);
    }
    Ok(out)
}

fn paths_matching_property_filters(
    conn: &Connection,
    filters: &[PropertyFilter],
) -> Result<HashSet<String>> {
    let mut acc: Option<HashSet<String>> = None;
    for filter in filters {
        let next = path_set_for_property_filter(conn, filter)?;
        if let Some(existing) = acc.as_mut() {
            existing.retain(|item| next.contains(item));
        } else {
            acc = Some(next);
        }
    }
    Ok(acc.unwrap_or_default())
}

#[tauri::command]
fn fts_search(query: String) -> Result<Vec<Hit>> {
    let conn = open_db()?;
    let root_canonical = active_workspace_root()?;
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let (text_query, property_filters) = split_search_query(q);
    let property_paths = if property_filters.is_empty() {
        None
    } else {
        Some(paths_matching_property_filters(&conn, &property_filters)?)
    };

    if text_query.is_empty() {
        let Some(paths) = property_paths else {
            return Ok(vec![]);
        };

        let mut out: Vec<Hit> = paths
            .into_iter()
            .map(|path| Hit {
                path: workspace_absolute_path(&root_canonical, &path),
                snippet: "property match".to_string(),
                score: 0.0,
            })
            .collect();
        out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
        out.truncate(25);
        return Ok(out);
    }

    let mut stmt = conn.prepare(
        r#"
    SELECT path,
           snippet(chunks_fts, 2, '<b>', '</b>', '...', 12) AS snip,
           bm25(chunks_fts) AS score
    FROM chunks_fts
    WHERE chunks_fts MATCH ?1
    ORDER BY score
    LIMIT 25;
  "#,
    )?;

    let mut rows = stmt.query(params![text_query])?;
    let mut out = Vec::new();

    while let Some(row) = rows.next()? {
        let path = row.get::<_, String>(0)?;
        if let Some(paths) = property_paths.as_ref() {
            if !paths.contains(&path) {
                continue;
            }
        }
        out.push(Hit {
            path: workspace_absolute_path(&root_canonical, &path),
            snippet: row.get::<_, String>(1)?,
            score: row.get::<_, f64>(2)?,
        });
    }
    Ok(out)
}

#[derive(Serialize)]
struct Backlink {
    path: String,
}

#[derive(Serialize)]
struct WikilinkRewriteResult {
    updated_files: usize,
}

fn list_markdown_files_via_find(root: &Path) -> Result<Vec<PathBuf>> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                if name == INTERNAL_DIR_NAME || name == TRASH_DIR_NAME {
                    continue;
                }
                walk(&path, out)?;
                continue;
            }

            if !path.is_file() {
                continue;
            }

            if name == DB_FILE_NAME || name.starts_with("meditor.sqlite-") {
                continue;
            }

            let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
                continue;
            };

            if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
                out.push(path);
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    walk(root, &mut files)?;
    Ok(files)
}

#[tauri::command]
fn backlinks_for_path(path: String) -> Result<Vec<Backlink>> {
    let root_canonical = active_workspace_root()?;
    let mut path_buf = PathBuf::from(path);
    if path_buf.as_os_str().is_empty() {
        return Err(AppError::InvalidPath);
    }
    if !path_buf.is_absolute() {
        path_buf = root_canonical.join(path_buf);
    }
    if path_buf.exists() {
        path_buf = fs::canonicalize(path_buf)?;
    }

    let target_key = normalize_note_key(&root_canonical, &path_buf)?;
    if target_key.is_empty() {
        return Ok(vec![]);
    }

    let markdown_files = list_markdown_files_via_find(&root_canonical)?;
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for candidate in markdown_files {
        let canonical_candidate = match fs::canonicalize(&candidate) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let source_key = match normalize_note_key(&root_canonical, &canonical_candidate) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if source_key == target_key {
            continue;
        }

        let markdown = match fs::read_to_string(&canonical_candidate) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let targets = parse_note_targets(&markdown);
        if !targets.iter().any(|item| item == &target_key) {
            continue;
        }

        let source_path = canonical_candidate.to_string_lossy().to_string();
        if seen.insert(source_path.clone()) {
            out.push(Backlink { path: source_path });
        }
    }

    out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(out)
}

#[tauri::command]
fn update_wikilinks_for_rename(
    old_path: String,
    new_path: String,
) -> Result<WikilinkRewriteResult> {
    let root_canonical = active_workspace_root()?;
    let old_note_path = normalize_workspace_path(&root_canonical, &old_path)?;
    let new_note_path = normalize_workspace_path(&root_canonical, &new_path)?;

    let old_target_key = normalize_note_key(&root_canonical, &old_note_path)?;
    let new_target = note_link_target(&root_canonical, &new_note_path)?;
    if old_target_key.is_empty()
        || old_target_key == normalize_note_key(&root_canonical, &new_note_path)?
    {
        return Ok(WikilinkRewriteResult { updated_files: 0 });
    }

    let markdown_files = list_markdown_files_via_find(&root_canonical)?;
    let mut changed_files = 0usize;

    for candidate in markdown_files {
        let canonical_candidate = match fs::canonicalize(&candidate) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let markdown = match fs::read_to_string(&canonical_candidate) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let (updated_markdown, changed) =
            rewrite_wikilinks_for_note(&markdown, &old_target_key, &new_target);
        if !changed {
            continue;
        }

        fs::write(&canonical_candidate, updated_markdown)?;
        reindex_markdown_file(canonical_candidate.to_string_lossy().to_string())?;
        changed_files += 1;
    }

    Ok(WikilinkRewriteResult {
        updated_files: changed_files,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            select_working_folder,
            clear_working_folder,
            set_working_folder,
            list_children,
            list_markdown_files,
            path_exists,
            read_text_file,
            write_text_file,
            create_entry,
            rename_entry,
            duplicate_entry,
            copy_entry,
            move_entry,
            trash_entry,
            open_path_external,
            open_external_url,
            reveal_in_file_manager,
            init_db,
            reindex_markdown_file,
            fts_search,
            rebuild_workspace_index,
            backlinks_for_path,
            update_wikilinks_for_rename,
            read_property_type_schema,
            write_property_type_schema
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::fs;

    use directories::UserDirs;

    use super::*;

    #[test]
    fn rewrite_wikilinks_replaces_matching_target() {
        let input = "See [[notes/old]].";
        let (output, changed) = rewrite_wikilinks_for_note(input, "notes/old", "notes/new");
        assert!(changed);
        assert_eq!(output, "See [[notes/new]].");
    }

    #[test]
    fn rewrite_wikilinks_preserves_alias_and_heading() {
        let input = "[[notes/old|Alias]] and [[notes/old#section]].";
        let (output, changed) = rewrite_wikilinks_for_note(input, "notes/old", "notes/new");
        assert!(changed);
        assert_eq!(output, "[[notes/new|Alias]] and [[notes/new#section]].");
    }

    #[test]
    fn rewrite_wikilinks_keeps_non_matching_targets() {
        let input = "[[notes/old-stuff]] [[notes/other]].";
        let (output, changed) = rewrite_wikilinks_for_note(input, "notes/old", "notes/new");
        assert!(!changed);
        assert_eq!(output, input);
    }

    #[test]
    fn rewrite_wikilinks_matches_case_and_extensions() {
        let input = "[[Notes/Old.MD]] [[notes/old.markdown]].";
        let (output, changed) = rewrite_wikilinks_for_note(input, "notes/old", "notes/new");
        assert!(changed);
        assert_eq!(output, "[[notes/new]] [[notes/new]].");
    }

    #[test]
    fn strip_yaml_frontmatter_removes_header_block() {
        let markdown = "---\ntitle: Test\ntags: [one]\n---\n# Body\n[[note]]";
        let stripped = strip_yaml_frontmatter(markdown);
        assert_eq!(stripped, "# Body\n[[note]]");
    }

    #[test]
    fn parse_note_targets_ignores_frontmatter_links() {
        let markdown = "---\nassignee: \"[[Alice]]\"\n---\n[[BodyNote]]";
        let targets = parse_note_targets(markdown);
        assert_eq!(targets.len(), 1);
        assert!(targets.iter().any(|item| item == "bodynote"));
    }

    #[test]
    fn parse_yaml_frontmatter_properties_indexes_scalars_and_lists() {
        let markdown =
            "---\npriority: 2\narchive: true\ndeadline: 2026-03-01\ntags: [dev, urgent]\n---\nbody";
        let indexed = parse_yaml_frontmatter_properties(markdown);
        assert!(indexed
            .iter()
            .any(|item| item.key == "priority" && item.kind == "number"));
        assert!(indexed
            .iter()
            .any(|item| item.key == "archive" && item.kind == "bool"));
        assert!(indexed
            .iter()
            .any(|item| item.key == "deadline" && item.kind == "date"));
        assert!(indexed.iter().any(|item| item.key == "tags"
            && item.kind == "list"
            && item.value_text.as_deref() == Some("dev")));
        assert!(indexed.iter().any(|item| item.key == "tags"
            && item.kind == "list"
            && item.value_text.as_deref() == Some("urgent")));
    }

    #[test]
    fn split_search_query_extracts_property_filters() {
        let (text, filters) =
            split_search_query("roadmap tags:dev deadline>=2026-01-01 has:archive");
        assert_eq!(text, "roadmap");
        assert_eq!(filters.len(), 3);
    }

    #[test]
    fn set_active_workspace_rejects_home_directory() {
        let Some(user_dirs) = UserDirs::new() else {
            return;
        };

        let home = user_dirs.home_dir().to_string_lossy().to_string();
        let result = set_active_workspace(&home);
        assert!(result.is_err());
    }

    #[test]
    fn set_active_workspace_rejects_special_user_directories() {
        let Some(user_dirs) = UserDirs::new() else {
            return;
        };

        let special_dirs = [
            user_dirs.desktop_dir(),
            user_dirs.document_dir(),
            user_dirs.download_dir(),
            user_dirs.picture_dir(),
            user_dirs.audio_dir(),
            user_dirs.video_dir(),
            user_dirs.public_dir(),
        ];

        for dir in special_dirs.into_iter().flatten() {
            let result = set_active_workspace(&dir.to_string_lossy());
            assert!(
                result.is_err(),
                "expected special directory to be rejected: {dir:?}"
            );
        }
    }

    #[test]
    fn set_active_workspace_accepts_regular_folder() {
        let temp = std::env::temp_dir().join("meditor-workspace-guard-test");
        fs::create_dir_all(&temp).expect("create temp dir");

        let set = set_active_workspace(&temp.to_string_lossy()).expect("set workspace");
        let active = active_workspace_root().expect("active workspace");
        assert_eq!(set, active);

        fs::remove_dir_all(&temp).expect("cleanup");
    }
}
