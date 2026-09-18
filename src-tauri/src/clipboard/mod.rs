//! Clipboard history (SPEC-clipboard).
//!
//! Task 1 is a spike: it only watches the clipboard and reports the *shape* of each change — kind, size, which app
//! put it there, and whether that app asked history tools to skip it. Nothing is stored and **no content is ever
//! logged or emitted** (SPEC §5.4, §13); Task 2 adds the store on top of this.
//!
//! The watcher owns a message-only window on its own thread instead of riding on a notch window: notch windows come
//! and go when screens change (SPEC-notch-shell §16), and a clipboard listener must not blink with them.

mod native;

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Registered clipboard formats a source uses to say "do not keep this" (SPEC §5.4 lớp 1).
const EXCLUDE_FROM_HISTORY: &str = "ExcludeClipboardContentFromMonitorProcessing";
const CAN_INCLUDE_IN_HISTORY: &str = "CanIncludeInClipboardHistory";
const CAN_UPLOAD_TO_CLOUD: &str = "CanUploadToCloudClipboard";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    #[default]
    Empty,
    Text,
    Image,
    /// Copied files. Out of scope (bạn chốt "chỉ chữ và ảnh"), reported so the spike can see how often it happens.
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
    /// Format names, spike only: shows Task 2 what is actually on offer.
    pub formats: Vec<String>,
}

#[derive(Default)]
pub struct ClipboardProbe {
    last: Mutex<Option<Sighting>>,
}

/// The last clipboard change seen, for the Task 1 checks.
#[tauri::command]
pub fn clipboard_probe(state: tauri::State<'_, ClipboardProbe>) -> Option<Sighting> {
    state.last.lock().ok()?.clone()
}

/// Starts watching the clipboard. Safe to call once at startup; does nothing off Windows.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    native::watch(move |sighting| {
        if let Some(state) = app.try_state::<ClipboardProbe>() {
            if let Ok(mut last) = state.last.lock() {
                *last = Some(sighting.clone());
            }
        }
        let _ = app.emit("clipboard-sighting", sighting);
    });
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
        assert_eq!(kind_for(&names(&["CF_DIB", "CF_DIBV5", "PNG"])), Kind::Image);
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
}
