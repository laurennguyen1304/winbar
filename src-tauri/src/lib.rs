mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(window::NotchState::default())
        .invoke_handler(tauri::generate_handler![window::notch_layout])
        .setup(|app| {
            window::create(app.handle())?;
            window::watch_displays(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
