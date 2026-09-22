//! Command bar window (SPEC-command-bar.md §2, §5.2). Created hidden at startup so opening is only show + focus.
//! The hotkey and the tray open it or bring it forward; it hides only when its page asks (Esc while focused).

pub mod actions;
pub mod apps;
pub mod files;
pub mod history;
pub mod icons;
pub mod launch;
pub mod placement;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::settings::{self, Position, SettingsState};
use placement::WorkArea;

pub const LABEL: &str = "command-bar";
/// Sent to the command-bar page each time it is shown or brought forward, so it focuses and selects the input.
/// Payload: [`Opened`].
pub const OPENED_EVENT: &str = "command-bar-opened";
/// Logical px (mockup `.cmd`).
pub const WIDTH: f64 = 660.0;
/// Top row 60 + separator 1 + footer 40.
const INITIAL_HEIGHT: f64 = 101.0;
const MAX_HEIGHT: f64 = 1200.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenAction {
    Show,
    Focus,
    Nothing,
}

/// Pressing the hotkey never closes the command bar: it shows it, or brings it forward when another app has focus.
pub fn open_action(visible: bool, focused: bool) -> OpenAction {
    match (visible, focused) {
        (false, _) => OpenAction::Show,
        (true, false) => OpenAction::Focus,
        (true, true) => OpenAction::Nothing,
    }
}

/// The page reports its content height; anything outside this range is a bug on the page side.
pub fn valid_height(height: f64) -> Option<f64> {
    (height.is_finite() && (1.0..=MAX_HEIGHT).contains(&height)).then(|| height.ceil())
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    /// Logical px the bar may grow to before it would leave its screen.
    pub max_height: f64,
    /// The screen's scale, so the page can turn `max_height` into its own px (bigger with Windows text size).
    pub scale: f64,
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("command-bar.html".into()))
        .title("winbar command bar")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .inner_size(WIDTH, INITIAL_HEIGHT)
        .build()
}

fn work_area(monitor: &Monitor) -> WorkArea {
    let area = monitor.work_area();
    WorkArea {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
        scale: monitor.scale_factor(),
    }
}

fn work_areas<R: Runtime>(app: &AppHandle<R>) -> Vec<WorkArea> {
    app.available_monitors()
        .map(|ms| ms.iter().map(work_area).collect())
        .unwrap_or_default()
}

/// Monitor under the mouse, else the primary monitor.
fn cursor_area<R: Runtime>(app: &AppHandle<R>) -> Option<WorkArea> {
    let under_cursor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten());
    under_cursor
        .or_else(|| app.primary_monitor().ok().flatten())
        .as_ref()
        .map(work_area)
}

fn saved_position<R: Runtime>(app: &AppHandle<R>) -> Option<(i32, i32)> {
    app.try_state::<SettingsState>()
        .and_then(|s| s.get().command_bar.position)
        .map(|p| (p.x, p.y))
}

/// Room below the bar's top edge on the screen it is on.
fn opened_at<R: Runtime>(app: &AppHandle<R>, pos: (i32, i32)) -> Opened {
    let area = placement::area_for_saved(pos, WIDTH, &work_areas(app)).or_else(|| cursor_area(app));
    area.map_or(
        Opened {
            max_height: INITIAL_HEIGHT,
            scale: 1.0,
        },
        |a| Opened {
            max_height: placement::max_height(pos.1, a),
            scale: a.scale,
        },
    )
}

/// Puts the hidden window where it should open (SPEC-command-bar §5.3).
fn place_for_opening<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> tauri::Result<(i32, i32)> {
    let Some(cursor) = cursor_area(app) else {
        let p = window.outer_position()?;
        return Ok((p.x, p.y));
    };
    let pos = placement::open_position(saved_position(app), WIDTH, &work_areas(app), cursor);
    window.set_position(PhysicalPosition::new(pos.0, pos.1))?;
    Ok(pos)
}

