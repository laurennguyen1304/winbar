//! Media module (SPEC-media): Windows media sessions → `media-changed` events and commands for the media widget.

pub mod model;
#[cfg(windows)]
mod session;

use std::sync::mpsc::Sender;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime};

use model::MediaState;

pub const CHANGED_EVENT: &str = "media-changed";

/// Wakes the media thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Wake {
    /// Something about a session changed: rebuild the state.
    Changed,
    /// The session list changed: re-subscribe, then rebuild.
    SessionsChanged,
    /// Windows picked another current session: drop the user's manual pick (§5.3).
    SystemPickChanged,
}

#[derive(Default)]
pub struct MediaStore {
    state: Mutex<MediaState>,
    /// Session id the user picked in the card; `None` follows Windows.
    manual: Mutex<Option<String>>,
    wake: Mutex<Option<Sender<Wake>>>,
}

impl MediaStore {
    pub fn manual(&self) -> Option<String> {
        self.manual.lock().ok().and_then(|m| m.clone())
    }

    pub fn set_manual(&self, id: Option<String>) {
        if let Ok(mut m) = self.manual.lock() {
            *m = id;
        }
    }

    pub fn set_wake(&self, tx: Sender<Wake>) {
        if let Ok(mut w) = self.wake.lock() {
            *w = Some(tx);
        }
    }
}

/// Current state, for the widget when it mounts.
#[tauri::command]
pub fn media_state(store: tauri::State<'_, MediaStore>) -> MediaState {
    store.state.lock().map(|s| s.clone()).unwrap_or_default()
}

/// Starts watching Windows media sessions in the background.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    session::spawn(app.clone());
    #[cfg(not(windows))]
    let _ = app;
}

/// Stores `next` and tells every window, unless nothing changed.
fn publish<R: Runtime>(app: &AppHandle<R>, next: MediaState) {
    let store = app.state::<MediaStore>();
    let Ok(mut state) = store.state.lock() else {
        return;
    };
    if *state == next {
        return;
    }
    *state = next.clone();
    drop(state);
    if let Err(e) = app.emit(CHANGED_EVENT, next) {
        eprintln!("winbar media: emit failed: {e}");
    }
}
