//! winbar's own actions for the command bar (SPEC-command-bar §2): open the notch (optionally on the Claude tab),
//! hide or show it. Settings and quitting reuse the existing `open_settings` and `quit_app` commands.

use tauri::{AppHandle, Runtime};

use crate::{tray, window};

/// Tabs the notch panel has (`TabId` in src/shell/widget-contract.ts).
pub fn valid_tab(tab: Option<&str>) -> Result<Option<&str>, String> {
    match tab {
        None | Some("core") | Some("claude") => Ok(tab),
        Some(other) => Err(format!("unknown notch tab {other:?}")),
    }
}

#[tauri::command]
pub fn open_notch<R: Runtime>(app: AppHandle<R>, tab: Option<String>) -> Result<(), String> {
    let tab = valid_tab(tab.as_deref())?;
    tray::open_notch(&app, tab)
}

#[tauri::command]
pub fn notch_hidden<R: Runtime>(app: AppHandle<R>) -> bool {
    window::is_hidden(&app)
}

#[tauri::command]
pub fn set_notch_hidden<R: Runtime>(app: AppHandle<R>, hidden: bool) -> Result<(), String> {
    tray::set_notch_hidden(&app, hidden)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_two_notch_tabs_are_accepted() {
        assert_eq!(valid_tab(None), Ok(None));
        assert_eq!(valid_tab(Some("core")), Ok(Some("core")));
        assert_eq!(valid_tab(Some("claude")), Ok(Some("claude")));
        assert!(valid_tab(Some("Claude")).is_err());
        assert!(valid_tab(Some("")).is_err());
    }
}
