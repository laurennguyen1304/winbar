mod command_bar;
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
        .manage(command_bar::files::FileSearchState::default())
        .manage(command_bar::apps::AppsState::default())
        .manage(command_bar::icons::IconsState::default())
        .invoke_handler(tauri::generate_handler![
            window::notch_layout,
            command_bar::command_bar_hide,
            command_bar::command_bar_resize,
            command_bar::command_bar_save_position,
            command_bar::apps::list_apps,
            command_bar::apps::launch_app,
            command_bar::apps::reveal_app,
            command_bar::files::search_files,
            command_bar::icons::shell_icons,
            command_bar::launch::open_path,
            command_bar::launch::open_url,
            command_bar::launch::reveal_path,
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
            command_bar::create(app.handle())?;
            command_bar::apps::warm_up(app.handle());
            tray::create(app.handle())?;
            window::watch_displays(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
