//! Claude layout (SPEC-claude): which sessions are alive and how much of the limit is left.
//!
//! **Read-only.** Nothing here writes to `~/.claude`, installs a hook, or holds up a session. The data is files the
//! machine already has plus one read-only endpoint.
//!
//! Log lines carry counts and error kinds only — never a path, a session title, or a token (SPEC §9).

mod accounts;
mod icons;
mod model;
mod sessions;
mod usage;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, Runtime};

pub use model::Session;
pub use usage::Usage;

/// The live list changed: a session started, ended, or moved to another phase.
///
/// The event is empty on purpose. Sending the list along looks like it should save the page a read, and it was
/// tried and measured: +0,10 points of CPU against +0,09 for the empty event. The second read is not what this
/// costs, so the page still asks for the list itself.
pub const SESSIONS_CHANGED: &str = "claude-sessions-changed";

/// How often the watcher looks while something is happening. The owner's trade, twice over: two seconds on
/// 19/09 ("có độ trễ cũng được") and three on 21/09, to buy the last of the CPU criterion.
///
/// This lever only started working once the Desktop history scan left the background thread. Before that the
/// cost was a 157-file rescan on a timer of its own and the poll rate barely showed; now every pass is one
/// directory listing plus one read of a handful of small files, so the cost really does scale with this.
const WATCH_BUSY: Duration = Duration::from_secs(3);
/// …and while every session is idle. The owner asked for this trade (2026-09-19): a couple of seconds of delay is
/// fine, and a one-second loop is what made the layout cost 0.18 points of CPU while a session ran tools.
const WATCH_IDLE: Duration = Duration::from_secs(5);
/// Keep checking at the busy rate for this long after the last change, so a burst is not read at the idle rate.
const BUSY_FOR: Duration = Duration::from_secs(20);

/// Name, size and modified time of every state file — enough to notice a change without opening any of them.
///
/// The directory's own timestamp is not enough: a session changing phase rewrites its file in place, which leaves
/// the parent directory untouched. That is the change that matters most, since it is what the pill shows.
fn fingerprint(dir: &std::path::Path) -> Vec<(std::ffi::OsString, u64, u128)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<_> = entries
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                // Milliseconds, not seconds: a phase change rewrites the same file to the same length, and two
                // writes inside one second would otherwise look identical.
                .map_or(0, |d| d.as_millis());
            Some((entry.file_name(), meta.len(), modified))
        })
        .collect();
    out.sort();
    out
}

/// How long the Desktop history is reused before it is scanned again (SPEC-claude §4).
const HISTORY_TTL_MS: u64 = 60_000;

pub struct ClaudeState {
    /// The `.claude` directory, resolved once at startup: `CLAUDE_CONFIG_DIR` when set, else the one under the
    /// user's home. Resolved here rather than on every read, so the watcher never touches the environment.
    claude_dir: PathBuf,
    /// Claude Code's `.claude.json`, read for the active account's id only. Resolved once for the same reason.
    config_file: PathBuf,
    home: PathBuf,
    /// Where Orca keeps its worktrees, resolved once for the same reason.
    orca_root: String,
    appdata: PathBuf,
    /// Every account's usage from the account-switcher CLI, and when it was asked (§3.3b). Memory only: the list
    /// carries labels, which do not belong on disk. The lock is held while the CLI runs, so two callers never
    /// start it twice.
    accounts: Mutex<(u64, Option<Vec<accounts::AccountUsage>>)>,
    /// Last list handed out, so the watcher can tell a real change from a touched file.
    last: Mutex<Vec<Session>>,
    /// Desktop history and when it was read. Scanning it means parsing every session file the Desktop app has
    /// kept — 156 of them here — and it is history, so it does not need re-reading every time a live session
    /// changes phase. Measured: without this the watcher cost 2.2% CPU while a session was working.
    history: Mutex<(u64, Vec<Session>)>,
}

