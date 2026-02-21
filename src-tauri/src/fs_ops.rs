use std::{
  fs,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

use rfd::FileDialog;
use serde::{Deserialize, Serialize};

use crate::{AppError, Result};

const TRASH_DIR_NAME: &str = ".meditor-trash";
const INTERNAL_DIR_NAME: &str = ".meditor";
const DB_FILE_NAME: &str = "meditor.sqlite";

#[derive(Debug, Clone, Serialize)]
pub struct TreeNode {
  pub name: String,
  pub path: String,
  pub is_dir: bool,
  pub is_markdown: bool,
  pub has_children: bool,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStrategy {
  Fail,
  Rename,
  Overwrite,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
  File,
  Folder,
}

fn is_markdown_file(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
    .unwrap_or(false)
}

fn should_skip_file(path: &Path) -> bool {
  let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
    return false;
  };

  file_name == DB_FILE_NAME || file_name.starts_with("meditor.sqlite-")
}

fn should_skip_dir_name(name: &str) -> bool {
  name == TRASH_DIR_NAME || name == INTERNAL_DIR_NAME
}

fn normalize_existing_dir(path: &str) -> Result<PathBuf> {
  let pb = PathBuf::from(path);
  if pb.as_os_str().is_empty() || !pb.is_dir() {
    return Err(AppError::InvalidPath);
  }
  Ok(pb)
}

fn normalize_path(path: &str) -> Result<PathBuf> {
  let pb = PathBuf::from(path);
  if pb.as_os_str().is_empty() {
    return Err(AppError::InvalidPath);
  }
  Ok(pb)
}

fn normalize_existing_path(path: &str) -> Result<PathBuf> {
  let pb = PathBuf::from(path);
  if pb.as_os_str().is_empty() || !pb.exists() {
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

fn ensure_parent_within_root(root: &Path, path: &Path) -> Result<()> {
  let Some(parent) = path.parent() else {
    return Err(AppError::InvalidPath);
  };

  let root_canonical = fs::canonicalize(root)?;
  let parent_canonical = fs::canonicalize(parent)?;

  if !parent_canonical.starts_with(&root_canonical) {
    return Err(AppError::InvalidPath);
  }
  Ok(())
}

fn validate_name(name: &str) -> Result<String> {
  let trimmed = name.trim();
  if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
    return Err(AppError::InvalidName);
  }

  if trimmed.contains('/') || trimmed.contains('\\') {
    return Err(AppError::InvalidName);
  }

  if trimmed
    .chars()
    .any(|ch| matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*') || ch.is_control())
  {
    return Err(AppError::InvalidName);
  }

  if trimmed.ends_with('.') || trimmed.ends_with(' ') {
    return Err(AppError::InvalidName);
  }

  let lower = trimmed.to_ascii_lowercase();
  if matches!(
    lower.as_str(),
    "con"
      | "prn"
      | "aux"
      | "nul"
      | "com1"
      | "com2"
      | "com3"
      | "com4"
      | "com5"
      | "com6"
      | "com7"
      | "com8"
      | "com9"
      | "lpt1"
      | "lpt2"
      | "lpt3"
      | "lpt4"
      | "lpt5"
      | "lpt6"
      | "lpt7"
      | "lpt8"
      | "lpt9"
  ) {
    return Err(AppError::InvalidName);
  }

  if trimmed.len() > 255 {
    return Err(AppError::InvalidName);
  }

  Ok(trimmed.to_string())
}

fn split_name_and_extension(file_name: &str, is_dir: bool) -> (String, String) {
  if is_dir {
    return (file_name.to_string(), String::new());
  }

  if let Some((stem, ext)) = file_name.rsplit_once('.') {
    if !stem.is_empty() {
      return (stem.to_string(), format!(".{ext}"));
    }
  }

  (file_name.to_string(), String::new())
}

fn next_available_path(path: &Path) -> Result<PathBuf> {
  let Some(parent) = path.parent() else {
    return Err(AppError::InvalidPath);
  };

  let file_name = path
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or(AppError::InvalidPath)?;

  let is_dir = path.is_dir() || path.extension().is_none();
  let (stem, ext) = split_name_and_extension(file_name, is_dir);

  for idx in 1..10_000 {
    let candidate_name = format!("{stem} ({idx}){ext}");
    let candidate_path = parent.join(candidate_name);
    if !candidate_path.exists() {
      return Ok(candidate_path);
    }
  }

  Err(AppError::OperationFailed)
}

fn resolve_destination(path: PathBuf, strategy: ConflictStrategy, is_dir: bool) -> Result<PathBuf> {
  if !path.exists() {
    return Ok(path);
  }

  match strategy {
    ConflictStrategy::Fail => Err(AppError::AlreadyExists),
    ConflictStrategy::Rename => next_available_path(&path),
    ConflictStrategy::Overwrite => {
      if is_dir || path.is_dir() {
        Err(AppError::InvalidOperation(
          "Cannot overwrite an existing folder.".to_string(),
        ))
      } else {
        Ok(path)
      }
    }
  }
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<()> {
  fs::create_dir_all(destination)?;

  for entry in fs::read_dir(source)? {
    let entry = entry?;
    let source_path = entry.path();
    let destination_path = destination.join(entry.file_name());

    if source_path.is_dir() {
      copy_dir_recursive(&source_path, &destination_path)?;
    } else {
      fs::copy(&source_path, &destination_path)?;
    }
  }

  Ok(())
}

fn duplicate_file_name(path: &Path) -> Result<String> {
  let file_name = path
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or(AppError::InvalidPath)?;

  let is_dir = path.is_dir();
  let (stem, ext) = split_name_and_extension(file_name, is_dir);
  Ok(format!("{stem} copy{ext}"))
}

fn directory_has_visible_children(dir: &Path) -> Result<bool> {
  for entry in fs::read_dir(dir)? {
    let entry = entry?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if should_skip_dir_name(&name) {
      continue;
    }
    if path.is_dir() {
      return Ok(true);
    }
    if path.is_file() && !should_skip_file(&path) {
      return Ok(true);
    }
  }
  Ok(false)
}

fn collect_children(dir: &Path) -> Result<Vec<TreeNode>> {
  let mut directories: Vec<TreeNode> = Vec::new();
  let mut files: Vec<TreeNode> = Vec::new();

  for entry in fs::read_dir(dir)? {
    let entry = entry?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();

    if should_skip_dir_name(&name) {
      continue;
    }

    if path.is_dir() {
      directories.push(TreeNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: true,
        is_markdown: false,
        has_children: directory_has_visible_children(&path)?,
      });
      continue;
    }

    if should_skip_file(&path) {
      continue;
    }

    files.push(TreeNode {
      name,
      path: path.to_string_lossy().to_string(),
      is_dir: false,
      is_markdown: is_markdown_file(&path),
      has_children: false,
    });
  }

  directories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  directories.extend(files);
  Ok(directories)
}

fn collect_markdown_files_recursive(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<()> {
  for entry in fs::read_dir(dir)? {
    let entry = entry?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();

    if should_skip_dir_name(&name) {
      continue;
    }

    if path.is_dir() {
      collect_markdown_files_recursive(root, &path, out)?;
      continue;
    }

    if should_skip_file(&path) || !is_markdown_file(&path) {
      continue;
    }

    let relative = path.strip_prefix(root).map_err(|_| AppError::InvalidPath)?;
    out.push(relative.to_string_lossy().replace('\\', "/"));
  }

  Ok(())
}

#[tauri::command]
pub fn select_working_folder() -> Result<Option<String>> {
  Ok(
    FileDialog::new()
      .pick_folder()
      .map(|path| path.to_string_lossy().to_string()),
  )
}

#[tauri::command]
pub fn list_children(folder_path: String, dir_path: String) -> Result<Vec<TreeNode>> {
  let root = normalize_existing_dir(&folder_path)?;
  let dir = normalize_existing_dir(&dir_path)?;
  ensure_within_root(&root, &dir)?;
  collect_children(&dir)
}

#[tauri::command]
pub fn list_markdown_files(folder_path: String) -> Result<Vec<String>> {
  let root = normalize_existing_dir(&folder_path)?;
  let root_canonical = fs::canonicalize(&root)?;
  let mut out = Vec::new();
  collect_markdown_files_recursive(&root_canonical, &root_canonical, &mut out)?;
  out.sort_by_key(|path| path.to_ascii_lowercase());
  Ok(out)
}

#[tauri::command]
pub fn path_exists(folder_path: String, path: String) -> Result<bool> {
  let root = normalize_existing_dir(&folder_path)?;
  let pb = normalize_path(&path)?;
  ensure_parent_within_root(&root, &pb)?;
  Ok(pb.exists())
}

#[tauri::command]
pub fn read_text_file(folder_path: String, path: String) -> Result<String> {
  let root = normalize_existing_dir(&folder_path)?;
  let pb = normalize_existing_path(&path)?;
  ensure_within_root(&root, &pb)?;
  Ok(fs::read_to_string(pb)?)
}

#[tauri::command]
pub fn write_text_file(folder_path: String, path: String, content: String) -> Result<()> {
  let root = normalize_existing_dir(&folder_path)?;
  let pb = normalize_path(&path)?;
  ensure_parent_within_root(&root, &pb)?;
  fs::write(pb, content)?;
  Ok(())
}

#[tauri::command]
pub fn create_entry(
  folder_path: String,
  parent_path: String,
  name: String,
  kind: EntryKind,
  conflict_strategy: ConflictStrategy,
) -> Result<String> {
  let root = normalize_existing_dir(&folder_path)?;
  let parent = normalize_existing_dir(&parent_path)?;
  ensure_within_root(&root, &parent)?;

  let safe_name = validate_name(&name)?;
  let base_path = parent.join(safe_name);
  ensure_parent_within_root(&root, &base_path)?;

  let is_dir = matches!(kind, EntryKind::Folder);
  let destination = resolve_destination(base_path, conflict_strategy, is_dir)?;

  if is_dir {
    fs::create_dir_all(&destination)?;
  } else if destination.exists() {
    fs::write(&destination, "")?;
  } else {
    fs::File::create(&destination)?;
  }

  Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_entry(
  folder_path: String,
  path: String,
  new_name: String,
  conflict_strategy: ConflictStrategy,
) -> Result<String> {
  let root = normalize_existing_dir(&folder_path)?;
  let source = normalize_existing_path(&path)?;
  ensure_within_root(&root, &source)?;

  let Some(parent) = source.parent() else {
    return Err(AppError::InvalidPath);
  };

  let safe_name = validate_name(&new_name)?;
  let base_destination = parent.join(safe_name);

  if source == base_destination {
    return Ok(source.to_string_lossy().to_string());
  }

  let destination = resolve_destination(base_destination, conflict_strategy, source.is_dir())?;

  if destination.exists() && source.is_file() {
    fs::remove_file(&destination)?;
  }

  fs::rename(&source, &destination)?;
  Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn duplicate_entry(
  folder_path: String,
  path: String,
  conflict_strategy: ConflictStrategy,
) -> Result<String> {
  let root = normalize_existing_dir(&folder_path)?;
  let source = normalize_existing_path(&path)?;
  ensure_within_root(&root, &source)?;

  let Some(parent) = source.parent() else {
    return Err(AppError::InvalidPath);
  };

  let duplicate_name = duplicate_file_name(&source)?;
  let base_destination = parent.join(duplicate_name);
  let destination = resolve_destination(base_destination, conflict_strategy, source.is_dir())?;

  if source.is_dir() {
    copy_dir_recursive(&source, &destination)?;
  } else {
    if destination.exists() {
      fs::remove_file(&destination)?;
    }
    fs::copy(&source, &destination)?;
  }

  Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn move_entry(
  folder_path: String,
  source_path: String,
  target_dir_path: String,
  conflict_strategy: ConflictStrategy,
) -> Result<String> {
  let root = normalize_existing_dir(&folder_path)?;
  let source = normalize_existing_path(&source_path)?;
  let target_dir = normalize_existing_dir(&target_dir_path)?;

  ensure_within_root(&root, &source)?;
  ensure_within_root(&root, &target_dir)?;

  if source.is_dir() {
    let source_canonical = fs::canonicalize(&source)?;
    let target_canonical = fs::canonicalize(&target_dir)?;

    if target_canonical.starts_with(&source_canonical) {
      return Err(AppError::InvalidOperation(
        "Cannot move a folder into itself.".to_string(),
      ));
    }
  }

  let Some(file_name) = source.file_name() else {
    return Err(AppError::InvalidPath);
  };

  let base_destination = target_dir.join(file_name);

  if source == base_destination {
    return Ok(source.to_string_lossy().to_string());
  }

  let destination = resolve_destination(base_destination, conflict_strategy, source.is_dir())?;

  if destination.exists() && source.is_file() {
    fs::remove_file(&destination)?;
  }

  fs::rename(&source, &destination)?;
  Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn copy_entry(
  folder_path: String,
  source_path: String,
  target_dir_path: String,
  conflict_strategy: ConflictStrategy,
) -> Result<String> {
  let root = normalize_existing_dir(&folder_path)?;
  let source = normalize_existing_path(&source_path)?;
  let target_dir = normalize_existing_dir(&target_dir_path)?;

  ensure_within_root(&root, &source)?;
  ensure_within_root(&root, &target_dir)?;

  if source.is_dir() {
    let source_canonical = fs::canonicalize(&source)?;
    let target_canonical = fs::canonicalize(&target_dir)?;
    if target_canonical.starts_with(&source_canonical) {
      return Err(AppError::InvalidOperation(
        "Cannot copy a folder into itself.".to_string(),
      ));
    }
  }

  let Some(file_name) = source.file_name() else {
    return Err(AppError::InvalidPath);
  };
  let base_destination = target_dir.join(file_name);
  let destination = resolve_destination(base_destination, conflict_strategy, source.is_dir())?;

  if source.is_dir() {
    copy_dir_recursive(&source, &destination)?;
  } else {
    if destination.exists() {
      fs::remove_file(&destination)?;
    }
    fs::copy(&source, &destination)?;
  }

  Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn trash_entry(folder_path: String, path: String) -> Result<String> {
  let root = normalize_existing_dir(&folder_path)?;
  let source = normalize_existing_path(&path)?;
  ensure_within_root(&root, &source)?;

  let root_canonical = fs::canonicalize(&root)?;
  let source_canonical = fs::canonicalize(&source)?;
  if source_canonical == root_canonical {
    return Err(AppError::InvalidOperation(
      "Cannot move the working folder to trash.".to_string(),
    ));
  }

  let trash_dir = root.join(TRASH_DIR_NAME);
  fs::create_dir_all(&trash_dir)?;

  let file_name = source
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or(AppError::InvalidPath)?;

  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|_| AppError::OperationFailed)?
    .as_secs();

  let destination = trash_dir.join(format!("{timestamp}_{file_name}"));
  let final_destination = if destination.exists() {
    next_available_path(&destination)?
  } else {
    destination
  };

  fs::rename(&source, &final_destination)?;
  Ok(final_destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_path_external(path: String) -> Result<()> {
  let pb = normalize_existing_path(&path)?;
  open::that_detached(pb).map_err(|_| AppError::OperationFailed)?;
  Ok(())
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<()> {
  let pb = normalize_existing_path(&path)?;
  let target = if pb.is_dir() {
    pb
  } else {
    pb.parent().ok_or(AppError::InvalidPath)?.to_path_buf()
  };
  open::that_detached(target).map_err(|_| AppError::OperationFailed)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
  };

  use super::{
    copy_entry, create_entry, duplicate_entry, list_children, list_markdown_files, move_entry,
    read_text_file, rename_entry, trash_entry, ConflictStrategy, EntryKind,
  };

  fn make_temp_dir() -> PathBuf {
    let timestamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("clock")
      .as_nanos();
    let dir = std::env::temp_dir().join(format!("meditor-fsops-test-{timestamp}"));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
  }

  #[test]
  fn create_entry_renames_on_conflict() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();

    let first = create_entry(
      root.clone(),
      root.clone(),
      "note.md".to_string(),
      EntryKind::File,
      ConflictStrategy::Rename,
    )
    .expect("create first");

    let second = create_entry(
      root.clone(),
      root.clone(),
      "note.md".to_string(),
      EntryKind::File,
      ConflictStrategy::Rename,
    )
    .expect("create second");

    assert!(first.ends_with("note.md"));
    assert!(second.ends_with("note (1).md"));
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn duplicate_file_creates_copy() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();
    let source = dir.join("doc.md");
    fs::write(&source, "hello").expect("write source");

    let duplicated = duplicate_entry(
      root,
      source.to_string_lossy().to_string(),
      ConflictStrategy::Rename,
    )
    .expect("duplicate");

    let copied_content = read_text_file(dir.to_string_lossy().to_string(), duplicated)
      .expect("read duplicated");
    assert_eq!(copied_content, "hello");
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn move_entry_renames_on_conflict() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();
    let source = dir.join("a.md");
    let destination_dir = dir.join("dest");

    fs::create_dir_all(&destination_dir).expect("create dest");
    fs::write(&source, "a").expect("write source");
    fs::write(destination_dir.join("a.md"), "existing").expect("write existing");

    let moved = move_entry(
      root,
      source.to_string_lossy().to_string(),
      destination_dir.to_string_lossy().to_string(),
      ConflictStrategy::Rename,
    )
    .expect("move");

    assert!(moved.ends_with("a (1).md"));
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn trash_entry_moves_file_to_trash_folder() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();
    let source = dir.join("to-delete.md");
    fs::write(&source, "delete me").expect("write source");

    let trashed = trash_entry(root, source.to_string_lossy().to_string()).expect("trash");

    assert!(trashed.contains(".meditor-trash"));
    assert!(PathBuf::from(trashed).exists());
    assert!(!source.exists());
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn list_tree_excludes_internal_files() {
    let dir = make_temp_dir();
    let root = dir.as_path();
    fs::write(root.join("doc.md"), "x").expect("write md");
    fs::write(root.join("meditor.sqlite"), "legacy db").expect("write legacy db");
    fs::create_dir_all(root.join(".meditor")).expect("internal dir");
    fs::write(root.join(".meditor").join("meditor.sqlite"), "db").expect("write db");
    fs::create_dir_all(root.join(".meditor-trash")).expect("trash dir");

    let tree = list_children(
      root.to_string_lossy().to_string(),
      root.to_string_lossy().to_string(),
    )
    .expect("list tree");
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].name, "doc.md");
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn list_markdown_files_is_recursive() {
    let dir = make_temp_dir();
    let root = dir.as_path();
    let nested = root.join("docs");
    fs::create_dir_all(&nested).expect("mkdir");
    fs::write(root.join("a.md"), "x").expect("write a");
    fs::write(nested.join("b.markdown"), "x").expect("write b");
    fs::write(nested.join("c.txt"), "x").expect("write c");
    fs::create_dir_all(root.join(".meditor")).expect("internal dir");
    fs::write(root.join(".meditor").join("hidden.md"), "x").expect("write hidden");

    let files = list_markdown_files(root.to_string_lossy().to_string()).expect("list markdown");
    assert_eq!(files, vec!["a.md".to_string(), "docs/b.markdown".to_string()]);
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn rename_entry_changes_name() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();
    let source = dir.join("old.md");
    fs::write(&source, "content").expect("write source");

    let renamed = rename_entry(
      root,
      source.to_string_lossy().to_string(),
      "new.md".to_string(),
      ConflictStrategy::Rename,
    )
    .expect("rename");

    assert!(renamed.ends_with("new.md"));
    assert!(!source.exists());
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn rename_entry_rejects_invalid_name_characters() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();
    let source = dir.join("old.md");
    fs::write(&source, "content").expect("write source");

    let result = rename_entry(
      root,
      source.to_string_lossy().to_string(),
      "bad:name.md".to_string(),
      ConflictStrategy::Rename,
    );

    assert!(result.is_err());
    assert!(source.exists());
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn create_entry_rejects_reserved_windows_names() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();

    let result = create_entry(
      root.clone(),
      root,
      "CON".to_string(),
      EntryKind::File,
      ConflictStrategy::Fail,
    );

    assert!(result.is_err());
    fs::remove_dir_all(dir).expect("cleanup");
  }

  #[test]
  fn copy_entry_works_for_files() {
    let dir = make_temp_dir();
    let root = dir.to_string_lossy().to_string();
    let source = dir.join("a.md");
    let target_dir = dir.join("sub");
    fs::create_dir_all(&target_dir).expect("create sub");
    fs::write(&source, "content").expect("write source");

    let copied = copy_entry(
      root.clone(),
      source.to_string_lossy().to_string(),
      target_dir.to_string_lossy().to_string(),
      ConflictStrategy::Fail,
    )
    .expect("copy");

    let text = read_text_file(root, copied).expect("read copied");
    assert_eq!(text, "content");
    fs::remove_dir_all(dir).expect("cleanup");
  }
}
