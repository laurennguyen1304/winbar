//! The Settings window (a normal, decorated window) and quitting the app.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_LABEL: &str = "settings";

/// Logical px the window opens at when the screen has room for it.
const PREFERRED: (f64, f64) = (1000.0, 680.0);
/// Logical px below which the page stops being usable; smaller still if the screen itself is smaller.
const MINIMUM: (f64, f64) = (640.0, 480.0);
/// Title bar and borders Windows adds around the inner size, plus some air to the screen edges.
const CHROME: (f64, f64) = (48.0, 72.0);

/// Inner size and minimum inner size (logical px) that fit a work area of `width` x `height` physical px.
///
/// A fixed 1000 x 680 ran off the bottom of a 1920 x 1080 laptop at 150% (1280 x 672 logical once the taskbar is
/// taken off), hiding the lower part of the page and the window's own edge (the owner, 22/09).
pub fn fit_size(width: u32, height: u32, scale: f64) -> ((f64, f64), (f64, f64)) {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let room_w = (f64::from(width) / scale - CHROME.0).max(0.0);
    let room_h = (f64::from(height) / scale - CHROME.1).max(0.0);
    let size = (PREFERRED.0.min(room_w).floor(), PREFERRED.1.min(room_h).floor());
    let min = (MINIMUM.0.min(size.0), MINIMUM.1.min(size.1));
    (size, min)
}

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
    // `center()` puts the window on the primary screen, so that is the one it has to fit.
    let (size, min) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let area = m.work_area();
            fit_size(area.size.width, area.size.height, m.scale_factor())
        })
        .unwrap_or((PREFERRED, MINIMUM));
    WebviewWindowBuilder::new(
        &app,
        SETTINGS_LABEL,
        WebviewUrl::App("settings.html".into()),
    )
    .title("Cài đặt winbar")
    .inner_size(size.0, size.1)
    .min_inner_size(min.0, min.1)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_at_full_size_when_the_screen_has_room() {
        assert_eq!(fit_size(1920, 1032, 1.0), ((1000.0, 680.0), (640.0, 480.0)));
    }

    #[test]
    fn shrinks_to_a_laptop_at_150_percent() {
        // 1920 x 1080 at 150%, taskbar 48 logical: 1280 x 672 logical of work area.
        let ((w, h), (min_w, min_h)) = fit_size(1920, 1008, 1.5);
        assert_eq!(w, 1000.0);
        assert_eq!(h, 600.0);
        assert!(h + CHROME.1 <= 672.0);
        assert_eq!((min_w, min_h), (640.0, 480.0));
    }

    #[test]
    fn never_asks_for_more_than_a_tiny_screen_holds() {
        // 1366 x 768 at 150%: 910 x 480 logical of work area.
        let ((w, h), (min_w, min_h)) = fit_size(1366, 720, 1.5);
        assert!(w + CHROME.0 <= 911.0 && h + CHROME.1 <= 480.0);
        assert!(min_w <= w && min_h <= h);
    }

    #[test]
    fn a_bad_scale_factor_is_read_as_100_percent() {
        assert_eq!(fit_size(1920, 1032, 0.0), fit_size(1920, 1032, 1.0));
    }
}
