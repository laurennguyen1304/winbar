//! Update notice (SPEC-update): once a week at most, read the version on the public `main` and say on the pill when
//! it is newer than this build.
//!
//! The only request is a GET for one fixed file. Only its `version` field is read, and the page it leads to is a
//! constant: nothing in the answer is ever opened, run or shown beyond three numbers.

mod model;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use model::Version;

/// Fired when the weekly check finds a version worth announcing. The payload is that version, e.g. "0.2.0".
pub const UPDATE_AVAILABLE: &str = "update-available";

const HOST: &str = "raw.githubusercontent.com";
const PATH: &str = "/laurennguyen1304/winbar/main/src-tauri/tauri.conf.json";
/// Where "Xem" leads. A constant on purpose: the answer from GitHub never picks a URL.
const CHANGELOG_URL: &str = "https://github.com/laurennguyen1304/winbar/blob/main/CHANGELOG.md";

/// Leave the first minute after start to whatever else is opening with the machine.
const FIRST_LOOK: Duration = Duration::from_secs(60);
/// How often the thread wakes to compare the saved mark with the clock. Only a due check touches the network;
/// waking this often just means a machine that slept through the week catches up within the hour.
const LOOK_EVERY: Duration = Duration::from_secs(60 * 60);

/// What the check remembers between runs (SPEC-update §7). Kept out of the settings file so writing the mark does
/// not look like a settings change to the Settings window.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Saved {
    /// Epoch ms of the last successful check; 0 when there has never been one.
    last_checked_at: u64,
    /// The version seen then.
    latest_known: String,
    /// The highest version the user has already seen on the pill.
    dismissed_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// The running build, e.g. "0.2.0".
    current: String,
    /// A newer version on GitHub, when one is known.
    #[serde(skip_serializing_if = "Option::is_none")]
    latest: Option<String>,
    /// The version the pill should announce: newer, and not dismissed yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pending: Option<String>,
    checked_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

pub struct UpdateState {
    path: PathBuf,
    current: Version,
    saved: Mutex<Saved>,
}

impl UpdateState {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        let path = app.path().config_dir()?.join("winbar").join("update.json");
        let saved = read_saved(&path);
        Ok(UpdateState {
            path,
            current: current_version(),
            saved: Mutex::new(saved),
        })
    }

    fn status(&self, error: Option<&'static str>) -> UpdateStatus {
        let saved = self.saved.lock().map(|s| s.clone()).unwrap_or_default();
        let latest = model::parse_version(&saved.latest_known).filter(|v| *v > self.current);
        let pending = model::to_announce(
            self.current,
            latest,
            model::parse_version(&saved.dismissed_version),
        );
        UpdateStatus {
            current: model::format(self.current),
            latest: latest.map(model::format),
            pending: pending.map(model::format),
            checked_at: saved.last_checked_at,
            error,
        }
    }

    /// Asks GitHub now. On success the mark moves and the answer is saved; on failure nothing changes, so the next
    /// look tries again.
    fn check(&self) -> Result<(), ()> {
        let body = crate::http::get(HOST, PATH, &[]).map_err(|_| {
            eprintln!("update check: network error");
        })?;
        let Some(latest) = model::version_from_config(&body) else {
            eprintln!("update check: no version in the answer");
            return Err(());
        };
        let Ok(mut saved) = self.saved.lock() else {
            return Err(());
        };
        saved.last_checked_at = now_ms();
        saved.latest_known = model::format(latest);
        write_saved(&self.path, &saved);
        Ok(())
    }

    fn dismiss(&self, version: Version) {
        let Ok(mut saved) = self.saved.lock() else {
            return;
        };
        if model::parse_version(&saved.dismissed_version).is_some_and(|d| d >= version) {
            return;
        }
        saved.dismissed_version = model::format(version);
        write_saved(&self.path, &saved);
    }
}

/// This build's version. `Cargo.toml`, `tauri.conf.json` and `package.json` carry the same number (a test says so).
fn current_version() -> Version {
    model::parse_version(env!("CARGO_PKG_VERSION")).unwrap_or((0, 0, 0))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// A missing or broken file reads as "never checked": the worst case is one early request.
fn read_saved(path: &Path) -> Saved {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default()
}

fn write_saved(path: &Path, saved: &Saved) {
    let Ok(json) = serde_json::to_string(saved) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, json).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

fn check_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<crate::settings::SettingsState>()
        .map(|s| s.get().update.check)
        .unwrap_or(true)
}

/// What is known already, without asking the network. The notch calls this on load to bring back a notice the
/// user has not answered yet.
#[tauri::command]
pub fn update_status(state: tauri::State<'_, UpdateState>) -> UpdateStatus {
    state.status(None)
}

