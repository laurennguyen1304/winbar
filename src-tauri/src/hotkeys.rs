//! Global hotkeys (SPEC §2, criterion 8). `Ctrl+Space` is reserved for the command bar: pressing it opens the
//! command bar or brings it forward. When another app already holds the key, the failure is kept as a status the Settings
//! window shows instead of failing silently.

use std::str::FromStr;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const HOTKEY_STATUS_EVENT: &str = "hotkey-status";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum HotkeyProblem {
    /// The text is not a valid shortcut, e.g. "Ctrl+".
    Invalid,
    /// Another app registered the same shortcut first (e.g. yasb Quick Launch).
    InUse,
    /// Any other registration error.
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    pub accelerator: String,
    pub registered: bool,
    pub problem: Option<HotkeyProblem>,
    pub message: Option<String>,
}

impl HotkeyStatus {
    fn ok(accelerator: &str) -> Self {
        HotkeyStatus {
            accelerator: accelerator.into(),
            registered: true,
            problem: None,
            message: None,
        }
    }

    fn failed(accelerator: &str, problem: HotkeyProblem, message: String) -> Self {
        HotkeyStatus {
            accelerator: accelerator.into(),
            registered: false,
            problem: Some(problem),
            message: Some(message),
        }
    }
}

pub fn parse(accelerator: &str) -> Result<Shortcut, String> {
    let text = accelerator.trim();
    if text.is_empty() {
        return Err("empty shortcut".into());
    }
    Shortcut::from_str(text).map_err(|e| e.to_string())
}

/// Maps a registration error from the plugin to what the user should do about it.
pub fn classify(message: &str) -> HotkeyProblem {
    if message.to_ascii_lowercase().contains("already registered") {
        HotkeyProblem::InUse
    } else {
        HotkeyProblem::Failed
    }
}

#[derive(Default)]
pub struct HotkeyState {
    current: Mutex<Option<(Shortcut, HotkeyStatus)>>,
}

/// Plugin with the press handler: only the currently registered command-bar shortcut opens the command bar.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let is_command_bar = app
                .try_state::<HotkeyState>()
                .and_then(|s| {
                    s.current
                        .lock()
                        .ok()
                        .and_then(|c| c.as_ref().map(|(sc, _)| sc == shortcut))
                })
                .unwrap_or(false);
            if is_command_bar {
                eprintln!("winbar hotkey: command bar ({shortcut})");
                crate::command_bar::open(app);
            }
        })
        .build()
}

/// (Re)registers the command-bar shortcut, replacing the previous one, and broadcasts the result.
pub fn apply<R: Runtime>(app: &AppHandle<R>, accelerator: &str) -> HotkeyStatus {
    let state = app.state::<HotkeyState>();
    let mut current = match state.current.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    if let Some((previous, status)) = current.as_ref() {
        if status.registered {
            let _ = app.global_shortcut().unregister(*previous);
        }
    }

    let status = match parse(accelerator) {
        Err(e) => {
            *current = None;
            HotkeyStatus::failed(accelerator, HotkeyProblem::Invalid, e)
        }
        Ok(shortcut) => {
            let status = match app.global_shortcut().register(shortcut) {
                Ok(()) => HotkeyStatus::ok(accelerator),
                Err(e) => {
                    let message = e.to_string();
                    HotkeyStatus::failed(accelerator, classify(&message), message)
                }
            };
            *current = Some((shortcut, status.clone()));
            status
        }
    };
    drop(current);
    if let Some(message) = &status.message {
        eprintln!("winbar hotkey: {accelerator}: {message}");
    }
    let _ = app.emit(HOTKEY_STATUS_EVENT, &status);
    status
}

/// Gives every shortcut back to Windows (called before quitting).
pub fn release<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = app.global_shortcut().unregister_all() {
        eprintln!("winbar hotkey: releasing shortcuts failed: {e}");
    }
}

#[tauri::command]
pub fn get_hotkey_status(state: tauri::State<'_, HotkeyState>) -> Option<HotkeyStatus> {
    state
        .current
        .lock()
        .ok()
        .and_then(|c| c.as_ref().map(|(_, s)| s.clone()))
}

/// Tries the stored shortcut again, e.g. after the user freed it in another app.
#[tauri::command]
pub fn retry_hotkey<R: Runtime>(app: AppHandle<R>) -> HotkeyStatus {
    let accelerator = app
        .state::<crate::settings::SettingsState>()
        .get()
        .hotkeys
        .command_bar;
    apply(&app, &accelerator)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_default_and_common_shortcuts() {
        for text in [
            "Ctrl+Space",
            "ctrl+space",
            "Alt+Space",
            "CommandOrControl+Shift+K",
            // Every form the Settings recorder (src/settings/accelerator.ts) produces.
            "Ctrl+Alt+Shift+K",
            "Alt+3",
            "Ctrl+Super+Up",
            "F9",
            "Ctrl+Backquote",
            "Ctrl+PageDown",
            " Ctrl+Space ",
        ] {
            assert!(parse(text).is_ok(), "{text}");
        }
        assert_eq!(
            parse("Ctrl+Space").unwrap(),
            parse("control+space").unwrap()
        );
    }

    #[test]
    fn rejects_invalid_shortcuts() {
        for text in ["", "   ", "Ctrl+", "Ctrl+NotAKey", "Space+Ctrl+Space"] {
            assert!(parse(text).is_err(), "{text:?} should be invalid");
        }
    }

    #[test]
    fn classifies_registration_errors() {
        assert_eq!(
            classify("HotKey already registered: HotKey { mods: CONTROL, key: Space, id: 1 }"),
            HotkeyProblem::InUse
        );
        assert_eq!(
            classify("Unable to register hotkey: Access is denied."),
            HotkeyProblem::Failed
        );
    }

    #[test]
    fn status_serializes_for_the_frontend() {
        let s = HotkeyStatus::failed("Ctrl+Space", HotkeyProblem::InUse, "taken".into());
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            serde_json::json!({ "accelerator": "Ctrl+Space", "registered": false, "problem": "in-use", "message": "taken" })
        );
    }
}
