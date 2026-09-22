//! Notch windows: creation, sizing and placement at the top of a monitor.
//!
//! The frontend owns the notch dimensions (see `src/shell/notch-sizes.ts`) and asks Rust to
//! resize/place its own window through [`notch_layout`]. A window always matches the notch block, so everything
//! outside it stays click-through. With `pill.monitor = "all"` there is one window per screen (SPEC §16).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

/// Window on the primary screen; the others are `notch-1`, `notch-2`…
pub const NOTCH_LABEL: &str = "notch";
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

/// Physical size and position of a notch window.
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
    /// Last layout of each notch window, by window label.
    layout: Mutex<HashMap<String, LayoutRequest>>,
    /// Screen each notch window belongs to, by window label.
    monitors: Mutex<HashMap<String, MonitorGeometry>>,
    /// Physical px per CSS px, as each notch page last reported it (`devicePixelRatio`), by window label.
    page_scale: Mutex<HashMap<String, f64>>,
    /// "Ẩn notch tạm thời" from the tray: layout calls keep sizing the windows but never show them.
    pub hidden: AtomicBool,
}

/// Label of the notch window on the `index`-th screen.
pub fn label_for(index: usize) -> String {
    if index == 0 {
        NOTCH_LABEL.to_string()
    } else {
        format!("{NOTCH_LABEL}-{index}")
    }
}

/// True for labels that belong to a notch window.
pub fn is_notch_label(label: &str) -> bool {
    label == NOTCH_LABEL || label.starts_with(&format!("{NOTCH_LABEL}-"))
}

/// Labels of the notch windows that exist right now.
pub fn notch_labels<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let mut labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|l| is_notch_label(l))
        .cloned()
        .collect();
    labels.sort();
    labels
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

/// Screens in the order notch windows are assigned to them: the primary one first, then left to right.
pub fn screen_order(primary: MonitorGeometry, all: &[MonitorGeometry]) -> Vec<MonitorGeometry> {
    let mut others: Vec<MonitorGeometry> = all.iter().copied().filter(|m| *m != primary).collect();
    others.sort_by_key(|m| (m.x, m.y));
    std::iter::once(primary).chain(others).collect()
}

pub fn primary_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Result<MonitorGeometry, String> {
    let monitor = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no primary monitor".to_string())?;
    Ok(geometry_of(&monitor))
}

fn shows_on_every_screen<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<crate::settings::SettingsState>()
        .is_some_and(|s| s.get().pill.monitor == "all")
}

/// Screens that should carry a notch: every screen, or only the primary one (SPEC §16).
pub fn wanted_screens<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<MonitorGeometry>, String> {
    let primary = geometry_of(
        &app.primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no primary monitor".to_string())?,
    );
    if !shows_on_every_screen(app) {
        return Ok(vec![primary]);
    }
    let all: Vec<MonitorGeometry> = app
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .map(geometry_of)
        .collect();
    Ok(screen_order(primary, &all))
}

/// A scale a page may report: anything else is a bug on the page side.
pub fn valid_page_scale(scale: f64) -> bool {
    scale.is_finite() && (0.5..=8.0).contains(&scale)
}

/// `screen` with its scale replaced by the page's own, when the page has reported one.
///
/// WebView2 draws a page at the monitor's DPI scale *times* the Windows text size (Accessibility > Text size), so on
/// a machine with bigger text every CSS px is bigger than the logical px the monitor reports. Sizing the window from
/// the monitor alone cut the open panel off on both sides and at the bottom there (the owner, 22/09).
pub fn with_page_scale(screen: MonitorGeometry, page_scale: Option<f64>) -> MonitorGeometry {
    match page_scale {
        Some(scale) if valid_page_scale(scale) => MonitorGeometry { scale, ..screen },
        _ => screen,
    }
}

/// Screen a notch window sits on, measured in its page's px: what sizes and gaps from the page are converted with.
pub fn page_screen<R: Runtime>(window: &WebviewWindow<R>) -> Result<MonitorGeometry, String> {
    let page_scale = window
        .state::<NotchState>()
        .page_scale
        .lock()
        .ok()
        .and_then(|m| m.get(window.label()).copied());
    Ok(with_page_scale(screen_of_window(window)?, page_scale))
}

/// Screen a notch window sits on.
pub fn screen_of_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<MonitorGeometry, String> {
    let assigned = window
        .state::<NotchState>()
        .monitors
        .lock()
        .ok()
        .and_then(|m| m.get(window.label()).copied());
    match assigned {
        Some(geometry) => Ok(geometry),
        None => primary_geometry(window),
    }
}