/// "Kiểm tra ngay": asks now, whatever the switch says — pressing the button is the permission. A newer version is
/// put back on the pill even if it was dismissed before, because the user just asked.
#[tauri::command]
pub fn update_check<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, UpdateState>,
) -> UpdateStatus {
    if state.check().is_err() {
        return state.status(Some("network"));
    }
    let status = state.status(None);
    if let Some(latest) = &status.latest {
        let _ = app.emit(UPDATE_AVAILABLE, latest.clone());
    }
    status
}

#[tauri::command]
pub fn update_dismiss(state: tauri::State<'_, UpdateState>, version: String) {
    if let Some(version) = model::parse_version(&version) {
        state.dismiss(version);
    }
}

#[tauri::command]
pub fn update_open_changelog() -> Result<(), String> {
    crate::command_bar::launch::open_url(CHANGELOG_URL.to_string())
}

/// The weekly check. Wakes every hour but only compares two numbers unless a week has passed and the switch is on.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("update".into())
        .spawn(move || {
            std::thread::sleep(FIRST_LOOK);
            loop {
                if let Some(state) = app.try_state::<UpdateState>() {
                    let last = state.saved.lock().map(|s| s.last_checked_at).unwrap_or(0);
                    if check_enabled(&app) && model::is_due(last, now_ms()) && state.check().is_ok()
                    {
                        if let Some(pending) = state.status(None).pending {
                            let _ = app.emit(UPDATE_AVAILABLE, pending);
                        }
                    }
                }
                std::thread::sleep(LOOK_EVERY);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state_with(name: &str, saved: Saved, current: Version) -> UpdateState {
        let path = std::env::temp_dir()
            .join(format!("winbar-update-{name}-{}", std::process::id()))
            .join("update.json");
        UpdateState {
            path,
            current,
            saved: Mutex::new(saved),
        }
    }

    /// The one real request, end to end. Ignored by default so `cargo test` never needs the network:
    /// `cargo test --manifest-path src-tauri/Cargo.toml -- --ignored reads_the_real_file`.
    #[test]
    #[ignore]
    fn reads_the_real_file_on_github() {
        let body = crate::http::get(HOST, PATH, &[]).expect("GitHub answers");
        let version = model::version_from_config(&body).expect("has a version");
        println!("version on main: {}", model::format(version));
    }

    #[test]
    fn the_three_version_numbers_agree() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let read = |p: &Path| -> serde_json::Value {
            serde_json::from_str(&std::fs::read_to_string(p).expect("reads")).expect("parses")
        };
        let tauri = read(&root.join("tauri.conf.json"));
        let package = read(&root.join("..").join("package.json"));
        assert_eq!(
            tauri["version"],
            env!("CARGO_PKG_VERSION"),
            "tauri.conf.json vs Cargo.toml"
        );
        assert_eq!(
            package["version"],
            env!("CARGO_PKG_VERSION"),
            "package.json vs Cargo.toml"
        );
        assert!(model::parse_version(env!("CARGO_PKG_VERSION")).is_some());
    }

    #[test]
    fn a_newer_version_is_pending_until_dismissed() {
        let saved = Saved {
            last_checked_at: 1,
            latest_known: "0.3.0".into(),
            dismissed_version: String::new(),
        };
        let state = state_with("pending", saved, (0, 2, 0));
        let status = state.status(None);
        assert_eq!(status.current, "0.2.0");
        assert_eq!(status.latest.as_deref(), Some("0.3.0"));
        assert_eq!(status.pending.as_deref(), Some("0.3.0"));

        state.dismiss((0, 3, 0));
        let status = state.status(None);
        assert_eq!(
            status.latest.as_deref(),
            Some("0.3.0"),
            "still newer, just not announced"
        );
        assert_eq!(status.pending, None);
        let _ = std::fs::remove_dir_all(state.path.parent().expect("has a folder"));
    }

    #[test]
    fn dismissing_an_older_version_does_not_undo_a_newer_dismissal() {
        let saved = Saved {
            dismissed_version: "0.4.0".into(),
            ..Saved::default()
        };
        let state = state_with("older", saved, (0, 2, 0));
        state.dismiss((0, 3, 0));
        assert_eq!(state.saved.lock().expect("lock").dismissed_version, "0.4.0");
    }

    #[test]
    fn a_version_already_running_is_not_latest() {
        let saved = Saved {
            latest_known: "0.2.0".into(),
            ..Saved::default()
        };
        let status = state_with("running", saved, (0, 2, 0)).status(None);
        assert_eq!((status.latest, status.pending), (None, None));
    }

    #[test]
    fn a_broken_or_missing_file_reads_as_never_checked() {
        let dir = std::env::temp_dir().join(format!("winbar-update-read-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("update.json");
        assert_eq!(read_saved(&path), Saved::default());
        std::fs::write(&path, "{ not json").expect("writes");
        assert_eq!(read_saved(&path), Saved::default());

        let saved = Saved {
            last_checked_at: 42,
            latest_known: "0.3.0".into(),
            dismissed_version: "0.2.0".into(),
        };
        write_saved(&path, &saved);
        assert_eq!(read_saved(&path), saved);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
