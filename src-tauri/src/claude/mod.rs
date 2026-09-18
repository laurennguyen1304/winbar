//! Claude layout (SPEC-claude): which sessions are alive and how much of the limit is left.
//!
//! **Read-only.** Nothing here writes to `~/.claude`, installs a hook, or holds up a session. The data is files the
//! machine already has plus one read-only endpoint.
//!
//! Log lines carry counts and error kinds only — never a path, a session title, or a token (SPEC §9).

mod http;
mod icons;
mod model;
mod sessions;
mod usage;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, Runtime};

pub use model::Session;
pub use usage::Usage;

/// The live list changed: a session started, ended, or moved to another phase.
pub const SESSIONS_CHANGED: &str = "claude-sessions-changed";

/// How often the watcher looks at the directory.
const WATCH_INTERVAL: Duration = Duration::from_secs(1);

/// Name, size and modified time of every state file — enough to notice a change without opening any of them.
///
/// The directory's own timestamp is not enough: a session changing phase rewrites its file in place, which leaves
/// the parent directory untouched. That is the change that matters most, since it is what the pill shows.
fn fingerprint(dir: &std::path::Path) -> Vec<(std::ffi::OsString, u64, u128)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<_> = entries
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                // Milliseconds, not seconds: a phase change rewrites the same file to the same length, and two
                // writes inside one second would otherwise look identical.
                .map_or(0, |d| d.as_millis());
            Some((entry.file_name(), meta.len(), modified))
        })
        .collect();
    out.sort();
    out
}

pub struct ClaudeState {
    home: PathBuf,
    appdata: PathBuf,
    /// Last list handed out, so the watcher can tell a real change from a touched file.
    last: Mutex<Vec<Session>>,
}

impl ClaudeState {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        Ok(ClaudeState {
            home: app.path().home_dir()?,
            appdata: app.path().config_dir()?,
            last: Mutex::new(Vec::new()),
        })
    }

    fn read(&self, with_history: bool) -> Vec<Session> {
        sessions::collect(&self.home, &self.appdata, now_ms(), with_history)
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The Claude settings, or the defaults if they cannot be read.
fn options<R: Runtime>(app: &AppHandle<R>) -> crate::settings::ClaudeSettings {
    app.try_state::<crate::settings::SettingsState>()
        .map(|s| s.get().claude)
        .unwrap_or_else(|| crate::settings::Settings::default().claude)
}

/// Extra status images Lauren added, per phase, as data URLs. The three bundled with the app live in the page.
#[tauri::command]
pub fn claude_icons(
    state: tauri::State<'_, ClaudeState>,
) -> std::collections::BTreeMap<String, Vec<String>> {
    icons::read(&state.appdata)
}

/// How much of the limit is left. Uses a recent answer unless `force` asks for a fresh one.
///
/// With the layout turned off this touches nothing: no credentials file is opened and no request goes out.
#[tauri::command]
pub fn claude_usage<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClaudeState>,
    force: Option<bool>,
) -> Usage {
    if !options(&app).enabled {
        return Usage::default();
    }
    usage::fetch(
        &state.home,
        &state.appdata,
        now_ms(),
        force.unwrap_or(false),
    )
}

/// Sessions to show: live ones in order, then recent Desktop history.
#[tauri::command]
pub fn claude_sessions<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClaudeState>,
) -> Result<Vec<Session>, String> {
    let settings = options(&app);
    if !settings.enabled {
        return Ok(Vec::new());
    }
    let list = state.read(settings.show_desktop_sessions);
    if let Ok(mut last) = state.last.lock() {
        *last = list.clone();
    }
    Ok(list)
}

/// Watches the status directory and pushes a change to the page, so the frontend never polls.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("claude-sessions".into())
        .spawn(move || {
            let mut last_stamp: Vec<(std::ffi::OsString, u64, u128)> = Vec::new();
            loop {
                std::thread::sleep(WATCH_INTERVAL);
                let Some(state) = app.try_state::<ClaudeState>() else {
                    continue;
                };
                let settings = options(&app);
                if !settings.enabled {
                    // Layout off: read nothing at all, not even a directory listing.
                    continue;
                }
                // A handful of directory entries, read without opening a file.
                let stamp = fingerprint(&sessions::statusbar_dir(&state.home));
                if stamp == last_stamp {
                    continue;
                }
                last_stamp = stamp;
                let next = state.read(settings.show_desktop_sessions);
                let changed = state.last.lock().map(|last| *last != next).unwrap_or(true);
                if changed {
                    if let Ok(mut last) = state.last.lock() {
                        *last = next;
                    }
                    let _ = app.emit(SESSIONS_CHANGED, ());
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn the_fingerprint_notices_a_file_rewritten_in_place() {
        // This is the whole point of not using the directory's own timestamp: changing a session's phase rewrites
        // its file, which leaves the parent directory untouched.
        let dir = std::env::temp_dir().join("winbar-claude-fingerprint");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates");
        let file = dir.join("a.json");

        fs::write(&file, r#"{"state":"idle"}"#).expect("writes");
        let before = fingerprint(&dir);
        let dir_stamp = fs::metadata(&dir).and_then(|m| m.modified()).ok();

        std::thread::sleep(Duration::from_millis(20));
        fs::write(&file, r#"{"state":"tool"}"#).expect("writes");
        let after = fingerprint(&dir);

        assert_ne!(before, after, "a rewrite must show up");
        assert_eq!(
            dir_stamp,
            fs::metadata(&dir).and_then(|m| m.modified()).ok(),
            "…and the directory's own timestamp does not move, which is why it cannot be used"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_fingerprint_notices_a_session_ending() {
        let dir = std::env::temp_dir().join("winbar-claude-fingerprint-gone");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates");
        fs::write(dir.join("a.json"), "{}").expect("writes");
        let before = fingerprint(&dir);
        fs::remove_file(dir.join("a.json")).expect("removes");
        assert_ne!(before, fingerprint(&dir));
        let _ = fs::remove_dir_all(&dir);
    }
}