fn apply<R: Runtime>(window: &WebviewWindow<R>, req: LayoutRequest) -> Result<(), String> {
    let strip_top = crate::sticky::strip_top(window.app_handle(), window.label());
    let p = place_notch(
        page_screen(window)?,
        req.width,
        req.height,
        req.top_gap,
        req.offset_x,
        strip_top,
    );
    crate::sticky::pin(window, strip_top.map(|_| (p.x, p.y)));
    // Position first: moving to a screen with another DPI makes Windows rescale the window, and the size below then
    // lands on the screen the notch ends up on.
    window
        .set_position(PhysicalPosition::new(p.x, p.y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(p.width, p.height))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Places a notch again from its last layout request, e.g. after sticky mode moved the top edge. Windows also moves
/// the window below a newly reserved strip, so this puts it back.
pub fn reapply<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    let req = window
        .state::<NotchState>()
        .layout
        .lock()
        .map_err(|e| e.to_string())?
        .get(window.label())
        .copied();
    match req {
        Some(req) => apply(window, req),
        None => Ok(()),
    }
}

/// Resizes and places the calling notch window, then shows it without taking focus.
#[tauri::command]
pub fn notch_layout<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, NotchState>,
    width: f64,
    height: f64,
    top_gap: f64,
    offset_x: f64,
    scale: Option<f64>,
) -> Result<(), String> {
    if let Some(s) = scale {
        if !valid_page_scale(s) {
            return Err(format!("invalid page scale {s}"));
        }
        state
            .page_scale
            .lock()
            .map_err(|e| e.to_string())?
            .insert(window.label().to_string(), s);
    }
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
    apply(&window, req)?;
    state
        .layout
        .lock()
        .map_err(|e| e.to_string())?
        .insert(window.label().to_string(), req);
    if !state.hidden.load(Ordering::Relaxed) && !window.is_visible().map_err(|e| e.to_string())? {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hides or shows every notch window (tray "Ẩn notch tạm thời"). The frontend keeps running, so alerts still queue.
pub fn set_hidden<R: Runtime>(app: &AppHandle<R>, hidden: bool) -> tauri::Result<()> {
    app.state::<NotchState>()
        .hidden
        .store(hidden, Ordering::Relaxed);
    for label in notch_labels(app) {
        if let Some(window) = app.get_webview_window(&label) {
            if hidden {
                window.hide()?;
            } else {
                window.show()?;
            }
        }
    }
    Ok(())
}

pub fn is_hidden<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<NotchState>().hidden.load(Ordering::Relaxed)
}

/// Creates one hidden notch window. It becomes visible on its frontend's first `notch_layout` call.
fn create_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> tauri::Result<WebviewWindow<R>> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
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

/// Makes the notch windows match the screens they should be on: one on the primary screen, or one per screen.
/// Called at startup, when the setting changes and when monitors come and go.
pub fn sync_windows<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let screens = wanted_screens(app)?;
    let wanted: Vec<String> = (0..screens.len()).map(label_for).collect();

    for (index, screen) in screens.iter().enumerate() {
        let label = label_for(index);
        if let Ok(mut monitors) = app.state::<NotchState>().monitors.lock() {
            monitors.insert(label.clone(), *screen);
        }
        match app.get_webview_window(&label) {
            Some(window) => {
                let _ = reapply(&window);
            }
            None => {
                create_window(app, &label).map_err(|e| e.to_string())?;
            }
        }
    }

    // Screens that went away, or the extra windows after switching back to "primary".
    for label in notch_labels(app) {
        if wanted.contains(&label) {
            continue;
        }
        crate::sticky::forget(app, &label);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
        if let Ok(mut state) = app.state::<NotchState>().layout.lock() {
            state.remove(&label);
        }
        if let Ok(mut monitors) = app.state::<NotchState>().monitors.lock() {
            monitors.remove(&label);
        }
        if let Ok(mut scales) = app.state::<NotchState>().page_scale.lock() {
            scales.remove(&label);
        }
    }
    Ok(())
}

/// Watches the display setup: monitors coming and going, resolution and DPI changes.
pub fn watch_displays<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut last: Option<Vec<MonitorGeometry>> = None;
        loop {
            std::thread::sleep(DISPLAY_POLL);
            let Ok(screens) = wanted_screens(&app) else {
                continue;
            };
            if last.as_ref().is_some_and(|s| *s != screens) {
                // This watcher runs off the main thread, which is where opening and closing windows has to happen.
                if let Err(e) = sync_windows(&app) {
                    eprintln!("winbar notch: could not follow the display change: {e}");
                }
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || crate::sticky::refresh(&handle));
            }
            last = Some(screens);
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
    fn sizes_by_the_page_scale_when_text_is_bigger() {
        // 100% monitor with Windows text size at 125%: the page draws 1.25 physical px per CSS px.
        let screen = with_page_scale(monitor(1920, 1080, 1.0), Some(1.25));
        let p = place_notch(screen, 808.0, 400.0, 0.0, 0.0, None);
        assert_eq!((p.width, p.height), (1010, 500));
    }

    #[test]
    fn ignores_a_page_scale_that_makes_no_sense() {
        let m = monitor(1920, 1080, 1.5);
        for bad in [
            None,
            Some(0.0),
            Some(-1.0),
            Some(f64::NAN),
            Some(f64::INFINITY),
            Some(40.0),
        ] {
            assert_eq!(with_page_scale(m, bad), m);
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
    fn names_one_window_per_screen() {
        assert_eq!(label_for(0), "notch");
        assert_eq!(label_for(1), "notch-1");
        assert!(is_notch_label("notch") && is_notch_label("notch-2"));
        assert!(!is_notch_label("settings") && !is_notch_label("command-bar"));
    }

    #[test]
    fn puts_the_primary_screen_first_then_left_to_right() {
        let primary = MonitorGeometry {
            x: 0,
            y: 0,
            width: 1920,
            height: 1200,
            scale: 1.25,
        };
        let right = MonitorGeometry {
            x: 1920,
            y: 0,
            width: 1920,
            height: 1080,
            scale: 1.0,
        };
        let left = MonitorGeometry {
            x: -1280,
            y: 0,
            width: 1280,
            height: 720,
            scale: 1.0,
        };
        assert_eq!(
            screen_order(primary, &[right, primary, left]),
            vec![primary, left, right]
        );
        assert_eq!(screen_order(primary, &[primary]), vec![primary]);
        // A primary screen missing from the list still comes first.
        assert_eq!(screen_order(primary, &[right]), vec![primary, right]);
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
