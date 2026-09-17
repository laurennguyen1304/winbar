//! Command bar window (SPEC-command-bar.md §2, §5.2). Created hidden at startup so opening is only show + focus.
//! The hotkey and the tray open it or bring it forward; it hides only when its page asks (Esc while focused).

use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const LABEL: &str = "command-bar";
/// Sent to the command-bar page each time it is shown or brought forward, so it focuses and selects the input.
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

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("command-bar.html".into()))
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
        .build()?;
    place_default(&window)?;
    Ok(window)
}

/// Centred on the primary monitor, top edge at 25% of its work area. Task 3 adds the cursor monitor and the saved position.
fn place_default<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let Some(monitor) = window.primary_monitor()? else {
        return Ok(());
    };
    let area = monitor.work_area();
    let width = (WIDTH * monitor.scale_factor()).round() as i32;
    let x = area.position.x + (area.size.width as i32 - width) / 2;
    let y = area.position.y + (f64::from(area.size.height) * 0.25).round() as i32;
    window.set_position(PhysicalPosition::new(x, y))
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
        match action {
            OpenAction::Nothing => return Ok(()),
            OpenAction::Show => window.show()?,
            OpenAction::Focus => {}
        }
        window.set_focus()?;
        window.emit_to(LABEL, OPENED_EVENT, ())
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
#[tauri::command]
pub fn command_bar_resize<R: Runtime>(window: WebviewWindow<R>, height: f64) -> Result<(), String> {
    ensure_command_bar(&window)?;
    let height = valid_height(height).ok_or_else(|| format!("invalid height {height}"))?;
    window
        .set_size(LogicalSize::new(WIDTH, height))
        .map_err(|e| e.to_string())
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
    fn rejects_heights_the_page_should_never_send() {
        assert_eq!(valid_height(101.0), Some(101.0));
        assert_eq!(valid_height(100.4), Some(101.0));
        assert_eq!(valid_height(0.0), None);
        assert_eq!(valid_height(-5.0), None);
        assert_eq!(valid_height(f64::NAN), None);
        assert_eq!(valid_height(5000.0), None);
    }
}
