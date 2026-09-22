//! Reading the two places that know about Claude sessions (SPEC-claude §3.1, §3.2).
//!
//! `~/.claude/statusbar/state.d/` holds one file per live session — both CLI and Desktop, told apart by
//! `entrypoint`. `%APPDATA%\Claude\` holds the Desktop app's own past sessions, which is history, not a live list.
//!
//! A file that will not parse is skipped rather than sinking the whole list: this format belongs to someone else's
//! hook and can change without warning.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::model::{mark_stale, sort, title_for, Phase, Session, Source, MAX_AGE_MS};

/// Most recent Desktop sessions kept in the card (SPEC §5.2).
pub const HISTORY_LIMIT: usize = 3;
/// Desktop sessions older than this are not worth showing.
const HISTORY_MAX_AGE_MS: u64 = 14 * 24 * 60 * 60 * 1000;

/// One file written by the status hook. Every field is optional: this is someone else's format.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct StateFile {
    session_id: String,
    state: String,
    label: String,
    cwd: String,
    project: String,
    entrypoint: String,
    /// Epoch **seconds**, and 0 for most sessions.
    started_at: u64,
    /// Epoch **seconds** of the last event.
    ts: u64,
}

/// One session file written by the Claude Desktop app.
#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct DesktopFile {
    session_id: String,
    title: String,
    /// Epoch **milliseconds**.
    last_activity_at: u64,
    completed_turns: u32,
    cwd: String,
    is_archived: bool,
}

/// The `.claude` directory: `CLAUDE_CONFIG_DIR` when the user moved it, otherwise the one under `home`.
///
/// Claude Code honours this variable, so a machine that sets it keeps its state files somewhere else entirely and
/// winbar would otherwise show an empty list forever. `usage.rs` already read it; this is the same rule.
pub fn claude_dir(home: &Path) -> PathBuf {
    claude_dir_from(home, std::env::var("CLAUDE_CONFIG_DIR").ok().as_deref())
}

/// The rule on its own, so it can be tested without an environment variable — setting one would leak into every
/// other test in the process.
fn claude_dir_from(home: &Path, configured: Option<&str>) -> PathBuf {
    configured
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or_else(|| home.join(".claude"), PathBuf::from)
}

/// Claude Code's `.claude.json`: inside `CLAUDE_CONFIG_DIR` when that is set, otherwise **next to** `.claude` in
/// the home directory rather than inside it.
pub fn config_file(home: &Path) -> PathBuf {
    config_file_from(home, std::env::var("CLAUDE_CONFIG_DIR").ok().as_deref())
}

fn config_file_from(home: &Path, configured: Option<&str>) -> PathBuf {
    configured
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or_else(|| home.to_path_buf(), PathBuf::from)
        .join(".claude.json")
}

/// Where the per-session state files live, inside an already-resolved `.claude` directory.
pub fn state_dir(claude_dir: &Path) -> PathBuf {
    claude_dir.join("statusbar").join("state.d")
}

fn desktop_dirs(appdata: &Path) -> [PathBuf; 2] {
    let base = appdata.join("Claude");
    [
        base.join("claude-code-sessions"),
        base.join("local-agent-mode-sessions"),
    ]
}

/// Where Orca keeps its worktrees. `ORCA_HOME` wins, as it does for Orca itself.
pub fn orca_root(home: &Path) -> String {
    std::env::var("ORCA_HOME")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| home.join("orca").to_string_lossy().into_owned())
}

/// Live sessions, newest first, with the ghosts folded away.
pub fn read_live(dir: &Path, orca_root: &str, now_ms: u64) -> Vec<Session> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "json") {
            continue;
        }
        let Some(session) = read_state_file(&path, orca_root, now_ms) else {
            continue;
        };
        out.push(session);
    }
    out
}

