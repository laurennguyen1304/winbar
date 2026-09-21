//! Media module (SPEC-media): Windows media sessions → `media-changed` events and commands for the media widget.

pub mod art;
pub mod model;
#[cfg(windows)]
mod session;

use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime};

use model::{Action, MediaState};

pub const CHANGED_EVENT: &str = "media-changed";

/// Longest a command waits for the media thread (a WinRT call to a hung app).
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);

/// Wakes the media thread.
#[derive(Debug)]
pub enum Wake {
    /// Something about a session changed: rebuild the state.
    Changed,
    /// The session list changed: re-subscribe, then rebuild.
    SessionsChanged,
    /// Windows picked another current session: drop the user's manual pick (§5.3).
    SystemPickChanged,
    /// A command from the widget, answered on `reply`.
    Control(Action, Sender<Result<(), String>>),
}

#[derive(Default)]
pub struct MediaStore {
    state: Mutex<MediaState>,
    /// Session id the user picked in the card; `None` follows Windows.
    manual: Mutex<Option<String>>,
    wake: Mutex<Option<Sender<Wake>>>,
    /// Artwork of the current track: its track key and PNG data URL (`None` when the app has none).
    art: Mutex<Option<(String, Option<String>)>>,
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

    /// Keeps the artwork of `track_key`, reading it with `read` only when the track changed.
    pub fn cache_art(&self, track_key: &str, read: impl FnOnce() -> Option<String>) {
        let Ok(mut art) = self.art.lock() else {
            return;
        };
        if art.as_ref().is_some_and(|(key, _)| key == track_key) {
            return;
        }
        *art = Some((track_key.to_string(), read()));
    }

    fn art_for(&self, track_key: &str) -> Option<String> {
        let art = self.art.lock().ok()?;
        art.as_ref()
            .filter(|(key, _)| key == track_key)
            .and_then(|(_, url)| url.clone())
    }

    pub fn set_wake(&self, tx: Sender<Wake>) {
        if let Ok(mut w) = self.wake.lock() {
            *w = Some(tx);
        }
    }

    /// Runs `action` on the media thread and waits for its answer.
    fn request(&self, action: Action) -> Result<(), String> {
        let wake = self
            .wake
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("media is not ready yet")?;
        let (reply, answer) = channel();
        wake.send(Wake::Control(action, reply))
            .map_err(|_| "media thread stopped".to_string())?;
        answer
            .recv_timeout(REPLY_TIMEOUT)
            .map_err(|_| "the media app did not answer".to_string())?
    }
}

/// Blocking request off the async runtime's worker threads.
async fn run_request<R: Runtime>(app: AppHandle<R>, action: Action) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<MediaStore>().request(action))
        .await
        .map_err(|e| e.to_string())?
}

/// `playPause`, `next` or `previous` on the shown session (SPEC-media §6.2).
#[tauri::command]
pub async fn media_control<R: Runtime>(app: AppHandle<R>, action: String) -> Result<(), String> {
    let action = Action::parse(&action).ok_or_else(|| format!("unknown media action {action}"))?;
    run_request(app, action).await
}

/// Seeks the shown session to `position_ms` from the start of the track.
#[tauri::command]
pub async fn media_seek<R: Runtime>(app: AppHandle<R>, position_ms: u64) -> Result<(), String> {
    run_request(app, Action::Seek(position_ms)).await
}

/// Shows this session instead of Windows' pick; `null` follows Windows again (§5.3).
#[tauri::command]
pub async fn media_select<R: Runtime>(
    app: AppHandle<R>,
    session_id: Option<String>,
) -> Result<(), String> {
    run_request(app, Action::Select(session_id)).await
}

/// Current state, for the widget when it mounts.
#[tauri::command]
pub fn media_state(store: tauri::State<'_, MediaStore>) -> MediaState {
    store.state.lock().map(|s| s.clone()).unwrap_or_default()
}

/// Artwork of the track with this key as a PNG data URL; `null` when the app has none or the track changed since.
#[tauri::command]
pub fn media_art(store: tauri::State<'_, MediaStore>, track_key: String) -> Option<String> {
    store.art_for(&track_key)
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
    // Position reports the page already estimates keep the old anchor, so the estimate stays consistent.
    if *state == next || model::is_timeline_drift(&state, &next) {
        return;
    }
    *state = next.clone();
    drop(state);
    if let Err(e) = app.emit(CHANGED_EVENT, next) {
        eprintln!("winbar media: emit failed: {e}");
    }
}
