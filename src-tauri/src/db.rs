//! Database runtime initialization guards.
//!
//! This module centralizes process-wide SQLite runtime setup that must happen
//! before opening database connections.

use std::sync::OnceLock;

use crate::semantic;

/// Initializes SQLite runtime extensions required by the app.
///
/// This function is idempotent and safe to call multiple times.
pub fn init_sqlite_runtime() -> bool {
    static INIT_OK: OnceLock<bool> = OnceLock::new();
    *INIT_OK.get_or_init(semantic::register_sqlite_vec_auto_extension)
}
