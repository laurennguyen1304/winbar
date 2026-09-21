//! Apps for the command bar (SPEC-command-bar §5.4): everything in Start, desktop and Store apps alike, read from
//! the shell's AppsFolder (the same list `Get-StartApps` shows). Listing takes ~0.7 s, so it runs in the background
//! at startup and again when the list is older than 10 minutes; searches always get the current list at once.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::launch;

pub const MAX_AGE: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    /// AppsFolder parsing name: an AUMID ("Microsoft.WindowsTerminal_8wekyb3d8bbwe!App") or a path-like id.
    pub id: String,
    pub name: String,
    /// Executable behind a Start shortcut, for Ctrl+Enter. Store apps have none.
    pub path: Option<String>,
}

/// Drops entries a launcher should not show and keeps the first of any duplicate id.
pub fn clean(entries: Vec<AppEntry>) -> Vec<AppEntry> {
    let mut seen = std::collections::HashSet::new();
    entries
        .into_iter()
        .filter(|e| {
            let name = e.name.trim();
            !name.is_empty()
                && !e.id.is_empty()
                // Web links pinned to Start ("https://…") are not apps.
                && !e.id.to_ascii_lowercase().starts_with("http")
                && !name.to_lowercase().starts_with("uninstall")
        })
        .filter(|e| seen.insert(e.id.clone()))
        .map(|e| AppEntry {
            path: e.path.filter(|p| !p.trim().is_empty()),
            ..e
        })
        .collect()
}

#[derive(Default)]
pub struct AppsState {
    apps: RwLock<Arc<Vec<AppEntry>>>,
    loaded_at: RwLock<Option<Instant>>,
    loading: AtomicBool,
}

impl AppsState {
    pub fn current(&self) -> Arc<Vec<AppEntry>> {
        self.apps.read().map(|a| a.clone()).unwrap_or_default()
    }

    pub fn is_loaded(&self) -> bool {
        self.loaded_at.read().map(|t| t.is_some()).unwrap_or(false)
    }

    fn needs_refresh(&self) -> bool {
        match self.loaded_at.read().ok().and_then(|t| *t) {
            None => true,
            Some(at) => at.elapsed() > MAX_AGE,
        }
    }

    fn store(&self, apps: Vec<AppEntry>) {
        if let Ok(mut a) = self.apps.write() {
            *a = Arc::new(apps);
        }
        if let Ok(mut t) = self.loaded_at.write() {
            *t = Some(Instant::now());
        }
    }

    pub fn find(&self, id: &str) -> Option<AppEntry> {
        self.current().iter().find(|a| a.id == id).cloned()
    }
}

/// Lists apps on a blocking thread and stores them. Only one listing runs at a time.
pub async fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppsState>();
    if state.loading.swap(true, Ordering::SeqCst) {
        return;
    }
    let listed = tauri::async_runtime::spawn_blocking(enumerate).await;
    match listed {
        Ok(Ok(apps)) => {
            let apps = clean(apps);
            super::icons::warm_app_icons(app, apps.clone());
            state.store(apps);
        }
        Ok(Err(e)) => eprintln!("winbar apps: listing failed: {e}"),
        Err(e) => eprintln!("winbar apps: listing task failed: {e}"),
    }
    state.loading.store(false, Ordering::SeqCst);
}

/// Called once at startup so the first search already has the list.
pub fn warm_up<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { refresh(&app).await });
}

/// The app list for the page to rank. Waits for the first listing; later calls return at once and refresh in the
/// background when the list is stale.
#[tauri::command]
pub async fn list_apps<R: Runtime>(app: AppHandle<R>) -> Result<Vec<AppEntry>, String> {
    let state = app.state::<AppsState>();
    let never_loaded = state.loaded_at.read().map(|t| t.is_none()).unwrap_or(true);
    if never_loaded {
        refresh(&app).await;
        // Startup's listing may still be running: wait for it rather than returning an empty list.
        for _ in 0..40 {
            if !state.loading.load(Ordering::SeqCst) {
                break;
            }
            tokio_sleep(Duration::from_millis(50)).await;
        }
    } else if state.needs_refresh() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { refresh(&app).await });
    }
    Ok(state.current().as_ref().clone())
}

async fn tokio_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

/// Starts an app by its AppsFolder id. Only ids from the current list are accepted.
#[tauri::command]
pub fn launch_app<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let entry = app
        .state::<AppsState>()
        .find(&id)
        .ok_or_else(|| format!("unknown app id {id:?}"))?;
    launch::open_shell_target(&format!("shell:AppsFolder\\{}", entry.id))
}