fn read_state_file(path: &Path, orca_root: &str, now_ms: u64) -> Option<Session> {
    let text = fs::read_to_string(path).ok()?;
    let state: StateFile = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let last_active_at = state.ts.saturating_mul(1000);
    // The hook sweeps these itself after a day; anything older is a leftover from a crash.
    if last_active_at == 0 || now_ms.saturating_sub(last_active_at) > MAX_AGE_MS {
        return None;
    }
    let id = if state.session_id.is_empty() {
        path.file_stem()?.to_string_lossy().into_owned()
    } else {
        state.session_id
    };
    let fallback = if state.project.is_empty() {
        "(không rõ)"
    } else {
        &state.project
    };
    let (title, project) = title_for(&state.cwd, fallback, orca_root);
    let phase = Phase::parse(&state.state);
    Some(Session {
        id,
        source: if state.entrypoint == "claude-desktop" {
            Source::Desktop
        } else {
            Source::Cli
        },
        title,
        project,
        phase,
        tool: (phase == Phase::Tool && !state.label.is_empty()).then(|| state.label.clone()),
        // Only a real local directory is offered to open. `cwd` comes from a file someone else's hook writes,
        // and a row click hands it to a launcher; a session's working directory is a folder, so anything else is
        // not one.
        cwd: is_local_dir(&state.cwd).then(|| state.cwd.clone()),
        // 0 means the hook never recorded a start, which is the usual case.
        started_at: (state.started_at > 0).then(|| state.started_at.saturating_mul(1000)),
        last_active_at,
        turns: None,
        stale: false,
    })
}

/// Whether `cwd` names a folder on this machine.
///
/// The UNC check comes first and on purpose: this runs for every session on every pass of the watcher, and
/// `is_dir()` on `\\server\share` makes Windows open an SMB connection. Against a server that asks for
/// credentials that would hand them over every couple of seconds, for a row nobody clicked.
fn is_local_dir(cwd: &str) -> bool {
    !cwd.is_empty() && !crate::command_bar::launch::is_network_path(cwd) && Path::new(cwd).is_dir()
}

/// Past Desktop sessions, newest first. Metadata only — never the conversation.
pub fn read_history(appdata: &Path, now_ms: u64, limit: usize) -> Vec<Session> {
    let mut out: Vec<Session> = Vec::new();
    for dir in desktop_dirs(appdata) {
        collect_history(&dir, now_ms, &mut out);
    }
    out.sort_by_key(|s| std::cmp::Reverse(s.last_active_at));
    out.dedup_by(|a, b| a.id == b.id);
    out.truncate(limit);
    out
}

/// Walks a Desktop session store. The app nests these a couple of levels deep.
fn collect_history(dir: &Path, now_ms: u64, out: &mut Vec<Session>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_history(&path, now_ms, out);
        } else if path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with("local_") && n.ends_with(".json"))
        {
            if let Some(session) = read_desktop_file(&path, now_ms) {
                out.push(session);
            }
        }
    }
}

fn read_desktop_file(path: &Path, now_ms: u64) -> Option<Session> {
    let text = fs::read_to_string(path).ok()?;
    let file: DesktopFile = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    if file.is_archived || file.last_activity_at == 0 {
        return None;
    }
    if now_ms.saturating_sub(file.last_activity_at) > HISTORY_MAX_AGE_MS {
        return None;
    }
    Some(Session {
        id: if file.session_id.is_empty() {
            path.file_stem()?.to_string_lossy().into_owned()
        } else {
            file.session_id
        },
        source: Source::History,
        title: if file.title.is_empty() {
            "Phiên không tên".into()
        } else {
            file.title
        },
        project: None,
        phase: Phase::Idle,
        tool: None,
        cwd: (!file.cwd.is_empty() && Path::new(&file.cwd).is_dir()).then_some(file.cwd),
        started_at: None,
        last_active_at: file.last_activity_at,
        turns: Some(file.completed_turns),
        stale: false,
    })
}

