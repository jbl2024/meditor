use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use notify::{
    event::{EventKind, ModifyKind, RenameMode},
    RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::{AppError, Result};

const INTERNAL_DIR_NAME: &str = ".meditor";
const TRASH_DIR_NAME: &str = ".meditor-trash";
const DB_FILE_NAME: &str = "meditor.sqlite";
const FS_EVENT_NAME: &str = "workspace://fs-changed";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkspaceFsChangeKind {
    Created,
    Removed,
    Renamed,
    Modified,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct WorkspaceFsChange {
    pub kind: WorkspaceFsChangeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_dir: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct WorkspaceFsChangedPayload {
    pub session_id: u64,
    pub root: String,
    pub changes: Vec<WorkspaceFsChange>,
    pub ts_ms: u64,
}

#[derive(Debug)]
struct WorkspaceWatcherState {
    session_id: u64,
    root: Option<PathBuf>,
    watcher: Option<RecommendedWatcher>,
}

impl Default for WorkspaceWatcherState {
    fn default() -> Self {
        Self {
            session_id: 0,
            root: None,
            watcher: None,
        }
    }
}

fn watcher_state() -> &'static Mutex<WorkspaceWatcherState> {
    static WATCHER_STATE: OnceLock<Mutex<WorkspaceWatcherState>> = OnceLock::new();
    WATCHER_STATE.get_or_init(|| Mutex::new(WorkspaceWatcherState::default()))
}

fn normalize_slashes(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn root_contains_path(root: &str, path: &str) -> bool {
    path == root || path.starts_with(&format!("{root}/"))
}

fn path_parent(path: &str) -> Option<String> {
    path.rsplit_once('/').map(|(parent, _)| parent.to_string())
}

fn skip_file_name(file_name: &str) -> bool {
    file_name == DB_FILE_NAME || file_name.starts_with("meditor.sqlite-")
}

fn should_skip_path(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    if skip_file_name(file_name) {
        return true;
    }

    path.components().any(|component| {
        let part = component.as_os_str().to_string_lossy();
        part == INTERNAL_DIR_NAME || part == TRASH_DIR_NAME
    })
}

fn normalize_event_path(raw: &Path, root_path: &Path, root_normalized: &str) -> Option<String> {
    let candidate = if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        root_path.join(raw)
    };

    let normalized = normalize_slashes(&candidate);
    if !root_contains_path(root_normalized, &normalized) {
        return None;
    }
    Some(normalized)
}

fn maybe_is_dir(path: &Path) -> Option<bool> {
    if let Ok(meta) = fs::metadata(path) {
        return Some(meta.is_dir());
    }

    if path.extension().is_none() {
        Some(true)
    } else {
        None
    }
}

fn build_payload(
    session_id: u64,
    root_normalized: &str,
    changes: Vec<WorkspaceFsChange>,
) -> WorkspaceFsChangedPayload {
    let ts_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0);

    WorkspaceFsChangedPayload {
        session_id,
        root: root_normalized.to_string(),
        changes,
        ts_ms,
    }
}

fn emit_changes(
    app_handle: &AppHandle,
    session_id: u64,
    root_normalized: &str,
    changes: Vec<WorkspaceFsChange>,
) {
    if changes.is_empty() {
        return;
    }

    let payload = build_payload(session_id, root_normalized, changes);
    let _ = app_handle.emit(FS_EVENT_NAME, payload);
}

fn handle_notify_event(
    app_handle: &AppHandle,
    session_id: u64,
    root_path: &Path,
    root_normalized: &str,
    event: notify::Event,
) {
    let mut changes: Vec<WorkspaceFsChange> = Vec::new();

    match event.kind {
        EventKind::Create(_) => {
            for path in event.paths {
                if should_skip_path(&path) {
                    continue;
                }
                let Some(normalized) = normalize_event_path(&path, root_path, root_normalized)
                else {
                    continue;
                };
                changes.push(WorkspaceFsChange {
                    kind: WorkspaceFsChangeKind::Created,
                    parent: path_parent(&normalized),
                    path: Some(normalized),
                    old_path: None,
                    new_path: None,
                    old_parent: None,
                    new_parent: None,
                    is_dir: maybe_is_dir(&path),
                });
            }
        }
        EventKind::Remove(_) => {
            for path in event.paths {
                if should_skip_path(&path) {
                    continue;
                }
                let Some(normalized) = normalize_event_path(&path, root_path, root_normalized)
                else {
                    continue;
                };
                changes.push(WorkspaceFsChange {
                    kind: WorkspaceFsChangeKind::Removed,
                    parent: path_parent(&normalized),
                    path: Some(normalized),
                    old_path: None,
                    new_path: None,
                    old_parent: None,
                    new_parent: None,
                    is_dir: maybe_is_dir(&path),
                });
            }
        }
        EventKind::Modify(ModifyKind::Name(rename_mode)) => match rename_mode {
            RenameMode::Both if event.paths.len() >= 2 => {
                let old_raw = &event.paths[0];
                let new_raw = &event.paths[1];
                if should_skip_path(old_raw) || should_skip_path(new_raw) {
                    return;
                }

                let Some(old_path) = normalize_event_path(old_raw, root_path, root_normalized)
                else {
                    return;
                };
                let Some(new_path) = normalize_event_path(new_raw, root_path, root_normalized)
                else {
                    return;
                };

                changes.push(WorkspaceFsChange {
                    kind: WorkspaceFsChangeKind::Renamed,
                    old_parent: path_parent(&old_path),
                    new_parent: path_parent(&new_path),
                    old_path: Some(old_path),
                    new_path: Some(new_path),
                    path: None,
                    parent: None,
                    is_dir: maybe_is_dir(new_raw).or_else(|| maybe_is_dir(old_raw)),
                });
            }
            RenameMode::From => {
                for path in event.paths {
                    if should_skip_path(&path) {
                        continue;
                    }
                    let Some(normalized) = normalize_event_path(&path, root_path, root_normalized)
                    else {
                        continue;
                    };
                    changes.push(WorkspaceFsChange {
                        kind: WorkspaceFsChangeKind::Removed,
                        parent: path_parent(&normalized),
                        path: Some(normalized),
                        old_path: None,
                        new_path: None,
                        old_parent: None,
                        new_parent: None,
                        is_dir: maybe_is_dir(&path),
                    });
                }
            }
            RenameMode::To => {
                for path in event.paths {
                    if should_skip_path(&path) {
                        continue;
                    }
                    let Some(normalized) = normalize_event_path(&path, root_path, root_normalized)
                    else {
                        continue;
                    };
                    changes.push(WorkspaceFsChange {
                        kind: WorkspaceFsChangeKind::Created,
                        parent: path_parent(&normalized),
                        path: Some(normalized),
                        old_path: None,
                        new_path: None,
                        old_parent: None,
                        new_parent: None,
                        is_dir: maybe_is_dir(&path),
                    });
                }
            }
            _ => {}
        },
        EventKind::Modify(_) => {
            for path in event.paths {
                if should_skip_path(&path) {
                    continue;
                }
                let Some(normalized) = normalize_event_path(&path, root_path, root_normalized)
                else {
                    continue;
                };
                changes.push(WorkspaceFsChange {
                    kind: WorkspaceFsChangeKind::Modified,
                    parent: path_parent(&normalized),
                    path: Some(normalized),
                    old_path: None,
                    new_path: None,
                    old_parent: None,
                    new_parent: None,
                    is_dir: maybe_is_dir(&path),
                });
            }
        }
        _ => {}
    }

    emit_changes(app_handle, session_id, root_normalized, changes);
}

pub(crate) fn start_workspace_watcher(app_handle: AppHandle, root_path: PathBuf) -> Result<()> {
    let root_canonical = fs::canonicalize(&root_path)?;
    let root_normalized = normalize_slashes(&root_canonical);

    let mut state = watcher_state()
        .lock()
        .map_err(|_| AppError::OperationFailed)?;

    state.watcher = None;
    state.session_id = state.session_id.saturating_add(1);
    state.root = Some(root_canonical.clone());
    let session_id = state.session_id;

    let callback_app_handle = app_handle.clone();
    let callback_root = root_canonical.clone();
    let callback_root_normalized = root_normalized.clone();

    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };

        handle_notify_event(
            &callback_app_handle,
            session_id,
            &callback_root,
            &callback_root_normalized,
            event,
        );
    })
    .map_err(|err| {
        AppError::InvalidOperation(format!("Could not start workspace watcher: {err}"))
    })?;

    watcher
        .watch(&root_canonical, RecursiveMode::Recursive)
        .map_err(|err| AppError::InvalidOperation(format!("Could not watch workspace: {err}")))?;

    state.watcher = Some(watcher);
    Ok(())
}

pub(crate) fn stop_workspace_watcher() -> Result<()> {
    let mut state = watcher_state()
        .lock()
        .map_err(|_| AppError::OperationFailed)?;
    state.watcher = None;
    state.root = None;
    Ok(())
}
