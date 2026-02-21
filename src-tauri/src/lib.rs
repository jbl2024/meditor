mod fs_ops;

use std::{
  collections::HashSet,
  fs,
  path::{Path, PathBuf},
  process::Command,
  time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection};
use serde::Serialize;
use thiserror::Error;

use fs_ops::{
  copy_entry, create_entry, duplicate_entry, list_children, list_markdown_files, move_entry,
  open_path_external, path_exists, read_text_file, rename_entry, reveal_in_file_manager,
  select_working_folder, trash_entry, write_text_file,
};

const INTERNAL_DIR_NAME: &str = ".meditor";
const DB_FILE_NAME: &str = "meditor.sqlite";

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

fn open_db(folder_path: &str) -> Result<Connection> {
  let root = normalize_existing_dir(folder_path)?;
  let db_dir = root.join(INTERNAL_DIR_NAME);
  fs::create_dir_all(&db_dir)?;

  let db_path = db_dir.join(DB_FILE_NAME);
  Ok(Connection::open(db_path)?)
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
  let ext = path.extension().and_then(|value| value.to_str()).unwrap_or_default();
  if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
    path.with_extension("")
  } else {
    path.to_path_buf()
  }
}

fn normalize_note_key(root: &Path, path: &Path) -> Result<String> {
  let relative = path.strip_prefix(root).map_err(|_| AppError::InvalidPath)?;
  let normalized = strip_markdown_extension(relative);
  let mut key = normalized.to_string_lossy().replace('\\', "/").trim().to_string();
  while key.starts_with("./") {
    key = key[2..].to_string();
  }
  Ok(key.to_lowercase())
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

  if let Some(stripped) = target.strip_suffix(".md") {
    target = stripped.to_string();
  } else if let Some(stripped) = target.strip_suffix(".markdown") {
    target = stripped.to_string();
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
  for token in markdown.split(|ch: char| ch.is_whitespace() || ",.;:()[]{}<>!?\"'`".contains(ch)) {
    if is_iso_date_token(token) {
      out.push(format!("journal/{token}"));
    }
  }
  out
}

fn parse_note_targets(markdown: &str) -> Vec<String> {
  let mut targets = HashSet::new();

  for target in parse_wikilink_targets(markdown) {
    if let Some(normalized) = normalize_wikilink_target(&target) {
      targets.insert(normalized);
    }
  }

  for target in parse_iso_date_targets(markdown) {
    targets.insert(target.to_lowercase());
  }

  targets.into_iter().collect()
}

#[tauri::command]
fn init_db(folder_path: String) -> Result<()> {
  let conn = open_db(&folder_path)?;

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
  "#,
  )?;

  Ok(())
}

#[tauri::command]
fn reindex_markdown_file(folder_path: String, path: String) -> Result<()> {
  let root = normalize_existing_dir(&folder_path)?;
  let file_path = normalize_existing_file(&path)?;
  ensure_within_root(&root, &file_path)?;

  let normalized_path = fs::canonicalize(&file_path)?;
  let markdown = fs::read_to_string(&normalized_path)?;
  let chunks = chunk_markdown(&markdown);
  let targets = parse_note_targets(&markdown);
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

  let conn = open_db(&folder_path)?;
  let tx = conn.unchecked_transaction()?;
  let path_for_db = normalized_path.to_string_lossy().to_string();
  let root_canonical = fs::canonicalize(&root)?;
  let source_key = normalize_note_key(&root_canonical, &normalized_path)?;

  tx.execute("DELETE FROM chunks WHERE path = ?1", params![path_for_db.clone()])?;
  tx.execute("DELETE FROM note_links WHERE source_path = ?1", params![path_for_db.clone()])?;

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

  tx.commit()?;
  Ok(())
}

#[derive(Serialize)]
struct Hit {
  path: String,
  snippet: String,
  score: f64,
}

#[tauri::command]
fn fts_search(folder_path: String, query: String) -> Result<Vec<Hit>> {
  let conn = open_db(&folder_path)?;
  let q = query.trim();
  if q.is_empty() {
    return Ok(vec![]);
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

  let mut rows = stmt.query(params![q])?;
  let mut out = Vec::new();

  while let Some(row) = rows.next()? {
    out.push(Hit {
      path: row.get::<_, String>(0)?,
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

fn list_markdown_files_via_find(root: &Path) -> Result<Vec<PathBuf>> {
  let output = Command::new("find")
    .arg(root)
    .args(["-type", "f", "(", "-iname", "*.md", "-o", "-iname", "*.markdown", ")"])
    .output()?;

  if !output.status.success() {
    return Err(AppError::OperationFailed);
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  let mut files = Vec::new();
  for line in stdout.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    files.push(PathBuf::from(trimmed));
  }

  Ok(files)
}

#[tauri::command]
fn backlinks_for_path(folder_path: String, path: String) -> Result<Vec<Backlink>> {
  let root = normalize_existing_dir(&folder_path)?;
  let root_canonical = fs::canonicalize(&root)?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      select_working_folder,
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
      reveal_in_file_manager,
      init_db,
      reindex_markdown_file,
      fts_search,
      backlinks_for_path
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