/// The whole list the card shows: live sessions in order, then recent Desktop history.
///
/// Both directories and the Orca root come in already resolved — the environment is read once at startup, not on
/// every pass of the watcher.
pub fn collect(
    claude_dir: &Path,
    orca_root: &str,
    appdata: &Path,
    now_ms: u64,
    with_history: bool,
) -> Vec<Session> {
    let mut live = read_live(&state_dir(claude_dir), orca_root, now_ms);
    mark_stale(&mut live, now_ms);
    sort(&mut live);
    if with_history {
        live.extend(read_history(appdata, now_ms, HISTORY_LIMIT));
    }
    live
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_789_725_126_000;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("winbar-claude-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates");
        dir
    }

    fn write(dir: &Path, name: &str, body: &str) {
        fs::create_dir_all(dir).expect("creates");
        fs::write(dir.join(name), body).expect("writes");
    }

    /// A file shaped exactly like the ones on the owner's machine.
    fn state_json(id: &str, state: &str, cwd: &str, entrypoint: &str, ts: u64) -> String {
        format!(
            r#"{{"sessionId":"{id}","state":"{state}","label":"Bash","cwd":"{}","project":"proj",
                "entrypoint":"{entrypoint}","termProgram":"Orca","startedAt":0,"ts":{ts}}}"#,
            cwd.replace('\\', "\\\\")
        )
    }

    #[test]
    fn reads_the_real_file_shape() {
        let dir = temp_dir("live");
        write(
            &dir,
            "a.json",
            &state_json(
                "a",
                "tool",
                "C:\\Users\\me\\orca\\workspaces\\winbar\\firefish",
                "cli",
                NOW / 1000,
            ),
        );
        let list = read_live(&dir, "C:\\Users\\me\\orca", NOW);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].phase, Phase::Tool);
        assert_eq!(list[0].tool.as_deref(), Some("Bash"));
        assert_eq!(list[0].title, "firefish");
        assert_eq!(list[0].project.as_deref(), Some("winbar"));
        assert_eq!(list[0].source, Source::Cli);
        assert_eq!(
            list[0].started_at, None,
            "the hook writes 0, so there is no start time"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_a_real_folder_is_offered_to_open() {
        // A row click hands cwd to ShellExecute, and this file is written by someone else's hook — so a path that
        // is not a directory (an executable, a file, something long gone) must not become a clickable row.
        let dir = temp_dir("cwd");
        let exe = dir.join("payload.exe");
        fs::write(&exe, b"MZ").expect("writes");
        write(
            &dir,
            "a.json",
            &state_json("a", "idle", &exe.to_string_lossy(), "cli", NOW / 1000),
        );
        write(
            &dir,
            "b.json",
            &state_json(
                "b",
                "idle",
                "C:\\definitely\\not\\here-9f2c",
                "cli",
                NOW / 1000,
            ),
        );
        write(
            &dir,
            "c.json",
            &state_json("c", "idle", &dir.to_string_lossy(), "cli", NOW / 1000),
        );

        let list = read_live(&dir, "C:\\orca", NOW);
        let cwd_of = |id: &str| list.iter().find(|s| s.id == id).and_then(|s| s.cwd.clone());
        assert_eq!(
            cwd_of("a"),
            None,
            "an executable is not a working directory"
        );
        assert_eq!(cwd_of("b"), None, "a folder that is gone is not one either");
        assert!(cwd_of("c").is_some(), "a real folder still opens");
        // The rows themselves stay; only the click is withheld.
        assert_eq!(list.len(), 3);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_desktop_entrypoint_is_tagged_desktop() {
        let dir = temp_dir("entrypoint");
        write(
            &dir,
            "d.json",
            &state_json("d", "idle", "C:\\x", "claude-desktop", NOW / 1000),
        );
        let list = read_live(&dir, "C:\\orca", NOW);
        assert_eq!(list[0].source, Source::Desktop);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn broken_and_ancient_files_are_skipped_without_losing_the_rest() {
        let dir = temp_dir("broken");
        write(
            &dir,
            "good.json",
            &state_json("good", "idle", "C:\\x", "cli", NOW / 1000),
        );
        write(&dir, "bad.json", "{ not json");
        write(&dir, "empty.json", "{}");
        write(
            &dir,
            "notes.txt",
            &state_json("txt", "idle", "C:\\x", "cli", NOW / 1000),
        );
        // Older than the hook's own 24-hour sweep.
        write(
            &dir,
            "ancient.json",
            &state_json(
                "ancient",
                "idle",
                "C:\\x",
                "cli",
                (NOW - MAX_AGE_MS - 1000) / 1000,
            ),
        );
        let list = read_live(&dir, "C:\\orca", NOW);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "good");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_directory_is_simply_no_sessions() {
        assert!(read_live(Path::new("C:\\definitely\\not\\here-9f2c"), "C:\\orca", NOW).is_empty());
        assert!(read_history(Path::new("C:\\definitely\\not\\here-9f2c"), NOW, 3).is_empty());
    }

    #[test]
    fn desktop_history_is_metadata_only_newest_first() {
        let dir = temp_dir("history");
        let store = dir
            .join("Claude")
            .join("claude-code-sessions")
            .join("nested");
        write(
            &store,
            "local_1.json",
            &format!(
                r#"{{"sessionId":"one","title":"Sửa theme","lastActivityAt":{},"completedTurns":4,"cwd":"C:\\a"}}"#,
                NOW - 1000
            ),
        );
        write(
            &store,
            "local_2.json",
            &format!(
                r#"{{"sessionId":"two","title":"Việc cũ","lastActivityAt":{},"completedTurns":9,"cwd":"C:\\b"}}"#,
                NOW - 5000
            ),
        );
        write(
            &store,
            "local_3.json",
            &format!(
                r#"{{"sessionId":"arch","title":"Đã lưu trữ","lastActivityAt":{},"isArchived":true}}"#,
                NOW
            ),
        );
        write(&store, "other.json", "{}");

        let list = read_history(&dir, NOW, 3);
        assert_eq!(
            list.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["one", "two"]
        );
        assert_eq!(list[0].title, "Sửa theme");
        assert_eq!(list[0].turns, Some(4));
        assert_eq!(list[0].source, Source::History);
        assert_eq!(list[0].phase, Phase::Idle);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn history_forgets_sessions_from_weeks_ago() {
        let dir = temp_dir("history-old");
        let store = dir.join("Claude").join("claude-code-sessions");
        write(
            &store,
            "local_old.json",
            &format!(
                r#"{{"sessionId":"old","title":"Rất cũ","lastActivityAt":{}}}"#,
                NOW - HISTORY_MAX_AGE_MS - 1000
            ),
        );
        assert!(read_history(&dir, NOW, 3).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_network_folder_is_never_offered_and_never_reached_for() {
        for network in [
            r"\\server\share\work",
            r"  \\server\share",
            "//server/share",
            r"/\server\share",
            r"\/server/share",
        ] {
            assert!(!is_local_dir(network), "{network:?}");
        }
        assert!(!is_local_dir(""));
        assert!(!is_local_dir(r"C:\definitely\not\here-9f2c"));
        assert!(is_local_dir(
            std::env::temp_dir().to_str().expect("temp dir is text")
        ));
    }

    #[test]
    fn a_moved_config_directory_wins_over_the_home_one() {
        let home = Path::new(r"C:\Users\someone");
        assert_eq!(
            claude_dir_from(home, None),
            home.join(".claude"),
            "no variable set: the directory under home"
        );
        assert_eq!(
            claude_dir_from(home, Some(r"D:\claude")),
            PathBuf::from(r"D:\claude")
        );
        // An empty or blank value is someone unsetting it, not a request to read the drive root.
        assert_eq!(claude_dir_from(home, Some("")), home.join(".claude"));
        assert_eq!(claude_dir_from(home, Some("   ")), home.join(".claude"));
    }

    #[test]
    fn the_config_file_sits_beside_dot_claude_unless_the_directory_moved() {
        let home = Path::new(r"C:\Users\someone");
        assert_eq!(config_file_from(home, None), home.join(".claude.json"));
        assert_eq!(config_file_from(home, Some(" ")), home.join(".claude.json"));
        assert_eq!(
            config_file_from(home, Some(r"D:\claude")),
            PathBuf::from(r"D:\claude\.claude.json")
        );
    }

    #[test]
    fn collect_puts_live_sessions_above_history_and_can_leave_history_out() {
        let home = temp_dir("collect-home");
        write(
            &state_dir(&home),
            "live.json",
            &state_json("live", "thinking", "C:\\x", "cli", NOW / 1000),
        );
        let appdata = temp_dir("collect-appdata");
        write(
            &appdata.join("Claude").join("claude-code-sessions"),
            "local_1.json",
            &format!(
                r#"{{"sessionId":"past","title":"Cũ","lastActivityAt":{}}}"#,
                NOW - 2000
            ),
        );

        let root = home.join("orca").to_string_lossy().into_owned();
        let both = collect(&home, &root, &appdata, NOW, true);
        assert_eq!(
            both.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["live", "past"]
        );
        let live_only = collect(&home, &root, &appdata, NOW, false);
        assert_eq!(live_only.len(), 1);
        let _ = fs::remove_dir_all(&home);
        let _ = fs::remove_dir_all(&appdata);
    }
}