/// Ctrl+Enter: Explorer on the app's install folder with its executable selected.
#[tauri::command]
pub fn reveal_app<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let entry = app
        .state::<AppsState>()
        .find(&id)
        .ok_or_else(|| format!("unknown app id {id:?}"))?;
    let path = entry
        .path
        .ok_or_else(|| format!("{} has no executable path", entry.name))?;
    launch::reveal_path(path)
}

#[cfg(windows)]
fn enumerate() -> windows::core::Result<Vec<AppEntry>> {
    use windows::core::Interface;
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::Storage::EnhancedStorage::PKEY_Link_TargetParsingPath;
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, IShellItem2,
        SHGetKnownFolderItem, KF_FLAG_DEFAULT, SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_NORMALDISPLAY,
    };

    unsafe fn take(p: windows::core::PWSTR) -> String {
        let s = p.to_string().unwrap_or_default();
        CoTaskMemFree(Some(p.0 as _));
        s
    }

    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if hr.is_err() && hr != RPC_E_CHANGED_MODE {
            return Err(hr.into());
        }
        let result = (|| {
            let folder: IShellItem =
                SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)?;
            let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems)?;
            let mut out = Vec::new();
            loop {
                let mut buf = [None];
                let mut fetched = 0u32;
                if items.Next(&mut buf, Some(&mut fetched)).is_err() || fetched == 0 {
                    break;
                }
                let Some(item) = buf[0].take() else { break };
                let name = item
                    .GetDisplayName(SIGDN_NORMALDISPLAY)
                    .map(|p| take(p))
                    .unwrap_or_default();
                let id = item
                    .GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING)
                    .map(|p| take(p))
                    .unwrap_or_default();
                let path = item
                    .cast::<IShellItem2>()
                    .ok()
                    .and_then(|i| i.GetString(&PKEY_Link_TargetParsingPath).ok())
                    .map(|p| take(p));
                out.push(AppEntry { id, name, path });
            }
            Ok(out)
        })();
        if hr.is_ok() {
            CoUninitialize();
        }
        result
    }
}

#[cfg(not(windows))]
fn enumerate() -> Result<Vec<AppEntry>, String> {
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, name: &str, path: Option<&str>) -> AppEntry {
        AppEntry {
            id: id.into(),
            name: name.into(),
            path: path.map(Into::into),
        }
    }

    #[test]
    fn keeps_real_apps_and_drops_links_uninstallers_blanks_and_duplicates() {
        let apps = clean(vec![
            entry(
                "Microsoft.VisualStudioCode",
                "Visual Studio Code",
                Some(r"C:\Code.exe"),
            ),
            entry(
                "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App",
                "Terminal",
                None,
            ),
            entry("https://www.office.com/", "Office on the web", None),
            entry("{7C5A40EF}\\App\\unins000.exe", "Uninstall App", None),
            entry("Blank", "  ", None),
            entry("", "No id", None),
            entry(
                "Microsoft.VisualStudioCode",
                "Visual Studio Code (duplicate)",
                None,
            ),
            entry("Chrome", "Google Chrome", Some("  ")),
        ]);
        assert_eq!(
            apps,
            vec![
                entry(
                    "Microsoft.VisualStudioCode",
                    "Visual Studio Code",
                    Some(r"C:\Code.exe")
                ),
                entry(
                    "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App",
                    "Terminal",
                    None
                ),
                entry("Chrome", "Google Chrome", None),
            ]
        );
    }

    #[test]
    fn a_new_state_needs_listing_and_finds_nothing() {
        let state = AppsState::default();
        assert!(state.needs_refresh());
        assert_eq!(state.find("Chrome"), None);
        state.store(vec![entry("Chrome", "Google Chrome", None)]);
        assert!(!state.needs_refresh());
        assert_eq!(
            state.find("Chrome").map(|a| a.name),
            Some("Google Chrome".into())
        );
        assert_eq!(state.find("chrome"), None, "ids are matched exactly");
    }

    #[cfg(windows)]
    #[test]
    fn lists_the_start_menu_of_this_machine() {
        let apps = clean(enumerate().expect("AppsFolder"));
        assert!(apps.len() > 20, "only {} apps", apps.len());
        assert!(apps.iter().any(|a| a.path.is_some()));
    }
}
