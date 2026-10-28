//! Whether Claude Code's own terminal still has a question up (SPEC-claude-approvals §4.4).
//!
//! Claude Code does not stop a `PermissionRequest` hook when the person answers in the terminal: the hook is only
//! cancelled with the whole turn. So for a request answered there, nothing reaches the pipe until the tool has
//! finished — which for a build is minutes. What does change at the moment of the answer is the file Claude Code
//! keeps for each running session, `<claude dir>/sessions/<pid>.json`: its `status` goes from `waiting` back to
//! `busy`.
//!
//! That file is not a documented format. Every field is optional here, anything unexpected reads as "don't know",
//! and "don't know" never takes a request off the notch: the worst a change in Claude Code can do is bring back
//! the wait this module exists to shorten. Only `sessionId` and `status` are read; nothing is kept or logged.

use std::io::Read;
use std::path::Path;

use serde::Deserialize;

/// A machine has a handful of sessions; more files than this is not that folder.
const MAX_FILES: usize = 64;
/// A session file is a few hundred bytes.
const MAX_BYTES: u64 = 64 * 1024;

#[derive(Deserialize)]
struct SessionFile {
    #[serde(default, rename = "sessionId")]
    session_id: String,
    #[serde(default)]
    status: String,
}

fn read(path: &Path) -> Option<SessionFile> {
    let mut text = String::new();
    std::fs::File::open(path)
        .ok()?
        .take(MAX_BYTES)
        .read_to_string(&mut text)
        .ok()?;
    serde_json::from_str(&text).ok()
}

/// Whether the terminal of `session` is waiting on its person: `Some(true)` when Claude Code says so,
/// `Some(false)` when it says the session is doing something else, `None` when it says nothing usable.
///
/// A session resumed in a second process leaves two files with one id; waiting in either counts.
pub fn waiting(claude_dir: &Path, session: &str) -> Option<bool> {
    let entries = std::fs::read_dir(claude_dir.join("sessions")).ok()?;
    let mut known = None;
    for entry in entries.flatten().take(MAX_FILES) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(file) = read(&path) else { continue };
        if file.session_id != session || file.status.is_empty() {
            continue;
        }
        if file.status == "waiting" {
            return Some(true);
        }
        known = Some(false);
    }
    known
}

/// Follows one request's session and says when its question was answered in the terminal.
///
/// The request can reach winbar a moment before Claude Code has written `waiting`, so "not waiting" alone means
/// nothing. Only having seen the terminal ask, and then seeing it no longer ask, does.
#[derive(Default)]
pub struct Watch {
    seen_waiting: bool,
}

impl Watch {
    /// Takes the latest reading; true once the terminal had its question up and no longer has.
    pub fn answered(&mut self, waiting: Option<bool>) -> bool {
        match waiting {
            Some(true) => {
                self.seen_waiting = true;
                false
            }
            Some(false) => self.seen_waiting,
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn claude_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("winbar-terminal-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sessions")).unwrap();
        dir
    }

    fn session_file(dir: &Path, name: &str, body: &str) {
        std::fs::write(dir.join("sessions").join(name), body).unwrap();
    }

    #[test]
    fn reads_what_claude_code_says_about_one_session() {
        let dir = claude_dir("reads");
        session_file(&dir, "100.json", r#"{"pid":100,"sessionId":"s1","status":"waiting","waitingFor":"approve Bash","cwd":"C:\\work"}"#);
        session_file(&dir, "200.json", r#"{"pid":200,"sessionId":"s2","status":"busy"}"#);
        session_file(&dir, "300.json", r#"{"pid":300,"sessionId":"s3","status":"idle"}"#);
        assert_eq!(waiting(&dir, "s1"), Some(true));
        assert_eq!(waiting(&dir, "s2"), Some(false));
        assert_eq!(waiting(&dir, "s3"), Some(false));
        assert_eq!(waiting(&dir, "nobody"), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn anything_it_cannot_read_is_dont_know() {
        let dir = claude_dir("unknown");
        // An older Claude Code: the file is there, the status is not.
        session_file(&dir, "100.json", r#"{"pid":100,"sessionId":"s1"}"#);
        session_file(&dir, "200.json", "not json");
        session_file(&dir, "300.json", r#"{"sessionId":"s3","status":7}"#);
        // The key file that sits next to each session, and anything else that is not a session file.
        session_file(&dir, "400.abc.key", r#"{"sessionId":"s4","status":"busy"}"#);
        for session in ["s1", "s2", "s3", "s4"] {
            assert_eq!(waiting(&dir, session), None, "{session}");
        }
        assert_eq!(waiting(&dir.join("no-such-folder"), "s1"), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_session_open_in_two_processes_is_waiting_if_either_is() {
        let dir = claude_dir("twice");
        session_file(&dir, "100.json", r#"{"sessionId":"s1","status":"idle"}"#);
        session_file(&dir, "200.json", r#"{"sessionId":"s1","status":"waiting"}"#);
        assert_eq!(waiting(&dir, "s1"), Some(true));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_a_question_that_was_up_and_is_gone_counts_as_answered() {
        // The request beat Claude Code's own write: still "busy" when it arrives.
        let mut watch = Watch::default();
        assert!(!watch.answered(Some(false)));
        assert!(!watch.answered(Some(true)));
        assert!(!watch.answered(Some(true)));
        // The file vanishing or turning unreadable for a moment is not an answer.
        assert!(!watch.answered(None));
        assert!(watch.answered(Some(false)));

        // A Claude Code that never says "waiting" never takes anything off the notch.
        let mut silent = Watch::default();
        for reading in [None, Some(false), None, Some(false)] {
            assert!(!silent.answered(reading));
        }
    }
}
