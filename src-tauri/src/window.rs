//! Notch window: creation, sizing and placement at the top centre of the primary monitor.
//!
//! The frontend owns the notch dimensions (see `src/shell/notch-sizes.ts`) and asks Rust to
//! resize/place the native window through [`notch_layout`]. The native window always matches the
//! notch block, so everything outside it stays click-through.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const NOTCH_LABEL: &str = "notch";

/// How often the cursor is checked while the notch follows the mouse (SPEC §16).
const CURSOR_POLL: Duration = Duration::from_millis(300);
/// How often the display setup is checked (resolution, DPI, monitors coming and going).
const DISPLAY_POLL: Duration = Duration::from_secs(2);

/// Monitor geometry in physical pixels plus its scale factor.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// Physical size and position of the notch window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotchPlacement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Places a notch of `width`×`height` logical px on `monitor`, `top_gap` logical px below its top edge and
/// `offset_x` logical px right of the centre (SPEC §15 V3), kept inside the monitor.
/// `top` (physical px) replaces the monitor's top edge while sticky mode reserves a strip: the notch sits in it.
pub fn place_notch(
    monitor: MonitorGeometry,
    width: f64,
    height: f64,
    top_gap: f64,
    offset_x: f64,
    top: Option<i32>,
) -> NotchPlacement {
    let pw = (width * monitor.scale).round().max(1.0) as u32;
    let ph = (height * monitor.scale).round().max(1.0) as u32;
    let gap = (top_gap * monitor.scale).round() as i32;
    let free = (monitor.width as i32 - pw as i32).max(0);
    let shift = (offset_x * monitor.scale).round() as i32;
    let x = monitor.x + (free / 2 + shift).clamp(0, free);
    NotchPlacement {
        x,
        y: top.unwrap_or(monitor.y) + gap,
        width: pw,
        height: ph,
    }
}

/// Last layout requested by the frontend, in logical px; reapplied when the display setup changes.
#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub struct LayoutRequest {
    pub width: f64,
    pub height: f64,
    pub top_gap: f64,
    pub offset_x: f64,
}

#[derive(Default)]
pub struct NotchState {
    pub layout: Mutex<Option<LayoutRequest>>,
    /// The panel is open: the notch stays where it is, even if the cursor moves to another screen (SPEC §16).
    pub expanded: AtomicBool,
    /// "Ẩn notch tạm thời" from the tray: layout calls keep sizing the window but never show it.
    pub hidden: AtomicBool,
}

pub fn primary_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Result<MonitorGeometry, String> {
    let monitor = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no primary monitor".to_string())?;
    Ok(geometry_of(&monitor))
}

fn geometry_of(monitor: &tauri::Monitor) -> MonitorGeometry {
    let pos = monitor.position();
    let size = monitor.size();
    MonitorGeometry {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        scale: monitor.scale_factor(),
    }
}

/// Monitor holding this physical point, if any.
pub fn monitor_at(point: (i32, i32), monitors: &[MonitorGeometry]) -> Option<usize> {
    monitors.iter().position(|m| {
        let (x, y) = point;
        x >= m.x && x < m.x + m.width as i32 && y >= m.y && y < m.y + m.height as i32
    })
}

/// Screen the notch belongs on: the one under the cursor when `pill.monitor` is `mouse`, else the primary one.
pub fn target_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Result<MonitorGeometry, String> {
    if follows_mouse(window.app_handle()) {
        if let Some(geometry) = cursor_geometry(window) {
            return Ok(geometry);
        }
    }
    primary_geometry(window)
}

fn follows_mouse<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<crate::settings::SettingsState>()
        .is_some_and(|s| s.get().pill.monitor == "mouse")
}

/// Geometry of the monitor under the cursor; `None` when the cursor cannot be read or sits outside every monitor.
fn cursor_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Option<MonitorGeometry> {
    let point = cursor_position()?;
    let monitors = window.available_monitors().ok()?;
    let geometries: Vec<MonitorGeometry> = monitors.iter().map(geometry_of).collect();
    monitor_at(point, &geometries).map(|i| geometries[i])
}

#[cfg(windows)]
fn cursor_position() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut point = POINT::default();
    // SAFETY: `point` is an owned struct that outlives the call.
    unsafe { GetCursorPos(&mut point) }.ok()?;
    Some((point.x, point.y))
}

#[cfg(not(windows))]
fn cursor_position() -> Option<(i32, i32)> {
    None
}

