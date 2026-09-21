//! File search for the command bar (SPEC-command-bar §5.4): a running Everything first, else the Windows Search
//! index, as chosen by `commandBar.fileSearch`.

pub mod everything;
pub mod windows_search;

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime};

use everything::EverythingError;

use crate::settings::SettingsState;

/// Rows asked from the index; the page shows 4 without a prefix and up to 20 with `f`.
pub const RESULT_LIMIT: u32 = 20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub path: String,
    pub name: String,
    /// Parent folder for the subtitle: "Documents › Reports".
    pub location: String,
    pub folder: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearch {
    pub generation: u64,
    /// Which source answered: "everything", "windows" or "off".
    pub source: &'static str,
    pub hits: Vec<FileHit>,
    /// Shown as a dimmed row instead of results when the source failed.
    pub error: Option<String>,
}

/// Highest generation the page has asked for; older searches skip or drop their work.
#[derive(Default)]
pub struct FileSearchState {
    latest: Arc<AtomicU64>,
}

/// One index query at a time: parallel queries slowed each other past the page's 1.5 s provider timeout.
static WINDOWS_SEARCH_LOCK: Mutex<()> = Mutex::new(());

pub const HOME_LABEL: &str = "Thư mục người dùng";

/// Parent folder of `path` as breadcrumbs, relative to the user's home when it is inside it.
pub fn location(path: &Path, home: &Path) -> String {
    let Some(parent) = path.parent() else {
        return String::new();
    };
    let parts: Vec<String> = match parent.strip_prefix(home) {
        Ok(rest) if rest.as_os_str().is_empty() => return HOME_LABEL.into(),
        Ok(rest) => rest
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect(),
        Err(_) => parent
            .components()
            .filter_map(|c| {
                let s = c.as_os_str().to_string_lossy();
                (s != "\\" && !s.is_empty()).then(|| s.trim_end_matches('\\').to_string())
            })
            .collect(),
    };
    parts.join(" › ")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Everything,
    Windows,
}

/// Sources to try, in order, for a `commandBar.fileSearch` value. `auto` falls back to Windows Search.
pub fn sources_for(mode: &str) -> &'static [Source] {
    match mode {
        "off" => &[],
        "everything" => &[Source::Everything],
        "windows" => &[Source::Windows],
        _ => &[Source::Everything, Source::Windows],
    }
}

/// The source a search would use right now: the first one in `mode`'s order that is available.
pub fn active_source(mode: &str, everything: bool, windows: bool) -> Option<Source> {
    sources_for(mode).iter().copied().find(|s| match s {
        Source::Everything => everything,
        Source::Windows => windows,
    })
}

/// For Settings › Command bar: which file sources answer right now, and which one searches would use.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchStatus {
    pub everything: bool,
    pub windows: bool,
    /// "everything", "windows", or null when nothing would answer (or the mode is "off").
    pub active: Option<&'static str>,
}

#[tauri::command]
pub async fn file_search_status<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, FileSearchState>,
) -> Result<FileSearchStatus, String> {
    let mode = app
        .try_state::<SettingsState>()
        .map(|s| s.get().command_bar.file_search)
        .unwrap_or_default();
    let dll = app
        .path()
        .resolve(
            format!("everything/{}", everything::DLL_NAME),
            BaseDirectory::Resource,
        )
        .map_err(|e| e.to_string())?;
    let everything = run_everything(dll, "winbar-status-probe".into())
        .await
        .is_ok();
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let sql = windows_search::build_sql("winbar-status-probe", &home.to_string_lossy(), 1)
        .ok_or("no probe query")?;
    // Probe with the newest generation so a probe never cancels or is cancelled by typing.
    let windows = run_windows_search(sql, state.latest.clone(), u64::MAX)
        .await
        .is_ok();
    Ok(FileSearchStatus {
        everything,
        windows,
        active: active_source(&mode, everything, windows).map(|s| match s {
            Source::Everything => "everything",
            Source::Windows => "windows",
        }),
    })
}

pub fn hit(path: String, folder: bool, home: &Path) -> FileHit {
    let p = Path::new(&path);
    FileHit {
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone()),
        location: location(p, home),
        folder,
        path,
    }
}

fn superseded(state: &FileSearchState, generation: u64) -> bool {
    state.latest.load(Ordering::SeqCst) > generation
}

