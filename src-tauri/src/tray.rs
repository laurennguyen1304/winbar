//! System tray icon and menu (SPEC §2): open notch · command bar · hide temporarily · settings · start with Windows · quit.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::settings::{Settings, SettingsState};
use crate::{settings_window, window};

/// Frontend events emitted from the tray.
pub const OPEN_NOTCH_EVENT: &str = "notch-open-requested";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAction {
    OpenNotch,
    ToggleCommandBar,
    ToggleHidden,
    OpenSettings,
    ToggleLaunchAtStartup,
    Quit,
}

impl TrayAction {
    pub const ALL: [TrayAction; 6] = [
        TrayAction::OpenNotch,
        TrayAction::ToggleCommandBar,
        TrayAction::ToggleHidden,
        TrayAction::OpenSettings,
        TrayAction::ToggleLaunchAtStartup,
        TrayAction::Quit,
    ];

    pub fn id(self) -> &'static str {
        match self {
            TrayAction::OpenNotch => "open-notch",
            TrayAction::ToggleCommandBar => "command-bar",
            TrayAction::ToggleHidden => "hide-notch",
            TrayAction::OpenSettings => "settings",
            TrayAction::ToggleLaunchAtStartup => "launch-at-startup",
            TrayAction::Quit => "quit",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            TrayAction::OpenNotch => "Mở notch",
            TrayAction::ToggleCommandBar => "Command bar",
            TrayAction::ToggleHidden => "Ẩn notch tạm thời",
            TrayAction::OpenSettings => "Cài đặt…",
            TrayAction::ToggleLaunchAtStartup => "Khởi động cùng Windows",
            TrayAction::Quit => "Thoát winbar",
        }
    }

    pub fn from_id(id: &str) -> Option<TrayAction> {
        TrayAction::ALL.into_iter().find(|a| a.id() == id)
    }
}

/// Items that show an on/off state. They are plain items with a "✓" in the label: muda's native check items
/// did not draw an initial checked state in the tray popup on Windows 11 (seen during Task 10).
struct TrayChecks<R: Runtime> {
    hidden: MenuItem<R>,
    launch_at_startup: MenuItem<R>,
}

