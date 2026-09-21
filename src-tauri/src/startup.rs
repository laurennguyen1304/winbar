//! Single instance and start-with-Windows (SPEC §2, criterion 7).

use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use crate::{settings_window, tray, window};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutostartChange {
    Enable,
    Disable,
    None,
}

/// What to do with the Windows "Run" entry so it matches the setting.
pub fn autostart_change(wanted: bool, registered: bool) -> AutostartChange {
    match (wanted, registered) {
        (true, false) => AutostartChange::Enable,
        (false, true) => AutostartChange::Disable,
        _ => AutostartChange::None,
    }
}

/// Registering autostart points Windows at the running executable. Only release builds do it, so a dev run never
/// adds `target\debug\winbar.exe` to the user's login items.
pub const REGISTER_AUTOSTART: bool = cfg!(not(debug_assertions));

pub fn autostart_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None)
}

/// Makes the Windows login item match `launch_at_startup`.
pub fn sync_autostart<R: Runtime>(app: &AppHandle<R>, launch_at_startup: bool) {
    let launcher = app.autolaunch();
    let registered = match launcher.is_enabled() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("winbar autostart: cannot read state: {e}");
            return;
        }
    };
    let change = autostart_change(launch_at_startup, registered);
    if change == AutostartChange::None {
        return;
    }
    if !REGISTER_AUTOSTART {
        eprintln!(
            "winbar autostart: dev build, not changing Windows login items ({change:?} skipped)"
        );
        return;
    }
    let result = match change {
        AutostartChange::Enable => launcher.enable(),
        AutostartChange::Disable => launcher.disable(),
        AutostartChange::None => Ok(()),
    };
    if let Err(e) = result {
        eprintln!("winbar autostart: {change:?} failed: {e}");
    }
}

/// Must be the first plugin: a second launch hands over to the running app and exits before anything else starts.
pub fn single_instance_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_single_instance::init(|app, _args, _cwd| {
        eprintln!("winbar: second launch, showing the running instance");
        on_second_launch(app);
    })
}

/// A second launch brings the running app forward: the notch comes back if it was hidden and Settings opens.
fn on_second_launch<R: Runtime>(app: &AppHandle<R>) {
    if window::is_hidden(app) {
        if let Err(e) = window::set_hidden(app, false) {
            eprintln!("winbar: cannot show notch: {e}");
        }
        tray::sync_hidden(app, false);
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = settings_window::open_settings(app).await {
            eprintln!("winbar: cannot open settings: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_changes_the_login_item_when_it_differs() {
        assert_eq!(autostart_change(true, false), AutostartChange::Enable);
        assert_eq!(autostart_change(false, true), AutostartChange::Disable);
        assert_eq!(autostart_change(true, true), AutostartChange::None);
        assert_eq!(autostart_change(false, false), AutostartChange::None);
    }

    #[test]
    fn dev_builds_never_register_autostart() {
        assert_eq!(REGISTER_AUTOSTART, !cfg!(debug_assertions));
    }
}
