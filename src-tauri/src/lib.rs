use std::{
  fs,
  path::PathBuf,
};

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::Manager;
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("sqlite error: {0}")]
  Sqlite(#[from] rusqlite::Error),
  #[error("invalid path")]
  InvalidPath,
  #[error("app data dir not available")]
  NoAppDataDir,
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

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>> {
  let pb = normalize_path(&path)?;
  let mut out = Vec::new();
  for entry in fs::read_dir(pb)? {
    let entry = entry?;
    let p = entry.path();
    if p.is_file() {
      if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
          out.push(p.to_string_lossy().to_string());
        }
      }
    }
  }
  out.sort();
  Ok(out)
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

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf> {
  let data_dir = app.path().app_data_dir().map_err(|_| AppError::NoAppDataDir)?;
  fs::create_dir_all(&data_dir)?;
  Ok(data_dir.join("index.sqlite"))
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection> {
  let p = db_path(app)?;
  Ok(Connection::open(p)?)
}

#[tauri::command]
fn init_db(app: tauri::AppHandle) -> Result<()> {
  let conn = open_db(&app)?;

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

    -- FTS5, avec bm25() disponible.
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

    -- Table embeddings: stockage simple en BLOB float32.
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
fn fts_search(app: tauri::AppHandle, query: String) -> Result<Vec<Hit>> {
  let conn = open_db(&app)?;
  let q = query.trim();
  if q.is_empty() {
    return Ok(vec![]);
  }

  // snippet() et bm25() sont fournis par FTS5.
  // Important: score plus petit = meilleur.
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
      list_dir,
      read_text_file,
      write_text_file,
      init_db,
      fts_search
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
