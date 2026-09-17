mod hotkeys;
mod settings;
mod settings_window;
mod startup;
mod tray;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(startup::single_instance_plugin())
        .plugin(startup::autostart_plugin())
        .plugin(hotkeys::plugin())
        .manage(window::NotchState::default())
        .manage(hotkeys::HotkeyState::default())
        .invoke_handler(tauri::generate_handler![
            window::notch_layout,
            settings::get_settings,
            settings::update_settings,
            settings_window::open_settings,
            settings_window::quit_app,
            hotkeys::get_hotkey_status,
            hotkeys::retry_hotkey
        ])
        .setup(|app| {
            let settings = settings::SettingsState::load(app.handle())?;
            let initial = settings.get();
            app.manage(settings);
            hotkeys::apply(app.handle(), &initial.hotkeys.command_bar);
            startup::sync_autostart(app.handle(), initial.launch_at_startup);
            window::create(app.handle())?;
            tray::create(app.handle())?;
            window::watch_displays(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
