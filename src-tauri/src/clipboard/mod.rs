//! Clipboard history (SPEC-clipboard): the last 50 copies of the day, text and pictures, searchable and pinnable —
//! minus everything that looks sensitive.
//!
//! The watcher owns a message-only window on its own thread instead of riding on a notch window: notch windows come
//! and go when screens change (SPEC-notch-shell §16), and a clipboard listener must not blink with them.
//!
//! **Nothing here ever logs or emits clipboard content** (SPEC §5.4, §13). Events carry ids and counts; the text of
//! an item leaves Rust only when the card asks for that one item by id.

mod image;
mod model;
mod native;
mod secrets;
mod store;

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use model::{ClipItem, ClipKind, ImageRef, StoredItem};
use store::Store;

/// Registered clipboard formats a source uses to say "do not keep this" (SPEC §5.4 lớp 1).
const EXCLUDE_FROM_HISTORY: &str = "ExcludeClipboardContentFromMonitorProcessing";
const CAN_INCLUDE_IN_HISTORY: &str = "CanIncludeInClipboardHistory";
const CAN_UPLOAD_TO_CLOUD: &str = "CanUploadToCloudClipboard";

/// The list changed: new item, removal, or a pin.
pub const CHANGED: &str = "clipboard-changed";
/// A copy was deliberately not kept. Carries why, never what.
pub const SKIPPED: &str = "clipboard-skipped";

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    #[default]
    Empty,
    Text,
    Image,
    /// Copied files. Out of scope (bạn chốt "chỉ chữ và ảnh"), reported so the card can stay quiet about them.
    Files,
    Other,
}

/// What one clipboard change looked like. Shape only — never the content itself.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sighting {
    /// Windows' own clipboard counter; changes once per copy.
    pub seq: u32,
    pub kind: Kind,
    /// Characters for text, bytes for anything else.
    pub size: usize,
    /// File stem of the app that copied, e.g. `chrome`.
    pub owner: Option<String>,
    /// The source asked clipboard history tools to skip this.
    pub private: bool,
    /// Which formats were on offer. Useful when a copy does not show up as expected.
    pub formats: Vec<String>,
}

/// Why a copy was not kept.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Skip {
    /// The source marked it private (lớp 1).
    AppFlag,
    /// It looks like a key or a password (lớp 2).
    Secret,
    /// The app is on the ignore list (lớp 3).
    IgnoredApp,
    /// Recording is paused (lớp 4).
    Paused,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkipEvent {
    reason: Skip,
}

pub struct ClipboardState {
    store: Mutex<Store>,
    /// The last change seen, for diagnosing "why did my copy not show up".
    last: Mutex<Option<Sighting>>,
}

impl ClipboardState {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        let dir = app.path().config_dir()?.join("winbar").join("clipboard");
        Ok(ClipboardState {
            store: Mutex::new(Store::open(dir)),
            last: Mutex::new(None),
        })
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Starts watching the clipboard. Safe to call once at startup; does nothing off Windows.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    native::watch(move |capture| {
        if let Some(state) = app.try_state::<ClipboardState>() {
            if let Ok(mut last) = state.last.lock() {
                *last = Some(capture.sighting.clone());
            }
        }
        match keep(&app, capture) {
            Ok(Some(())) => {
                let _ = app.emit(CHANGED, ());
            }
            Ok(None) => {}
            Err(reason) => {
                let _ = app.emit(SKIPPED, SkipEvent { reason });
            }
        }
    });
}

