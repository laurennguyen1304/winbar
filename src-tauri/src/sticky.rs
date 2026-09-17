//! Sticky mode (SPEC-notch-shell §15 V4): reserves a full-width strip at the top of the primary monitor with a
//! Windows AppBar, so maximised windows start below the collapsed notch.
//!
//! The frontend knows the notch sizes and sends the strip height through [`notch_sticky`] (`None` = off). The strip
//! is re-registered when the display changes and removed when the app exits. If the process dies, the shell drops
//! the AppBar together with its window.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::window::{MonitorGeometry, NOTCH_LABEL};

/// Physical rectangle (left, top, right, bottom).
pub type Rect = (i32, i32, i32, i32);

/// The strip reserved on `monitor` for a collapsed notch `height` logical px tall.
pub fn reserve_rect(monitor: MonitorGeometry, height: f64) -> Rect {
    let h = (height * monitor.scale).round().max(1.0) as i32;
    (
        monitor.x,
        monitor.y,
        monitor.x + monitor.width as i32,
        monitor.y + h,
    )
}

#[derive(Default)]
pub struct StickyState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Requested strip height in logical px; `None` when sticky is off.
    height: Option<f64>,
    /// Window registered as the AppBar, as a raw handle.
    registered: Option<isize>,
    /// Last strip given to the shell, to skip redundant SETPOS calls (each one re-lays out maximised windows).
    applied: Option<Rect>,
}

/// Turns the reserved strip on (`height` in logical px) or off (`None`).
#[tauri::command]
pub fn notch_sticky<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, StickyState>,
    height: Option<f64>,
) -> Result<(), String> {
    if let Some(h) = height {
        if !h.is_finite() || h <= 0.0 || h > 400.0 {
            return Err(format!("invalid sticky height {h}"));
        }
    }
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.height = height;
    sync(&window, &mut inner, false)
}

/// Re-applies the strip after a display change (resolution, DPI, primary monitor).
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(NOTCH_LABEL) else {
        return;
    };
    if let Ok(mut inner) = app.state::<StickyState>().inner.lock() {
        let _ = sync(&window, &mut inner, true);
    }
}

/// Gives the space back. Safe to call more than once.
pub fn remove<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(mut inner) = app.state::<StickyState>().inner.lock() {
        unregister(&mut inner);
    }
}

fn sync<R: Runtime>(
    window: &WebviewWindow<R>,
    inner: &mut Inner,
    force: bool,
) -> Result<(), String> {
    let Some(height) = inner.height else {
        unregister(inner);
        return Ok(());
    };
    let rect = reserve_rect(crate::window::primary_geometry(window)?, height);
    if !force && inner.applied == Some(rect) {
        return Ok(());
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    if inner.registered != Some(hwnd) {
        unregister(inner);
        native::register(hwnd)?;
        inner.registered = Some(hwnd);
    }
    native::set_top_strip(hwnd, rect)?;
    inner.applied = Some(rect);
    Ok(())
}

fn unregister(inner: &mut Inner) {
    if let Some(hwnd) = inner.registered.take() {
        native::unregister(hwnd);
    }
    inner.applied = None;
}

#[cfg(windows)]
mod native {
    use super::Rect;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::Shell::{
        SHAppBarMessage, ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, APPBARDATA,
    };

    fn data(hwnd: isize) -> APPBARDATA {
        APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: HWND(hwnd as *mut _),
            uEdge: ABE_TOP,
            ..Default::default()
        }
    }

    pub fn register(hwnd: isize) -> Result<(), String> {
        let mut abd = data(hwnd);
        // SAFETY: `abd` is a valid, initialised APPBARDATA for the duration of the call.
        if unsafe { SHAppBarMessage(ABM_NEW, &mut abd) } == 0 {
            return Err("ABM_NEW failed (window already registered?)".into());
        }
        Ok(())
    }

    /// Asks the shell for the strip (it moves it below other top AppBars such as a top taskbar) and reserves it.
    pub fn set_top_strip(hwnd: isize, (left, top, right, bottom): Rect) -> Result<(), String> {
        let height = bottom - top;
        let mut abd = data(hwnd);
        abd.rc = RECT {
            left,
            top,
            right,
            bottom,
        };
        // SAFETY: as above.
        unsafe { SHAppBarMessage(ABM_QUERYPOS, &mut abd) };
        abd.rc.bottom = abd.rc.top + height;
        // SAFETY: as above.
        unsafe { SHAppBarMessage(ABM_SETPOS, &mut abd) };
        Ok(())
    }

    pub fn unregister(hwnd: isize) {
        let mut abd = data(hwnd);
        // SAFETY: as above; removing an unknown window is a no-op for the shell.
        unsafe { SHAppBarMessage(ABM_REMOVE, &mut abd) };
    }
}

#[cfg(not(windows))]
mod native {
    use super::Rect;
    pub fn register(_: isize) -> Result<(), String> {
        Err("sticky mode needs Windows".into())
    }
    pub fn set_top_strip(_: isize, _: Rect) -> Result<(), String> {
        Ok(())
    }
    pub fn unregister(_: isize) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor(x: i32, width: u32, scale: f64) -> MonitorGeometry {
        MonitorGeometry {
            x,
            y: 0,
            width,
            height: 1200,
            scale,
        }
    }

    #[test]
    fn reserves_the_full_width_at_the_notch_height() {
        assert_eq!(reserve_rect(monitor(0, 1920, 1.0), 40.0), (0, 0, 1920, 40));
    }

    #[test]
    fn scales_the_height_with_dpi() {
        assert_eq!(reserve_rect(monitor(0, 2400, 1.25), 40.0), (0, 0, 2400, 50));
        assert_eq!(reserve_rect(monitor(0, 2880, 1.5), 64.0), (0, 0, 2880, 96));
        // Floating pill 36 + gap 8 at 125%.
        assert_eq!(reserve_rect(monitor(0, 2400, 1.25), 44.0).3, 55);
    }

    #[test]
    fn follows_the_primary_monitor_origin() {
        assert_eq!(
            reserve_rect(monitor(-1920, 1920, 1.0), 40.0),
            (-1920, 0, 0, 40)
        );
    }
}