impl ClaudeState {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        let home = app.path().home_dir()?;
        Ok(ClaudeState {
            claude_dir: sessions::claude_dir(&home),
            config_file: sessions::config_file(&home),
            orca_root: sessions::orca_root(&home),
            home,
            appdata: app.path().config_dir()?,
            accounts: Mutex::new((0, None)),
            last: Mutex::new(Vec::new()),
            history: Mutex::new((0, Vec::new())),
        })
    }

    /// Every account's usage, asked at most once per usage TTL unless `force`. A failed ask keeps the last list,
    /// and is not retried before the TTL runs out either — the CLI polls the endpoint for every account.
    fn accounts(
        &self,
        cli: &std::path::Path,
        now: u64,
        force: bool,
    ) -> Option<Vec<accounts::AccountUsage>> {
        let mut cached = self.accounts.lock().ok()?;
        let fresh = cached.0 != 0 && now.saturating_sub(cached.0) < usage::CACHE_TTL_MS;
        if force || !fresh {
            let answer = accounts::fetch(cli);
            cached.0 = now;
            if answer.is_some() {
                cached.1 = answer;
            }
        }
        cached.1.clone()
    }

    /// The live sessions, and nothing else.
    ///
    /// This is what the pill runs on and what the watcher compares. It never touches the Desktop app's old
    /// sessions: measured 20/09, rescanning those 157 files once a minute from the background thread was
    /// **86% of everything this module cost** — +0,088 points with it, +0,012 without.
    fn read_live(&self) -> Vec<Session> {
        sessions::collect(
            &self.claude_dir,
            &self.orca_root,
            &self.appdata,
            now_ms(),
            false,
        )
    }

    /// Recent Desktop sessions, scanned at most once a minute.
    fn history(&self, now: u64) -> Vec<Session> {
        let Ok(mut cached) = self.history.lock() else {
            return Vec::new();
        };
        if cached.0 == 0 || now.saturating_sub(cached.0) > HISTORY_TTL_MS {
            *cached = (
                now,
                sessions::read_history(&self.appdata, now, sessions::HISTORY_LIMIT),
            );
        }
        cached.1.clone()
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The Claude settings, or the defaults if they cannot be read.
fn options<R: Runtime>(app: &AppHandle<R>) -> crate::settings::ClaudeSettings {
    app.try_state::<crate::settings::SettingsState>()
        .map(|s| s.get().claude)
        .unwrap_or_else(|| crate::settings::Settings::default().claude)
}

/// Extra status images the owner added, per phase, as data URLs. The three bundled with the app live in the page.
#[tauri::command]
pub fn claude_icons(
    state: tauri::State<'_, ClaudeState>,
) -> std::collections::BTreeMap<String, Vec<String>> {
    icons::read(&state.appdata)
}

/// How much of the limit is left. Uses a recent answer unless `force` asks for a fresh one.
///
/// With the layout turned off this touches nothing: no credentials file is opened and no request goes out.
///
/// Runs off the main thread, where a plain Tauri command would run: the request can take a while.
#[tauri::command(async)]
pub fn claude_usage<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClaudeState>,
    force: Option<bool>,
) -> Usage {
    if !options(&app).enabled {
        return Usage::default();
    }
    usage::fetch(
        &state.claude_dir,
        &state.config_file,
        &state.appdata,
        now_ms(),
        force.unwrap_or(false),
    )
}

/// Every account's usage from the account-switcher CLI (SPEC-claude §3.3b), or `None` when there is no CLI, it is
/// turned off, or it gave nothing usable.
///
/// A command of its own, off the main thread: the CLI took 3–6 s on this machine, and the active account's numbers
/// should not wait for it.
#[tauri::command(async)]
pub fn claude_accounts<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClaudeState>,
    force: Option<bool>,
) -> Option<Vec<accounts::AccountUsage>> {
    let settings = options(&app);
    if !settings.enabled || !settings.multi_account {
        return None;
    }
    let cli = accounts::cli_path(&state.home, &settings.account_switcher_path)?;
    state.accounts(&cli, now_ms(), force.unwrap_or(false))
}

/// Brings Claude Desktop to the front.
///
/// A Desktop session does not live in a terminal, so opening one for it never made sense. The target is the
/// constant `claude://`, the protocol the Desktop app registers — nothing from a session file is involved, which
/// makes this the safest row action in the module. Measured on this machine: with the app already running it
/// focuses the existing window rather than starting a second one.
#[tauri::command]
pub fn claude_open_desktop() -> Result<(), String> {
    crate::command_bar::launch::open_shell_target("claude://")
}

/// The live sessions, in order.
#[tauri::command]
pub fn claude_sessions<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, ClaudeState>,
) -> Result<Vec<Session>, String> {
    let settings = options(&app);
    if !settings.enabled {
        return Ok(Vec::new());
    }
    let list = state.read_live();
    if let Ok(mut last) = state.last.lock() {
        *last = list.clone();
    }
    Ok(list)
}