#[tauri::command]
pub async fn search_files<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, FileSearchState>,
    query: String,
    generation: u64,
) -> Result<FileSearch, String> {
    state.latest.fetch_max(generation, Ordering::SeqCst);
    let mut response = FileSearch {
        generation,
        source: "off",
        hits: Vec::new(),
        error: None,
    };
    let mode = app
        .try_state::<SettingsState>()
        .map(|s| s.get().command_bar.file_search)
        .unwrap_or_default();
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let explicit = mode == "everything";

    for source in sources_for(&mode) {
        if superseded(&state, generation) {
            return Ok(response);
        }
        match source {
            Source::Everything => {
                let Some(text) = everything::search_text(&query) else {
                    return Ok(response);
                };
                let dll = app
                    .path()
                    .resolve(
                        format!("everything/{}", everything::DLL_NAME),
                        BaseDirectory::Resource,
                    )
                    .map_err(|e| e.to_string())?;
                match run_everything(dll, text).await {
                    Ok(rows) => {
                        response.source = "everything";
                        if !superseded(&state, generation) {
                            response.hits = rows
                                .into_iter()
                                .map(|(p, folder)| hit(p, folder, &home))
                                .collect();
                        }
                        return Ok(response);
                    }
                    Err(e) if !explicit => {
                        if let EverythingError::Unavailable(detail) = &e {
                            eprintln!("winbar file search: Everything unavailable, using Windows Search: {detail}");
                        }
                    }
                    Err(e) => {
                        response.source = "everything";
                        response.error = Some(everything_message(&e).into());
                        return Ok(response);
                    }
                }
            }
            Source::Windows => {
                response.source = "windows";
                let Some(sql) =
                    windows_search::build_sql(&query, &home.to_string_lossy(), RESULT_LIMIT)
                else {
                    return Ok(response);
                };
                match run_windows_search(sql, state.latest.clone(), generation).await {
                    Ok(rows) if !superseded(&state, generation) => {
                        response.hits = rows
                            .into_iter()
                            .map(|(path, kind)| {
                                hit(path, kind.eq_ignore_ascii_case("Directory"), &home)
                            })
                            .collect();
                    }
                    Ok(_) => {}
                    Err(e) => {
                        eprintln!("winbar file search: {e}");
                        response.error =
                            Some("Windows Search không phản hồi (dịch vụ có thể đang tắt)".into());
                    }
                }
                return Ok(response);
            }
        }
    }
    Ok(response)
}

pub fn everything_message(error: &EverythingError) -> &'static str {
    match error {
        EverythingError::NotRunning => "Everything đang không chạy",
        EverythingError::Unavailable(_) => "Không dùng được Everything",
    }
}

#[cfg(windows)]
async fn run_everything(
    dll: std::path::PathBuf,
    text: String,
) -> Result<Vec<(String, bool)>, EverythingError> {
    tauri::async_runtime::spawn_blocking(move || everything::search(&dll, &text, RESULT_LIMIT))
        .await
        .map_err(|e| EverythingError::Unavailable(e.to_string()))?
}

#[cfg(not(windows))]
async fn run_everything(
    _dll: std::path::PathBuf,
    _text: String,
) -> Result<Vec<(String, bool)>, EverythingError> {
    Err(EverythingError::Unavailable("Windows only".into()))
}

/// Waits for the previous query, then skips the work entirely if the user has typed on since.
#[cfg(windows)]
async fn run_windows_search(
    sql: String,
    latest: Arc<AtomicU64>,
    generation: u64,
) -> Result<Vec<(String, String)>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _one_at_a_time = WINDOWS_SEARCH_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if latest.load(Ordering::SeqCst) > generation {
            return Ok(Vec::new());
        }
        windows_search::query(&sql).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
async fn run_windows_search(
    _sql: String,
    _latest: Arc<AtomicU64>,
    _generation: u64,
) -> Result<Vec<(String, String)>, String> {
    Err("Windows only".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn home() -> PathBuf {
        PathBuf::from(r"C:\Users\me")
    }

    #[test]
    fn location_is_relative_to_home() {
        let p = PathBuf::from(r"C:\Users\me\Documents\Reports\final.xlsx");
        assert_eq!(location(&p, &home()), "Documents › Reports");
        assert_eq!(
            location(&PathBuf::from(r"C:\Users\me\notes.txt"), &home()),
            HOME_LABEL
        );
    }

    #[test]
    fn location_outside_home_shows_the_drive() {
        assert_eq!(
            location(&PathBuf::from(r"D:\Projects\app\README.md"), &home()),
            "D: › Projects › app"
        );
    }

    #[test]
    fn hits_carry_name_and_folder_flag() {
        let h = hit(r"C:\Users\me\Downloads\Acme".into(), true, &home());
        assert_eq!(
            h,
            FileHit {
                path: r"C:\Users\me\Downloads\Acme".into(),
                name: "Acme".into(),
                location: "Downloads".into(),
                folder: true,
            }
        );
        assert!(!hit(r"C:\Users\me\a.pdf".into(), false, &home()).folder);
    }

    #[test]
    fn auto_tries_everything_then_windows_search() {
        assert_eq!(sources_for("auto"), &[Source::Everything, Source::Windows]);
        assert_eq!(sources_for("everything"), &[Source::Everything]);
        assert_eq!(sources_for("windows"), &[Source::Windows]);
        assert!(sources_for("off").is_empty());
        assert_eq!(sources_for("anything else"), sources_for("auto"));
    }

    #[test]
    fn explains_everything_failures_in_vietnamese() {
        assert_eq!(
            everything_message(&EverythingError::NotRunning),
            "Everything đang không chạy"
        );
        assert_eq!(
            everything_message(&EverythingError::Unavailable("x".into())),
            "Không dùng được Everything"
        );
    }

    #[test]
    fn active_source_is_the_first_available_in_mode_order() {
        assert_eq!(active_source("auto", true, true), Some(Source::Everything));
        assert_eq!(active_source("auto", false, true), Some(Source::Windows));
        assert_eq!(active_source("auto", false, false), None);
        assert_eq!(active_source("everything", false, true), None);
        assert_eq!(active_source("windows", true, true), Some(Source::Windows));
        assert_eq!(active_source("off", true, true), None);
    }

    #[test]
    fn newer_generations_supersede_older_ones() {
        let state = FileSearchState::default();
        state.latest.fetch_max(5, Ordering::SeqCst);
        state.latest.fetch_max(3, Ordering::SeqCst);
        assert!(superseded(&state, 4));
        assert!(!superseded(&state, 5));
    }
}
