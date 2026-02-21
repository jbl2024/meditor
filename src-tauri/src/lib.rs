use std::{
  fs,
  path::{Path, PathBuf},
};

use rfd::FileDialog;
use rusqlite::{params, Connection};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("sqlite error: {0}")]
  Sqlite(#[from] rusqlite::Error),
  #[error("invalid path")]
  InvalidPath,
}

type Result<T> = std::result::Result<T, AppError>;

impl From<AppError> for tauri::ipc::InvokeError {
  fn from(err: AppError) -> Self {
    tauri::ipc::InvokeError::from(err.to_string())
  }
}

fn normalize_path(p: &str) -> Result<PathBuf> {
  let pb = PathBuf::from(p);
  if pb.as_os_str().is_empty() {
    return Err(AppError::InvalidPath);
  }
  Ok(pb)
}

fn is_markdown_file(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
    .unwrap_or(false)
}

#[derive(Serialize)]
struct TreeNode {
  name: String,
  path: String,
  is_dir: bool,
  children: Vec<TreeNode>,
}

fn collect_tree(dir: &Path) -> Result<Vec<TreeNode>> {
  let mut dirs = Vec::new();
  let mut files = Vec::new();

  for entry in fs::read_dir(dir)? {
    let entry = entry?;
    let path = entry.path();
    let file_name = entry.file_name().to_string_lossy().to_string();

    if path.is_dir() {
      let children = collect_tree(&path)?;
      if !children.is_empty() {
        dirs.push(TreeNode {
          name: file_name,
          path: path.to_string_lossy().to_string(),
          is_dir: true,
          children,
        });
      }
    } else if path.is_file() && is_markdown_file(&path) {
      files.push(TreeNode {
        name: file_name,
        path: path.to_string_lossy().to_string(),
        is_dir: false,
        children: Vec::new(),
      });
    }
  }

  dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  dirs.extend(files);
  Ok(dirs)
}

#[tauri::command]
fn select_working_folder() -> Result<Option<String>> {
  Ok(
    FileDialog::new()
      .pick_folder()
      .map(|path| path.to_string_lossy().to_string()),
  )
}

#[tauri::command]
fn list_tree(path: String) -> Result<Vec<TreeNode>> {
  let pb = normalize_path(&path)?;
  if !pb.is_dir() {
    return Err(AppError::InvalidPath);
  }
  collect_tree(&pb)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String> {
  let pb = normalize_path(&path)?;
  Ok(fs::read_to_string(pb)?)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<()> {
  let pb = normalize_path(&path)?;
  fs::write(pb, content)?;
  Ok(())
}

fn db_path(folder_path: &str) -> Result<PathBuf> {
  let folder = normalize_path(folder_path)?;
  if !folder.is_dir() {
    return Err(AppError::InvalidPath);
  }
  Ok(folder.join("meditor.sqlite"))
}

fn open_db(folder_path: &str) -> Result<Connection> {
  let p = db_path(folder_path)?;
  Ok(Connection::open(p)?)
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

    -- FTS5, with bm25() available.
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

    -- Embeddings table: simple float32 blob storage.
    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vector BLOB NOT NULL,
      FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );
  "#,
  )?;

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

  // snippet() and bm25() are provided by FTS5.
  // Important: lower score is better.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      select_working_folder,
      list_tree,
      read_text_file,
      write_text_file,
      init_db,
      fts_search
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
