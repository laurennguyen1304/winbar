//! `winbar.exe --winbar-claude-hook`: what Claude Code runs on a hook event (SPEC-claude-approvals §4.2).
//!
//! Reads the hook's JSON from stdin, keeps the few fields winbar shows, and hands them to the running app over
//! the named pipe. This branch runs before anything of Tauri is set up: no window, no WebView, no settings.
//!
//! The one hard rule is that Claude Code is never held up:
//!
//! * no pipe means winbar is closed — exit at once, print nothing;
//! * every step runs on a worker thread against a deadline the main thread enforces, so a pipe that accepts the
//!   connection and then goes quiet cannot wedge the session either;
//! * only a permission request waits, and only an exact `allow` or `deny` is ever printed. Silence is the safe
//!   answer: Claude Code keeps asking in the terminal as if winbar were not there.
//!
//! Nothing is logged here. Claude Code shows a hook's stderr to the user, and the hook's input is a tool call.

use std::io::{Read, Write};
use std::sync::mpsc;
use std::time::Duration;

use super::protocol::{self, decision_json};

/// The argument that selects this branch in `main`.
pub const FLAG: &str = "--winbar-claude-hook";

/// Budget for getting a pipe connection. Past this Claude Code wins, always.
#[cfg(windows)]
const CONNECT: Duration = Duration::from_millis(300);
/// Whole-run budget for an event nobody waits on: read stdin, connect, write.
const QUICK: Duration = Duration::from_millis(1300);
/// How long a permission request may wait. A little over the server's own limit, so the server answers first.
const DECISION: Duration = Duration::from_secs(305);
/// Claude Code's hook input is a few kilobytes; a `Write` of a large file can reach megabytes.
const MAX_STDIN: u64 = 8 * 1024 * 1024;

enum Progress {
    /// The request is with winbar; the long wait may begin.
    Waiting,
    Done(Option<String>),
}

/// Runs the relay and returns the process exit code — always 0: any other code makes Claude Code report a hook
/// error for something that is never its concern.
pub fn run() -> i32 {
    let (progress, events) = mpsc::channel();
    // The worker owns every blocking call. If it overruns, the main thread stops listening and the process
    // exits, which takes the pipe handle with it.
    std::thread::spawn(move || {
        let answer = talk(&progress);
        let _ = progress.send(Progress::Done(answer));
    });

    let mut budget = QUICK;
    loop {
        match events.recv_timeout(budget) {
            Ok(Progress::Waiting) => budget = DECISION,
            Ok(Progress::Done(Some(answer))) => {
                if let Some(json) = decision_json(&answer) {
                    let mut out = std::io::stdout().lock();
                    let _ = writeln!(out, "{json}");
                    let _ = out.flush();
                }
                break;
            }
            Ok(Progress::Done(None)) | Err(_) => break,
        }
    }
    0
}

#[cfg(windows)]
fn talk(progress: &mpsc::Sender<Progress>) -> Option<String> {
    use super::pipe;

    let mut raw = Vec::new();
    std::io::stdin()
        .lock()
        .take(MAX_STDIN)
        .read_to_end(&mut raw)
        .ok()?;
    let message = protocol::from_hook(&raw)?;
    let line = protocol::to_line(&message)?;

    let mut client = pipe::connect(&pipe::pipe_name()?, CONNECT)?;
    if !client.send(line.as_bytes()) || !message.waits_for_answer() {
        return None;
    }
    let _ = progress.send(Progress::Waiting);
    client.read_answer()
}

#[cfg(not(windows))]
fn talk(_progress: &mpsc::Sender<Progress>) -> Option<String> {
    let mut raw = Vec::new();
    let _ = std::io::stdin()
        .lock()
        .take(MAX_STDIN)
        .read_to_end(&mut raw);
    let _ = protocol::from_hook(&raw);
    None
}