/// Stores one capture, or says which layer turned it away (SPEC §5.4).
fn keep<R: Runtime>(app: &AppHandle<R>, capture: native::Capture) -> Result<Option<()>, Skip> {
    let settings = app
        .state::<crate::settings::SettingsState>()
        .get()
        .clipboard;
    if settings.paused {
        return Err(Skip::Paused);
    }
    if capture.sighting.private {
        return Err(Skip::AppFlag);
    }
    if let Some(owner) = &capture.sighting.owner {
        let owner = owner.to_lowercase();
        if settings.ignored_apps.iter().any(|app| owner.contains(app)) {
            return Err(Skip::IgnoredApp);
        }
    }

    let at = now_ms();
    let id = format!("{at:x}-{:x}", capture.sighting.seq);
    let stored = match (&capture.text, &capture.dib) {
        (Some(text), _) => {
            if text.trim().is_empty() {
                return Ok(None);
            }
            if secrets::looks_secret(text) {
                return Err(Skip::Secret);
            }
            let (kept, truncated) = model::store_text(text);
            StoredItem {
                item: ClipItem {
                    id,
                    kind: model::classify(&kept),
                    preview: model::preview(&kept),
                    at,
                    pinned: false,
                    app: capture.sighting.owner.clone(),
                    image: None,
                    truncated,
                },
                text: Some(kept),
            }
        }
        (None, Some(dib)) => {
            let state = app.state::<ClipboardState>();
            // Only the two paths are read under the lock: turning a DIB into a PNG takes long enough that holding
            // the history meanwhile would block the card, and the lock is taken again further down.
            let (full, thumb) = {
                let Ok(store) = state.store.lock() else {
                    eprintln!("winbar clipboard: the history is locked; this copy is not kept");
                    return Ok(None);
                };
                (
                    store.images_dir().join(format!("{id}.png")),
                    store.thumbs_dir().join(format!("{id}.png")),
                )
            };
            let Ok((width, height)) = save_image(dib, &full, &thumb) else {
                return Ok(None);
            };
            StoredItem {
                item: ClipItem {
                    id,
                    kind: ClipKind::Image,
                    preview: format!("Ảnh {width}×{height}"),
                    at,
                    pinned: false,
                    app: capture.sighting.owner.clone(),
                    image: Some(ImageRef {
                        width,
                        height,
                        path: full.to_string_lossy().into_owned(),
                        thumb: thumb.to_string_lossy().into_owned(),
                    }),
                    truncated: false,
                },
                text: None,
            }
        }
        // Copied files and everything else: nothing to keep.
        _ => return Ok(None),
    };

    let state = app.state::<ClipboardState>();
    let Ok(mut store) = state.store.lock() else {
        eprintln!("winbar clipboard: the history is locked; this copy is not kept");
        return Ok(None);
    };
    store.insert(stored);
    store.prune(at, u64::from(settings.retention_days) * DAY_MS);
    if let Err(e) = store.save() {
        eprintln!("winbar clipboard: cannot save the history: {e}");
    }
    Ok(Some(()))
}

#[cfg(windows)]
fn save_image(
    dib: &[u8],
    full: &std::path::Path,
    thumb: &std::path::Path,
) -> Result<(u32, u32), String> {
    image::save_png(dib, full, thumb)
}

#[cfg(not(windows))]
fn save_image(_: &[u8], _: &std::path::Path, _: &std::path::Path) -> Result<(u32, u32), String> {
    Err("pictures need Windows".into())
}

/// The history, newest first.
#[tauri::command]
pub fn clipboard_list(state: tauri::State<'_, ClipboardState>) -> Result<Vec<ClipItem>, String> {
    Ok(state.store.lock().map_err(|e| e.to_string())?.list())
}

/// The thumbnail of one picture, as a PNG data URL. Sent per item rather than with the whole list, which would
/// carry a megabyte of pictures for a full history.
#[tauri::command]
pub fn clipboard_thumb(
    state: tauri::State<'_, ClipboardState>,
    id: String,
) -> Result<String, String> {
    let path = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .find(&id)
        .and_then(|s| s.item.image.as_ref().map(|i| i.thumb.clone()))
        .ok_or_else(|| format!("no picture for item {id}"))?;
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read {path}: {e}"))?;
    Ok(crate::command_bar::icons::data_url(&bytes))
}

/// The full text of one item, for copying or dragging it out.
#[tauri::command]
pub fn clipboard_text(
    state: tauri::State<'_, ClipboardState>,
    id: String,
) -> Result<String, String> {
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .find(&id)
        .and_then(|s| s.text.clone())
        .ok_or_else(|| format!("no text for item {id}"))
}

/// Puts an item back on the clipboard.
#[tauri::command]
pub fn clipboard_copy(state: tauri::State<'_, ClipboardState>, id: String) -> Result<(), String> {
    let stored = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .find(&id)
        .cloned()
        .ok_or_else(|| format!("no item {id}"))?;
    match (&stored.text, &stored.item.image) {
        (Some(text), _) => native::set_text(text),
        (None, Some(image)) => copy_image(&image.path),
        _ => Err(format!("nothing to copy for item {id}")),
    }
}

#[cfg(windows)]
fn copy_image(path: &str) -> Result<(), String> {
    native::set_image(&image::png_to_dib(std::path::Path::new(path))?)
}

#[cfg(not(windows))]
fn copy_image(_: &str) -> Result<(), String> {
    Err("pictures need Windows".into())
}

#[tauri::command]
pub fn clipboard_pin<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClipboardState>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        if !store.set_pinned(&id, pinned) {
            return Err(format!("no item {id}"));
        }
        store.save()?;
    }
    let _ = app.emit(CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn clipboard_remove<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClipboardState>,
    id: String,
) -> Result<(), String> {
    {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        if store.remove(std::slice::from_ref(&id)) == 0 {
            return Err(format!("no item {id}"));
        }
        store.save()?;
    }
    let _ = app.emit(CHANGED, ());
    Ok(())
}

