mod claude;
mod clipboard;
mod command_bar;
mod hotkeys;
mod http;
mod media;
mod settings;
mod settings_window;
mod startup;
mod sticky;
mod system;
mod tray;
mod update;
mod window;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(startup::single_instance_plugin())
        .plugin(startup::autostart_plugin())
        .plugin(hotkeys::plugin())
        // Dragging a picture out to another app needs a Windows drag, which WebView2 cannot start (SPEC-clipboard §5.5).
        .plugin(tauri_plugin_drag::init())
        .manage(window::NotchState::default())
        .manage(sticky::StickyState::default())
        .manage(media::MediaStore::default())
        .manage(system::SystemState::default())
        .manage(hotkeys::HotkeyState::default())
        .manage(command_bar::files::FileSearchState::default())
        .manage(command_bar::apps::AppsState::default())
        .manage(command_bar::icons::IconsState::default())
        .on_window_event(|window, event| {
            // Windows rescales a window when it lands on a screen with another DPI; put the notch back to its size.
            // The work is queued: touching the window inside tao's own event callback re-enters its window procedure.
            if matches!(event, tauri::WindowEvent::ScaleFactorChanged { .. })
                && window::is_notch_label(window.label())
            {
                let app = window.app_handle().clone();
                let handle = app.clone();
                let label = window.label().to_string();
                let _ = app.run_on_main_thread(move || {
                    if let Some(notch) = handle.get_webview_window(&label) {
                        let _ = window::reapply(&notch);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            window::notch_layout,
            sticky::notch_sticky,
            media::media_state,
            media::media_art,
            media::media_control,
            media::media_seek,
            media::media_select,
            system::system_stats,
            system::open_task_manager,
            claude::claude_sessions,
            claude::claude_open_desktop,
            claude::claude_usage,
            claude::claude_accounts,
            claude::claude_icons,
            clipboard::clipboard_list,
            clipboard::clipboard_text,
            clipboard::clipboard_thumb,
            clipboard::clipboard_copy,
            clipboard::clipboard_pin,
            clipboard::clipboard_remove,
            clipboard::clipboard_clear,
            clipboard::clipboard_pause,
            clipboard::clipboard_status,
            command_bar::command_bar_hide,
            command_bar::command_bar_resize,
            command_bar::command_bar_save_position,
            command_bar::actions::open_notch,
            command_bar::actions::notch_hidden,
            command_bar::actions::set_notch_hidden,
            command_bar::apps::list_apps,
            command_bar::apps::launch_app,
            command_bar::apps::reveal_app,
            command_bar::files::search_files,
            command_bar::files::file_search_status,
            command_bar::icons::shell_icons,
            command_bar::history::history_record,
            command_bar::history::history_list,
            command_bar::launch::open_path,
            command_bar::launch::open_terminal,
            command_bar::launch::open_url,
            command_bar::launch::reveal_path,
            settings::get_settings,
            settings::update_settings,
            settings_window::open_settings,
            settings_window::quit_app,
            hotkeys::get_hotkey_status,
            hotkeys::retry_hotkey,
            update::update_status,
            update::update_check,
            update::update_dismiss,
            update::update_open_changelog
        ])
        .setup(|app| {
            // Every piece of state a command needs is managed first. The windows are already alive by now, and a
            // page that calls before its state exists gets "state not managed" — seen in the dev log at startup.
            let settings = settings::SettingsState::load(app.handle())?;
            let initial = settings.get();
            app.manage(settings);
            app.manage(command_bar::history::HistoryState::load(app.handle())?);
            app.manage(clipboard::ClipboardState::load(app.handle())?);
            app.manage(claude::ClaudeState::load(app.handle())?);
            app.manage(update::UpdateState::load(app.handle())?);
            hotkeys::apply(app.handle(), &initial.hotkeys.command_bar);
            startup::sync_autostart(app.handle(), initial.launch_at_startup);
            window::sync_windows(app.handle()).map_err(|e| e.to_string())?;
            command_bar::create(app.handle())?;
            command_bar::apps::warm_up(app.handle());
            media::start(app.handle());
            claude::start(app.handle());
            clipboard::start(app.handle());
            update::start(app.handle());
            tray::create(app.handle())?;
            window::watch_displays(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Give the reserved strip back whichever way the app exits.
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                sticky::remove(app);
            }
        });
}
