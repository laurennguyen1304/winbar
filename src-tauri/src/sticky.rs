//! Sticky mode (SPEC-notch-shell §15 V4): reserves a full-width strip at the top of a monitor with a Windows AppBar,
//! so maximised windows start below the collapsed notch. The notch sits in that strip: below other top AppBars such
//! as YASB, and put back after each change because Windows moves it below a new strip.
//!
//! Each notch window keeps its own strip, so with a notch on every screen (SPEC §16) every screen reserves its own.
//! The frontend sends the strip height through [`notch_sticky`] (`None` = off). The strip is re-registered when the
//! display changes and removed when the app exits. If the process dies, the shell drops the AppBar with its window.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::window::MonitorGeometry;

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
    /// One entry per notch window, by window label.
    inner: Mutex<HashMap<String, Inner>>,
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

/// Keeps a notch window at `pos` (physical top-left) while sticky mode holds a strip, or releases it (`None`).
/// Windows moves the window below a newly reserved strip some time after ABM_SETPOS, so re-placing it is not enough:
/// the move itself is overridden in WM_WINDOWPOSCHANGING. Call before placing the window at `pos`.
pub fn pin<R: Runtime>(window: &WebviewWindow<R>, pos: Option<(i32, i32)>) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = hwnd.0 as isize;
    native::set_pin(hwnd, pos);
    if pos.is_some() && native::needs_install(hwnd) {
        // A subclass must be installed on the thread that owns the window.
        if window
            .run_on_main_thread(move || native::install_pin(hwnd))
            .is_err()
        {
            native::forget_install(hwnd);
        }
    }
}

/// Top edge of the strip this notch window holds, if any.
pub fn strip_top<R: Runtime>(app: &AppHandle<R>, label: &str) -> Option<i32> {
    app.try_state::<StickyState>()?
        .inner
        .lock()
        .ok()?
        .get(label)?
        .top
}

/// Turns the reserved strip on (`height` in logical px) or off (`None`) for the calling notch window.
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
        let mut all = state.inner.lock().map_err(|e| e.to_string())?;
        let inner = all.entry(window.label().to_string()).or_default();
        inner.height = height;
        sync(&window, inner, false)?;
    }
    crate::window::reapply(&window)
}

/// Re-applies every strip after a display change (resolution, DPI, monitors coming and going).
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    for label in crate::window::notch_labels(app) {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        if let Ok(mut all) = app.state::<StickyState>().inner.lock() {
            if let Some(inner) = all.get_mut(&label) {
                let _ = sync(&window, inner, true);
            }
        }
        let _ = crate::window::reapply(&window);
    }
}

/// Gives back the strip of one notch window (its screen went away, or the window is closing).
pub fn forget<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Ok(mut all) = app.state::<StickyState>().inner.lock() {
        if let Some(mut inner) = all.remove(label) {
            unregister(&mut inner);
        }
    }
}

/// Gives all the space back. Safe to call more than once.
pub fn remove<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(mut all) = app.state::<StickyState>().inner.lock() {
        for inner in all.values_mut() {
            unregister(inner);
        }
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
    let rect = reserve_rect(crate::window::page_screen(window)?, height);
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
    use std::collections::{HashMap, HashSet};
    use std::sync::Mutex;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, SHAppBarMessage, SetWindowSubclass, ABE_TOP, ABM_NEW, ABM_QUERYPOS,
        ABM_REMOVE, ABM_SETPOS, APPBARDATA,
    };
    use windows::Win32::UI::WindowsAndMessaging::{SWP_NOMOVE, WINDOWPOS, WM_WINDOWPOSCHANGING};

    /// Pinned position of each notch window, by raw handle, and which ones already carry the subclass.
    static PINS: Mutex<Option<HashMap<isize, (i32, i32)>>> = Mutex::new(None);
    static INSTALLED: Mutex<Option<HashSet<isize>>> = Mutex::new(None);
    const PIN_SUBCLASS_ID: usize = 0x5717;

    fn pins() -> std::sync::MutexGuard<'static, Option<HashMap<isize, (i32, i32)>>> {
        let mut guard = PINS.lock().unwrap_or_else(|e| e.into_inner());
        guard.get_or_insert_with(HashMap::new);
        guard
    }

    pub fn set_pin(hwnd: isize, pos: Option<(i32, i32)>) {
        let mut guard = pins();
        let map = guard.as_mut().expect("initialised above");
        match pos {
            Some(p) => map.insert(hwnd, p),
            None => map.remove(&hwnd),
        };
    }

    /// True when this window still needs the subclass; remembers it from here on.
    pub fn needs_install(hwnd: isize) -> bool {
        let mut guard = INSTALLED.lock().unwrap_or_else(|e| e.into_inner());
        guard.get_or_insert_with(HashSet::new).insert(hwnd)
    }

    pub fn forget_install(hwnd: isize) {
        if let Ok(mut guard) = INSTALLED.lock() {
            if let Some(set) = guard.as_mut() {
                set.remove(&hwnd);
            }
        }
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
        if msg == WM_WINDOWPOSCHANGING && lparam.0 != 0 {
            let pinned = pins()
                .as_ref()
                .and_then(|m| m.get(&(hwnd.0 as isize)).copied());
            if let Some((x, y)) = pinned {
                // SAFETY: for WM_WINDOWPOSCHANGING, lParam points to the WINDOWPOS the move will use.
                let pos = unsafe { &mut *(lparam.0 as *mut WINDOWPOS) };
                if pos.flags & SWP_NOMOVE != SWP_NOMOVE {
                    pos.x = x;
                    pos.y = y;
                }
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
    pub fn set_pin(_: isize, _: Option<(i32, i32)>) {}
    pub fn needs_install(_: isize) -> bool {
        false
    }
    pub fn forget_install(_: isize) {}
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