/// Empties the history except for pinned items; returns how many went.
#[tauri::command]
pub fn clipboard_clear<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClipboardState>,
) -> Result<usize, String> {
    let gone = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        let gone = store.clear();
        store.save()?;
        gone
    };
    let _ = app.emit(CHANGED, ());
    Ok(gone)
}

/// Turns recording off or back on. The choice lives in the settings file, so it survives a restart (SPEC §5.4 lớp 4).
#[tauri::command]
pub fn clipboard_pause<R: Runtime>(app: AppHandle<R>, paused: bool) -> Result<(), String> {
    let state = app.state::<crate::settings::SettingsState>();
    let mut settings = serde_json::to_value(state.get()).map_err(|e| e.to_string())?;
    settings["clipboard"]["paused"] = serde_json::Value::Bool(paused);
    crate::settings::apply(&app, &state, &settings)?;
    Ok(())
}

/// Whether recording is paused, and the last change seen — enough to explain a copy that did not appear.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub paused: bool,
    pub last: Option<Sighting>,
}

#[tauri::command]
pub fn clipboard_status<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClipboardState>,
) -> Result<Status, String> {
    Ok(Status {
        paused: app
            .state::<crate::settings::SettingsState>()
            .get()
            .clipboard
            .paused,
        last: state.last.lock().map_err(|e| e.to_string())?.clone(),
    })
}

/// Which kind of item these formats add up to. Text wins over image because apps that copy a picture from a page
/// usually offer its URL as text too, and the picture is the thing the user meant when *only* a picture is on offer.
pub fn kind_for(formats: &[String]) -> Kind {
    let has = |name: &str| formats.iter().any(|f| f == name);
    if has("CF_UNICODETEXT") || has("CF_TEXT") {
        Kind::Text
    } else if has("CF_DIB") || has("CF_DIBV5") || has("CF_BITMAP") || has("PNG") {
        Kind::Image
    } else if has("CF_HDROP") {
        Kind::Files
    } else if formats.is_empty() {
        Kind::Empty
    } else {
        Kind::Other
    }
}

/// True when the source marked this copy as not for clipboard history.
/// `zero_valued` holds the names of DWORD formats whose value is 0, i.e. an explicit "no".
pub fn is_private(formats: &[String], zero_valued: &[String]) -> bool {
    formats.iter().any(|f| f == EXCLUDE_FROM_HISTORY)
        || zero_valued
            .iter()
            .any(|f| f == CAN_INCLUDE_IN_HISTORY || f == CAN_UPLOAD_TO_CLOUD)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn plain_text_is_text() {
        assert_eq!(
            kind_for(&names(&["CF_UNICODETEXT", "CF_TEXT", "CF_LOCALE"])),
            Kind::Text
        );
    }

    #[test]
    fn a_picture_alone_is_an_image() {
        assert_eq!(
            kind_for(&names(&["CF_DIB", "CF_DIBV5", "PNG"])),
            Kind::Image
        );
    }

    #[test]
    fn copied_files_are_files() {
        assert_eq!(kind_for(&names(&["CF_HDROP"])), Kind::Files);
    }

    #[test]
    fn a_picture_copied_with_its_markup_still_counts_as_text() {
        // Copying a picture inside a web page also offers HTML and its URL; the user copied a selection, not a file.
        assert_eq!(
            kind_for(&names(&["CF_UNICODETEXT", "HTML Format", "CF_DIB"])),
            Kind::Text
        );
    }

    #[test]
    fn an_empty_clipboard_is_empty() {
        assert_eq!(kind_for(&[]), Kind::Empty);
        assert_eq!(kind_for(&names(&["FileGroupDescriptorW"])), Kind::Other);
    }

    #[test]
    fn password_managers_are_skipped() {
        assert!(is_private(
            &names(&["CF_UNICODETEXT", EXCLUDE_FROM_HISTORY]),
            &[]
        ));
        assert!(is_private(
            &names(&["CF_UNICODETEXT", CAN_INCLUDE_IN_HISTORY]),
            &names(&[CAN_INCLUDE_IN_HISTORY])
        ));
        assert!(is_private(
            &names(&["CF_UNICODETEXT", CAN_UPLOAD_TO_CLOUD]),
            &names(&[CAN_UPLOAD_TO_CLOUD])
        ));
    }

    #[test]
    fn an_allowed_copy_is_not_private() {
        // The same formats with a value of 1 mean "yes, you may keep it".
        assert!(!is_private(
            &names(&["CF_UNICODETEXT", CAN_INCLUDE_IN_HISTORY]),
            &[]
        ));
        assert!(!is_private(&names(&["CF_UNICODETEXT"]), &[]));
    }

    #[test]
    fn a_skip_event_says_why_and_not_what() {
        let json = serde_json::to_string(&SkipEvent {
            reason: Skip::Secret,
        })
        .expect("serialises");
        assert_eq!(json, r#"{"reason":"secret"}"#);
    }
}