/// Watches the status directory and pushes a change to the page, so the frontend never polls.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("claude-sessions".into())
        .spawn(move || {
            let mut last_stamp: Vec<(std::ffi::OsString, u64, u128)> = Vec::new();
            let mut last_change = std::time::Instant::now();
            loop {
                // Fast while anything is moving, slow once everything has been quiet for a while.
                let busy = last_change.elapsed() < BUSY_FOR;
                std::thread::sleep(if busy { WATCH_BUSY } else { WATCH_IDLE });
                let Some(state) = app.try_state::<ClaudeState>() else {
                    continue;
                };
                let settings = options(&app);
                if !settings.enabled {
                    // Layout off: read nothing at all, not even a directory listing.
                    continue;
                }
                // A handful of directory entries, read without opening a file.
                let stamp = fingerprint(&sessions::state_dir(&state.claude_dir));
                if stamp == last_stamp {
                    continue;
                }
                last_stamp = stamp;
                last_change = std::time::Instant::now();
                let next = state.read_live();
                // Only when the page would look different. A session running tools rewrites its file a couple
                // of times a second and almost none of those writes change anything you can see.
                let now = now_ms();
                let changed = state
                    .last
                    .lock()
                    .map(|last| !model::looks_same(&last, &next, now))
                    .unwrap_or(true);
                if changed {
                    if let Ok(mut last) = state.last.lock() {
                        *last = next;
                    }
                    let _ = app.emit(SESSIONS_CHANGED, ());
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn the_desktop_history_is_not_rescanned_on_every_read() {
        // Scanning it parses every session file the Desktop app kept. Doing that each time a live session changes
        // phase cost 2.2% CPU on the release build; the cache is what brings it back down.
        let dir = std::env::temp_dir().join("winbar-claude-history-cache");
        let _ = fs::remove_dir_all(&dir);
        let store = dir.join("Claude").join("claude-code-sessions");
        fs::create_dir_all(&store).expect("creates");
        let now = 1_789_725_126_000u64;
        let write_one = |title: &str| {
            fs::write(
                store.join("local_1.json"),
                format!(
                    "{{\"sessionId\":\"one\",\"title\":\"{title}\",\"lastActivityAt\":{}}}",
                    now - 1000
                ),
            )
            .expect("writes");
        };
        write_one("first");

        let state = ClaudeState {
            claude_dir: dir.clone(),
            config_file: dir.join(".claude.json"),
            home: dir.clone(),
            orca_root: String::new(),
            appdata: dir.clone(),
            accounts: Mutex::new((0, None)),
            last: Mutex::new(Vec::new()),
            history: Mutex::new((0, Vec::new())),
        };
        assert_eq!(state.history(now)[0].title, "first");

        // Change what is on disk: a read a moment later must still come from the cache.
        write_one("second");
        assert_eq!(state.history(now + 1000)[0].title, "first", "still cached");
        assert_eq!(
            state.history(now + HISTORY_TTL_MS + 1)[0].title,
            "second",
            "and scanned again once the cache is old"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_fingerprint_notices_a_file_rewritten_in_place() {
        // This is the whole point of not using the directory's own timestamp: changing a session's phase rewrites
        // its file, which leaves the parent directory untouched.
        let dir = std::env::temp_dir().join("winbar-claude-fingerprint");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates");
        let file = dir.join("a.json");

        fs::write(&file, r#"{"state":"idle"}"#).expect("writes");
        let before = fingerprint(&dir);
        let dir_stamp = fs::metadata(&dir).and_then(|m| m.modified()).ok();

        std::thread::sleep(Duration::from_millis(20));
        fs::write(&file, r#"{"state":"tool"}"#).expect("writes");
        let after = fingerprint(&dir);

        assert_ne!(before, after, "a rewrite must show up");
        assert_eq!(
            dir_stamp,
            fs::metadata(&dir).and_then(|m| m.modified()).ok(),
            "…and the directory's own timestamp does not move, which is why it cannot be used"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_fingerprint_notices_a_session_ending() {
        let dir = std::env::temp_dir().join("winbar-claude-fingerprint-gone");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates");
        fs::write(dir.join("a.json"), "{}").expect("writes");
        let before = fingerprint(&dir);
        fs::remove_file(dir.join("a.json")).expect("removes");
        assert_ne!(before, fingerprint(&dir));
        let _ = fs::remove_dir_all(&dir);
    }
}
