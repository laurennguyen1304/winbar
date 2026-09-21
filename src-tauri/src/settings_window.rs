//! The Settings window (a normal, decorated window) and quitting the app.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_LABEL: &str = "settings";

/// Opens the Settings window, or brings the existing one to the front: there is only ever one.
// async: creating a window from a synchronous command can deadlock on Windows.
#[tauri::command]
pub async fn open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.unminimize();
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        SETTINGS_LABEL,
        WebviewUrl::App("settings.html".into()),
    )
    .title("Cài đặt winbar")
    .inner_size(1000.0, 680.0)
    .min_inner_size(760.0, 520.0)
    .center()
    .focused(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Closes every window and exits the process.
#[tauri::command]
pub fn quit_app<R: Runtime>(app: AppHandle<R>) {
    crate::hotkeys::release(&app);
    app.exit(0);
}
