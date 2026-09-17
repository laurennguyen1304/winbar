//! File search for the command bar (SPEC-command-bar §5.4). Task 10: Windows Search; Task 11 adds Everything.

pub mod windows_search;

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

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
    /// "windows" or "off".
    pub source: &'static str,
    pub hits: Vec<FileHit>,
    /// Shown as a dimmed row instead of results when the source failed.
    pub error: Option<String>,
}

/// Highest generation the page has asked for; older searches skip or drop their work.
#[derive(Default)]
pub struct FileSearchState {
    latest: AtomicU64,
}

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

pub fn hit(path: String, item_type: &str, home: &Path) -> FileHit {
    let p = Path::new(&path);
    FileHit {
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone()),
        location: location(p, home),
        folder: item_type.eq_ignore_ascii_case("Directory"),
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
        source: "windows",
        hits: Vec::new(),
        error: None,
    };
    let mode = app
        .try_state::<SettingsState>()
        .map(|s| s.get().command_bar.file_search)
        .unwrap_or_default();
    if mode == "off" {
        response.source = "off";
        return Ok(response);
    }
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let Some(sql) = windows_search::build_sql(&query, &home.to_string_lossy(), RESULT_LIMIT) else {
        return Ok(response);
    };
    if superseded(&state, generation) {
        return Ok(response);
    }

    #[cfg(windows)]
    let rows = tauri::async_runtime::spawn_blocking(move || windows_search::query(&sql))
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    let rows: Result<Vec<(String, String)>, String> = Err(format!("no Windows Search for {sql}"));

    match rows {
        Ok(rows) if !superseded(&state, generation) => {
            response.hits = rows
                .into_iter()
                .map(|(path, kind)| hit(path, &kind, &home))
                .collect();
        }
        Ok(_) => {}
        Err(e) => {
            eprintln!("winbar file search: {e}");
            response.error = Some("Windows Search không phản hồi (dịch vụ có thể đang tắt)".into());
        }
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn home() -> PathBuf {
        PathBuf::from(r"C:\Users\Lenovo")
    }

    #[test]
    fn location_is_relative_to_home() {
        let p = PathBuf::from(r"C:\Users\Lenovo\Documents\Reports\final.xlsx");
        assert_eq!(location(&p, &home()), "Documents › Reports");
        assert_eq!(
            location(&PathBuf::from(r"C:\Users\Lenovo\notes.txt"), &home()),
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
        let h = hit(
            r"C:\Users\Lenovo\Downloads\Qikify".into(),
            "Directory",
            &home(),
        );
        assert_eq!(
            h,
            FileHit {
                path: r"C:\Users\Lenovo\Downloads\Qikify".into(),
                name: "Qikify".into(),
                location: "Downloads".into(),
                folder: true,
            }
        );
        assert!(!hit(r"C:\Users\Lenovo\a.pdf".into(), ".pdf", &home()).folder);
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