/// "Label  ✓" when on, the plain label when off; the mark goes last so every row keeps the same left edge.
pub fn checked_label(label: &str, checked: bool) -> String {
    if checked {
        format!("{label}  ✓")
    } else {
        label.to_string()
    }
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let settings = app.state::<SettingsState>().get();
    // No menu accelerators: the hotkey string is user-editable and an invalid one would fail menu creation.
    let item = |a: TrayAction| MenuItem::with_id(app, a.id(), a.label(), true, None::<&str>);
    let hidden = MenuItem::with_id(
        app,
        TrayAction::ToggleHidden.id(),
        checked_label(TrayAction::ToggleHidden.label(), false),
        true,
        None::<&str>,
    )?;
    let launch_at_startup = MenuItem::with_id(
        app,
        TrayAction::ToggleLaunchAtStartup.id(),
        checked_label(
            TrayAction::ToggleLaunchAtStartup.label(),
            settings.launch_at_startup,
        ),
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &item(TrayAction::OpenNotch)?,
            &MenuItem::with_id(
                app,
                TrayAction::ToggleCommandBar.id(),
                format!(
                    "{} ({})",
                    TrayAction::ToggleCommandBar.label(),
                    settings.hotkeys.command_bar
                ),
                true,
                None::<&str>,
            )?,
            &hidden,
            &PredefinedMenuItem::separator(app)?,
            &item(TrayAction::OpenSettings)?,
            &launch_at_startup,
            &PredefinedMenuItem::separator(app)?,
            &item(TrayAction::Quit)?,
        ],
    )?;
    app.manage(TrayChecks {
        hidden,
        launch_at_startup,
    });

    let mut builder = TrayIconBuilder::with_id("winbar")
        .tooltip("winbar")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if let Some(action) = TrayAction::from_id(event.id().as_ref()) {
                run(app, action);
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left click opens the notch; right click shows the menu.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                run(tray.app_handle(), TrayAction::OpenNotch);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Shows the notch if it was hidden and opens its panel, on `tab` ("core" / "claude") when given.
/// Shared by the tray and the command bar's winbar actions.
pub fn open_notch<R: Runtime>(app: &AppHandle<R>, tab: Option<&str>) -> Result<(), String> {
    if window::is_hidden(app) {
        window::set_hidden(app, false).map_err(|e| e.to_string())?;
        sync_hidden(app, false);
    }
    app.emit(OPEN_NOTCH_EVENT, tab).map_err(|e| e.to_string())
}

/// "Ẩn notch tạm thời", from the tray or the command bar.
pub fn set_notch_hidden<R: Runtime>(app: &AppHandle<R>, hidden: bool) -> Result<(), String> {
    let result = window::set_hidden(app, hidden).map_err(|e| e.to_string());
    sync_hidden(app, window::is_hidden(app));
    result
}

fn run<R: Runtime>(app: &AppHandle<R>, action: TrayAction) {
    let result: Result<(), String> = match action {
        TrayAction::OpenNotch => open_notch(app, None),
        TrayAction::ToggleCommandBar => {
            crate::command_bar::open(app);
            Ok(())
        }
        TrayAction::ToggleHidden => set_notch_hidden(app, !window::is_hidden(app)),
        TrayAction::OpenSettings => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = settings_window::open_settings(app).await {
                    eprintln!("winbar tray: open settings failed: {e}");
                }
            });
            Ok(())
        }
        TrayAction::ToggleLaunchAtStartup => {
            let state = app.state::<SettingsState>();
            let mut next = state.get();
            next.launch_at_startup = !next.launch_at_startup;
            serde_json::to_value(&next)
                .map_err(|e| e.to_string())
                .and_then(|v| crate::settings::apply(app, &state, &v))
                .map(|_| ())
        }
        TrayAction::Quit => {
            crate::hotkeys::release(app);
            app.exit(0);
            Ok(())
        }
    };
    if let Err(e) = result {
        eprintln!("winbar tray: {} failed: {e}", action.id());
    }
}

pub fn sync_hidden<R: Runtime>(app: &AppHandle<R>, hidden: bool) {
    if let Some(checks) = app.try_state::<TrayChecks<R>>() {
        let _ = checks
            .hidden
            .set_text(checked_label(TrayAction::ToggleHidden.label(), hidden));
    }
}

/// Keeps check marks in step with settings changed from the Settings window.
pub fn sync_settings<R: Runtime>(app: &AppHandle<R>, settings: &Settings) {
    if let Some(checks) = app.try_state::<TrayChecks<R>>() {
        let _ = checks.launch_at_startup.set_text(checked_label(
            TrayAction::ToggleLaunchAtStartup.label(),
            settings.launch_at_startup,
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_matches_the_spec_order_and_labels() {
        let labels: Vec<_> = TrayAction::ALL.iter().map(|a| a.label()).collect();
        assert_eq!(
            labels,
            [
                "Mở notch",
                "Command bar",
                "Ẩn notch tạm thời",
                "Cài đặt…",
                "Khởi động cùng Windows",
                "Thoát winbar"
            ]
        );
    }

    #[test]
    fn checked_labels_put_the_mark_last() {
        assert_eq!(
            checked_label("Ẩn notch tạm thời", true),
            "Ẩn notch tạm thời  ✓"
        );
        assert_eq!(
            checked_label("Ẩn notch tạm thời", false),
            "Ẩn notch tạm thời"
        );
    }

    #[test]
    fn ids_round_trip_and_are_unique() {
        for a in TrayAction::ALL {
            assert_eq!(TrayAction::from_id(a.id()), Some(a));
        }
        let mut ids: Vec<_> = TrayAction::ALL.iter().map(|a| a.id()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), TrayAction::ALL.len());
        assert_eq!(TrayAction::from_id("nope"), None);
    }
}