/// Hotkey and tray entry point.
pub fn open<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        eprintln!("winbar command bar: window missing");
        return;
    };
    let action = open_action(
        window.is_visible().unwrap_or(false),
        window.is_focused().unwrap_or(false),
    );
    let result = (|| -> tauri::Result<()> {
        let pos = match action {
            OpenAction::Nothing => return Ok(()),
            OpenAction::Show => {
                let pos = place_for_opening(app, &window)?;
                window.show()?;
                pos
            }
            OpenAction::Focus => {
                let p = window.outer_position()?;
                (p.x, p.y)
            }
        };
        window.set_focus()?;
        let opened = opened_at(app, pos);
        window.emit_to(LABEL, OPENED_EVENT, opened)
    })();
    if let Err(e) = result {
        eprintln!("winbar command bar: {action:?} failed: {e}");
    }
}

fn ensure_command_bar<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    if window.label() == LABEL {
        Ok(())
    } else {
        Err(format!("only the {LABEL} window may call this"))
    }
}

/// Esc on an empty input (after the fade-out).
#[tauri::command]
pub fn command_bar_hide<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    ensure_command_bar(&window)?;
    window.hide().map_err(|e| e.to_string())
}

/// Keeps the native window exactly as tall as the content; the top edge stays put.
///
/// `scale` is the page's `devicePixelRatio`. It is bigger than the monitor's scale when Windows text size is up, and
/// sizing from the monitor then left the window shorter and narrower than the bar drawn in it.
#[tauri::command]
pub fn command_bar_resize<R: Runtime>(
    window: WebviewWindow<R>,
    height: f64,
    scale: Option<f64>,
) -> Result<(), String> {
    ensure_command_bar(&window)?;
    let height = valid_height(height).ok_or_else(|| format!("invalid height {height}"))?;
    let result = match scale {
        Some(s) if crate::window::valid_page_scale(s) => window.set_size(PhysicalSize::new(
            (WIDTH * s).round() as u32,
            (height * s).round() as u32,
        )),
        Some(s) => return Err(format!("invalid page scale {s}")),
        None => window.set_size(LogicalSize::new(WIDTH, height)),
    };
    result.map_err(|e| e.to_string())
}

/// Returns `settings` (as JSON) with `commandBar.position` replaced.
pub fn with_position(mut settings: Value, position: Option<Position>) -> Value {
    if let Some(root) = settings.as_object_mut() {
        let section = root.entry("commandBar").or_insert_with(|| json!({}));
        if let Some(section) = section.as_object_mut() {
            section.insert("position".into(), json!(position));
        }
    }
    settings
}

/// The user dropped the bar after dragging it by the grip: remember where the window is now.
/// Rust reads the real window position instead of trusting numbers from the page.
#[tauri::command]
pub fn command_bar_save_position<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: tauri::State<'_, SettingsState>,
) -> Result<Opened, String> {
    ensure_command_bar(&window)?;
    let p = window.outer_position().map_err(|e| e.to_string())?;
    let current = serde_json::to_value(state.get()).map_err(|e| e.to_string())?;
    let next = with_position(current, Some(Position { x: p.x, y: p.y }));
    settings::apply(&app, &state, &next)?;
    Ok(opened_at(&app, (p.x, p.y)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_hotkey_never_closes_the_command_bar() {
        assert_eq!(open_action(false, false), OpenAction::Show);
        assert_eq!(open_action(true, false), OpenAction::Focus);
        assert_eq!(open_action(true, true), OpenAction::Nothing);
    }

    #[test]
    fn saving_a_position_changes_only_that_field() {
        let before = serde_json::to_value(settings::Settings::default()).unwrap();
        let after = with_position(before, Some(Position { x: -40, y: 300 }));
        let (parsed, warnings) = settings::from_value(&after);
        assert!(warnings.is_empty());
        let mut expected = settings::Settings::default();
        expected.command_bar.position = Some(Position { x: -40, y: 300 });
        assert_eq!(parsed, expected);
        assert_eq!(
            with_position(json!({}), None),
            json!({ "commandBar": { "position": null } })
        );
    }

    #[test]
    fn rejects_heights_the_page_should_never_send() {
        assert_eq!(valid_height(101.0), Some(101.0));
        assert_eq!(valid_height(100.4), Some(101.0));
        assert_eq!(valid_height(0.0), None);
        assert_eq!(valid_height(-5.0), None);
        assert_eq!(valid_height(f64::NAN), None);
        assert_eq!(valid_height(5000.0), None);
    }
}