fn apply<R: Runtime>(window: &WebviewWindow<R>, req: LayoutRequest) -> Result<(), String> {
    let strip_top = crate::sticky::strip_top(window.app_handle());
    let p = place_notch(
        target_geometry(window)?,
        req.width,
        req.height,
        req.top_gap,
        req.offset_x,
        strip_top,
    );
    crate::sticky::pin(window, strip_top.map(|_| (p.x, p.y)));
    window
        .set_size(PhysicalSize::new(p.width, p.height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(p.x, p.y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Places the notch again from the last layout request, e.g. after sticky mode moved the top edge. Windows also moves
/// the notch window below a newly reserved strip, so this puts it back.
pub fn reapply<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    let req = *window
        .state::<NotchState>()
        .layout
        .lock()
        .map_err(|e| e.to_string())?;
    match req {
        Some(req) => apply(window, req),
        None => Ok(()),
    }
}

/// Resizes and places the notch window, then shows it without taking focus.
#[tauri::command]
pub fn notch_layout<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, NotchState>,
    width: f64,
    height: f64,
    top_gap: f64,
    offset_x: f64,
    expanded: bool,
) -> Result<(), String> {
    if !(width.is_finite() && height.is_finite() && top_gap.is_finite() && offset_x.is_finite())
        || width <= 0.0
        || height <= 0.0
    {
        return Err(format!(
            "invalid notch layout {width}x{height} gap {top_gap}"
        ));
    }
    let req = LayoutRequest {
        width,
        height,
        top_gap,
        offset_x,
    };
    state.expanded.store(expanded, Ordering::Relaxed);
    apply(&window, req)?;
    *state.layout.lock().map_err(|e| e.to_string())? = Some(req);
    if !state.hidden.load(Ordering::Relaxed) && !window.is_visible().map_err(|e| e.to_string())? {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hides or shows the notch window (tray "Ẩn notch tạm thời"). The frontend keeps running, so alerts still queue.
pub fn set_hidden<R: Runtime>(app: &AppHandle<R>, hidden: bool) -> tauri::Result<()> {
    app.state::<NotchState>()
        .hidden
        .store(hidden, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window(NOTCH_LABEL) {
        if hidden {
            window.hide()?;
        } else {
            window.show()?;
        }
    }
    Ok(())
}

pub fn is_hidden<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<NotchState>().hidden.load(Ordering::Relaxed)
}

/// Creates the hidden notch window. It becomes visible on the frontend's first `notch_layout` call.
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    WebviewWindowBuilder::new(app, NOTCH_LABEL, WebviewUrl::App("index.html".into()))
        .title("winbar")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .inner_size(340.0, 40.0)
        .build()
}

/// Re-places the notch when the primary monitor's geometry or scale changes (resolution, DPI, primary display).
pub fn watch_displays<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut last: Option<MonitorGeometry> = None;
        let mut since_display_check = Duration::ZERO;
        loop {
            std::thread::sleep(CURSOR_POLL);
            since_display_check += CURSOR_POLL;
            let Some(window) = app.get_webview_window(NOTCH_LABEL) else {
                continue;
            };
            // The cursor is cheap to read; the display setup is only worth checking now and then.
            let follows = follows_mouse(&app);
            if !follows && since_display_check < DISPLAY_POLL {
                continue;
            }
            if since_display_check >= DISPLAY_POLL {
                since_display_check = Duration::ZERO;
            }
            let Ok(geometry) = target_geometry(&window) else {
                continue;
            };
            // Moving the notch out from under the open panel would be jarring, so wait until it collapses.
            let expanded = app.state::<NotchState>().expanded.load(Ordering::Relaxed);
            if last.is_some_and(|g| g != geometry) && !expanded {
                let req = app
                    .state::<NotchState>()
                    .layout
                    .lock()
                    .ok()
                    .and_then(|l| *l);
                if let Some(req) = req {
                    let w = window.clone();
                    let _ = window.run_on_main_thread(move || {
                        let _ = apply(&w, req);
                    });
                }
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || crate::sticky::refresh(&handle));
                last = Some(geometry);
            } else if last.is_none() || !expanded {
                last = Some(geometry);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor(width: u32, height: u32, scale: f64) -> MonitorGeometry {
        MonitorGeometry {
            x: 0,
            y: 0,
            width,
            height,
            scale,
        }
    }

    #[test]
    fn centres_pill_at_100_percent() {
        let p = place_notch(monitor(1920, 1080, 1.0), 340.0, 40.0, 8.0, 0.0, None);
        assert_eq!(
            p,
            NotchPlacement {
                x: 790,
                y: 8,
                width: 340,
                height: 40
            }
        );
    }

    #[test]
    fn scales_size_and_gap_at_125_percent() {
        let p = place_notch(monitor(2400, 1500, 1.25), 340.0, 40.0, 8.0, 0.0, None);
        assert_eq!(
            p,
            NotchPlacement {
                x: 987,
                y: 10,
                width: 425,
                height: 50
            }
        );
    }

    #[test]
    fn scales_size_and_gap_at_150_percent() {
        let p = place_notch(monitor(2880, 1800, 1.5), 340.0, 40.0, 8.0, 0.0, None);
        assert_eq!(
            p,
            NotchPlacement {
                x: 1185,
                y: 12,
                width: 510,
                height: 60
            }
        );
    }

    #[test]
    fn shifts_by_the_offset_in_logical_px() {
        let m = monitor(2400, 1500, 1.25);
        assert_eq!(place_notch(m, 368.0, 40.0, 0.0, -400.0, None).x, 470);
        assert_eq!(place_notch(m, 368.0, 40.0, 0.0, 400.0, None).x, 1470);
        assert_eq!(
            place_notch(monitor(2880, 1800, 1.5), 368.0, 40.0, 0.0, 300.0, None).x,
            1164 + 450
        );
    }

    #[test]
    fn keeps_the_notch_inside_the_monitor() {
        for scale in [1.0, 1.25, 1.5] {
            let m = monitor((1920.0 * scale) as u32, (1200.0 * scale) as u32, scale);
            let left = place_notch(m, 368.0, 40.0, 0.0, -4000.0, None);
            let right = place_notch(m, 368.0, 40.0, 0.0, 4000.0, None);
            assert_eq!(left.x, 0, "{scale}");
            assert_eq!(right.x + right.width as i32, m.width as i32, "{scale}");
        }
        let wide = place_notch(monitor(800, 600, 1.0), 900.0, 40.0, 0.0, 200.0, None);
        assert_eq!(wide.x, 0);
        let offset = MonitorGeometry {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
            scale: 1.0,
        };
        assert_eq!(
            place_notch(offset, 340.0, 40.0, 0.0, -4000.0, None).x,
            -1920
        );
    }

    #[test]
    fn sits_in_the_sticky_strip_when_one_is_reserved() {
        let m = monitor(2400, 1500, 1.25);
        // Attached: flush with the top of the strip (below a 47px top bar such as YASB).
        assert_eq!(place_notch(m, 368.0, 40.0, 0.0, 0.0, Some(47)).y, 47);
        // Floating: the gap is counted from the strip's top.
        assert_eq!(place_notch(m, 340.0, 40.0, 8.0, 0.0, Some(47)).y, 57);
        assert_eq!(place_notch(m, 340.0, 40.0, 8.0, 0.0, None).y, 10);
    }

    #[test]
    fn finds_the_monitor_holding_a_point() {
        let screens = [
            MonitorGeometry {
                x: 0,
                y: 0,
                width: 1920,
                height: 1200,
                scale: 1.25,
            },
            MonitorGeometry {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                scale: 1.0,
            },
        ];
        assert_eq!(monitor_at((10, 10), &screens), Some(0));
        assert_eq!(monitor_at((1919, 1199), &screens), Some(0));
        assert_eq!(monitor_at((1920, 0), &screens), Some(1));
        assert_eq!(monitor_at((2500, 900), &screens), Some(1));
        // Below the short screen, and left of both.
        assert_eq!(monitor_at((2500, 1100), &screens), None);
        assert_eq!(monitor_at((-5, 10), &screens), None);
        assert_eq!(monitor_at((10, 10), &[]), None);
    }

    #[test]
    fn keeps_a_dragged_notch_inside_a_narrower_second_screen() {
        let second = MonitorGeometry {
            x: 1920,
            y: 0,
            width: 1920,
            height: 1080,
            scale: 1.0,
        };
        // Dragged 900px right of centre on a wide screen, then moved to this narrower one.
        let p = place_notch(second, 368.0, 40.0, 0.0, 900.0, None);
        assert_eq!(p.x + p.width as i32, second.x + second.width as i32);
        assert!(p.x >= second.x);
        let left = place_notch(second, 368.0, 40.0, 0.0, -900.0, None);
        assert_eq!(left.x, second.x);
    }

    #[test]
    fn respects_monitor_origin() {
        let m = MonitorGeometry {
            x: -1920,
            y: -200,
            width: 1920,
            height: 1080,
            scale: 1.0,
        };
        let p = place_notch(m, 780.0, 486.0, 0.0, 0.0, None);
        assert_eq!(
            p,
            NotchPlacement {
                x: -1350,
                y: -200,
                width: 780,
                height: 486
            }
        );
    }
}
