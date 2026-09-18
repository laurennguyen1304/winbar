//! Sticky mode (SPEC-notch-shell §15 V4): reserves a full-width strip at the top of the primary monitor with a
//! Windows AppBar, so maximised windows start below the collapsed notch. The notch sits in that strip: below other
//! top AppBars such as YASB, and put back after each change because Windows moves it below a new strip.
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
    /// Last strip asked for, to skip redundant SETPOS calls (each one re-lays out maximised windows).
    applied: Option<Rect>,
    /// Top edge of the strip the shell granted (physical px); the notch is placed here.
    top: Option<i32>,
}

/// Keeps the notch window at `pos` (physical top-left) while sticky mode holds a strip, or releases it (`None`).
/// Windows moves the window below a newly reserved strip some time after ABM_SETPOS, so re-placing it is not enough:
/// the move itself is overridden in WM_WINDOWPOSCHANGING. Call before placing the window at `pos`.
pub fn pin<R: Runtime>(window: &WebviewWindow<R>, pos: Option<(i32, i32)>) {
    native::set_pin(pos);
    if pos.is_some() && !native::PIN_INSTALLED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        let Ok(hwnd) = window.hwnd() else {
            native::PIN_INSTALLED.store(false, std::sync::atomic::Ordering::SeqCst);
            return;
        };
        let hwnd = hwnd.0 as isize;
        // A subclass must be installed on the thread that owns the window.
        if window
            .run_on_main_thread(move || native::install_pin(hwnd))
            .is_err()
        {
            native::PIN_INSTALLED.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    }
}

/// Top edge of the reserved strip while sticky mode holds one.
pub fn strip_top<R: Runtime>(app: &AppHandle<R>) -> Option<i32> {
    app.try_state::<StickyState>()?.inner.lock().ok()?.top
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
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.height = height;
        sync(&window, &mut inner, false)?;
    }
    crate::window::reapply(&window)
}

/// Re-applies the strip after a display change (resolution, DPI, primary monitor).
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(NOTCH_LABEL) else {
        return;
    };
    if let Ok(mut inner) = app.state::<StickyState>().inner.lock() {
        let _ = sync(&window, &mut inner, true);
    }
    let _ = crate::window::reapply(&window);
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
    let rect = reserve_rect(crate::window::target_geometry(window)?, height);
    if !force && inner.applied == Some(rect) {
        return Ok(());
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    if inner.registered != Some(hwnd) {
        unregister(inner);
        native::register(hwnd)?;
        inner.registered = Some(hwnd);
    }
    let granted = native::set_top_strip(hwnd, rect)?;
    inner.applied = Some(rect);
    inner.top = Some(granted.1);
    Ok(())
}

fn unregister(inner: &mut Inner) {
    if let Some(hwnd) = inner.registered.take() {
        native::unregister(hwnd);
    }
    inner.applied = None;
    inner.top = None;
}

#[cfg(windows)]
mod native {
    use super::Rect;
    use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, SHAppBarMessage, SetWindowSubclass, ABE_TOP, ABM_NEW, ABM_QUERYPOS,
        ABM_REMOVE, ABM_SETPOS, APPBARDATA,
    };
    use windows::Win32::UI::WindowsAndMessaging::{SWP_NOMOVE, WINDOWPOS, WM_WINDOWPOSCHANGING};

    pub static PIN_INSTALLED: AtomicBool = AtomicBool::new(false);
    static PINNED: AtomicBool = AtomicBool::new(false);
    static PIN_X: AtomicI32 = AtomicI32::new(0);
    static PIN_Y: AtomicI32 = AtomicI32::new(0);
    const PIN_SUBCLASS_ID: usize = 0x5717;

    pub fn set_pin(pos: Option<(i32, i32)>) {
        if let Some((x, y)) = pos {
            PIN_X.store(x, Ordering::SeqCst);
            PIN_Y.store(y, Ordering::SeqCst);
        }
        PINNED.store(pos.is_some(), Ordering::SeqCst);
    }

    pub fn install_pin(hwnd: isize) {
        // SAFETY: called on the window's own thread with a live window handle; the callback is a plain fn.
        unsafe {
            let _ = SetWindowSubclass(HWND(hwnd as *mut _), Some(pin_proc), PIN_SUBCLASS_ID, 0);
        }
    }

    unsafe extern "system" fn pin_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if msg == WM_WINDOWPOSCHANGING && PINNED.load(Ordering::SeqCst) && lparam.0 != 0 {
            // SAFETY: for WM_WINDOWPOSCHANGING, lParam points to the WINDOWPOS the move will use.
            let pos = unsafe { &mut *(lparam.0 as *mut WINDOWPOS) };
            if pos.flags & SWP_NOMOVE != SWP_NOMOVE {
                pos.x = PIN_X.load(Ordering::SeqCst);
                pos.y = PIN_Y.load(Ordering::SeqCst);
            }
        }
        // SAFETY: forwards the message unchanged to the rest of the subclass chain.
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

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

    /// Asks the shell for the strip (it moves it below other top AppBars such as a top taskbar), reserves it and
    /// returns what was granted.
    pub fn set_top_strip(hwnd: isize, (left, top, right, bottom): Rect) -> Result<Rect, String> {
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
        Ok((abd.rc.left, abd.rc.top, abd.rc.right, abd.rc.bottom))
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
    pub static PIN_INSTALLED: std::sync::atomic::AtomicBool =
        std::sync::atomic::AtomicBool::new(true);
    pub fn set_pin(_: Option<(i32, i32)>) {}
    pub fn install_pin(_: isize) {}
    pub fn register(_: isize) -> Result<(), String> {
        Err("sticky mode needs Windows".into())
    }
    pub fn set_top_strip(_: isize, rect: Rect) -> Result<Rect, String> {
        Ok(rect)
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
