mod fs_ops;

use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::Serialize;
use thiserror::Error;

use fs_ops::{
  copy_entry, create_entry, duplicate_entry, list_children, move_entry, open_path_external,
  path_exists, read_text_file, rename_entry, reveal_in_file_manager, select_working_folder,
  trash_entry, write_text_file,
};

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

fn db_path(folder_path: &str) -> Result<PathBuf> {
  let folder = normalize_existing_dir(folder_path)?;
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
      list_children,
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
      fts_search
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
