//! What a Claude session is, and the rules for naming and ordering them (SPEC-claude §3.4, §5.2, §5.3).
//!
//! Nothing here touches the disk, so all of it is tested directly — including the two rules that came out of
//! looking at Lauren's real machine: the hook records a worktree name where you would expect a project name, and
//! a session that was killed without a clean exit leaves its file behind for up to a day.

use serde::Serialize;

/// Sessions idle longer than this drop to the bottom of the card, dimmed (SPEC §5.2).
pub const STALE_AFTER_MS: u64 = 2 * 60 * 60 * 1000;
/// Two rows for one folder: the older one only counts as a real second session if it is this fresh.
pub const SIBLING_WINDOW_MS: u64 = 5 * 60 * 1000;
/// The hook itself sweeps files older than a day; anything that old is a leftover, not a session.
pub const MAX_AGE_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    #[default]
    Idle,
    Thinking,
    Tool,
    Permission,
}

impl Phase {
    pub fn parse(raw: &str) -> Phase {
        match raw {
            "thinking" => Phase::Thinking,
            "tool" => Phase::Tool,
            "permission" => Phase::Permission,
            _ => Phase::Idle,
        }
    }

    /// What the card sorts by: the thing that needs you comes first (SPEC §5.3).
    fn rank(self) -> u8 {
        match self {
            Phase::Permission => 0,
            Phase::Tool => 1,
            Phase::Thinking => 2,
            Phase::Idle => 3,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Cli,
    Desktop,
    /// A past session of the Desktop app, read from its own store. Not running.
    History,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub source: Source,
    /// Worktree name inside Orca, otherwise the folder name, otherwise a Desktop session title.
    pub title: String,
    /// The project a worktree belongs to (SPEC §3.4). Absent outside Orca.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    pub phase: Phase,
    /// Tool name while `phase` is `tool`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// Epoch ms. The hook writes 0 for most sessions, so this is usually absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    /// Epoch ms of the last sign of life.
    pub last_active_at: u64,
    /// Completed turns, for a Desktop history row.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turns: Option<u32>,
    /// Idle long enough that it is probably forgotten — or was never closed cleanly (SPEC §5.2).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub stale: bool,
}

/// Splits an Orca working directory into `(project, worktree)`.
///
/// Orca keeps `<root>/workspaces/<project>/<worktree>`, and the status hook only records the last segment — so
/// without this a card would read "firefish", "makara", "fangtooth" with no sign that the first is winbar and the
/// other two are the same project. Anything outside that shape returns `None` rather than guessing.
pub fn orca_project(cwd: &str, orca_root: &str) -> Option<(String, String)> {
    let normalise = |s: &str| s.replace('\\', "/").trim_end_matches('/').to_lowercase();
    let cwd_norm = normalise(cwd);
    let prefix = format!("{}/workspaces/", normalise(orca_root));
    let rest = cwd_norm.strip_prefix(&prefix)?;
    // Exactly two segments: deeper paths are a folder inside a worktree, not the worktree itself.
    let mut parts = rest.split('/');
    let (project, worktree) = (parts.next()?, parts.next()?);
    if parts.next().is_some() || project.is_empty() || worktree.is_empty() {
        return None;
    }
    // Take the case from the original path: the comparison is lower-cased, the display should not be.
    let original = cwd.replace('\\', "/");
    let tail: Vec<&str> = original.trim_end_matches('/').rsplit('/').take(2).collect();
    match tail.as_slice() {
        [worktree_raw, project_raw] => {
            Some(((*project_raw).to_string(), (*worktree_raw).to_string()))
        }
        _ => Some((project.to_string(), worktree.to_string())),
    }
}

/// Name for a row: the Orca worktree with its project, or just the folder name.
pub fn title_for(cwd: &str, fallback: &str, orca_root: &str) -> (String, Option<String>) {
    match orca_project(cwd, orca_root) {
        Some((project, worktree)) => (worktree, Some(project)),
        None => (fallback.to_string(), None),
    }
}

/// Orders sessions for the card: what needs you first, then the most recently alive.
pub fn sort(sessions: &mut [Session]) {
    sessions.sort_by(|a, b| {
        (a.stale, a.phase.rank(), std::cmp::Reverse(a.last_active_at)).cmp(&(
            b.stale,
            b.phase.rank(),
            std::cmp::Reverse(b.last_active_at),
        ))
    });
}

/// Marks sessions that have been quiet too long, and folds away the ghost of a session that was replaced.
///
/// Lauren kills a session and starts a new one in the same worktree; `SessionEnd` only fires on a clean exit, so
/// the old file lingers. When two rows share a folder, the newest is the real one — an older sibling only stays
/// at full strength if it has been alive in the last few minutes, which is the short parallel task case.
pub fn mark_stale(sessions: &mut [Session], now: u64) {
    let mut newest_per_cwd: std::collections::HashMap<String, u64> =
        std::collections::HashMap::new();
    for session in sessions.iter() {
        if let Some(cwd) = &session.cwd {
            let entry = newest_per_cwd.entry(cwd.to_lowercase()).or_default();
            *entry = (*entry).max(session.last_active_at);
        }
    }
    for session in sessions.iter_mut() {
        if session.source == Source::History {
            continue;
        }
        let quiet = now.saturating_sub(session.last_active_at);
        let shadowed = session
            .cwd
            .as_ref()
            .and_then(|cwd| newest_per_cwd.get(&cwd.to_lowercase()))
            .is_some_and(|newest| *newest > session.last_active_at);
        session.stale = quiet > STALE_AFTER_MS || (shadowed && quiet > SIBLING_WINDOW_MS);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ORCA: &str = "C:\\Users\\Lenovo\\orca";

    fn session(id: &str, phase: Phase, last_active_at: u64, cwd: Option<&str>) -> Session {
        Session {
            id: id.into(),
            source: Source::Cli,
            title: id.into(),
            project: None,
            phase,
            tool: None,
            cwd: cwd.map(str::to_string),
            started_at: None,
            last_active_at,
            turns: None,
            stale: false,
        }
    }

    #[test]
    fn splits_an_orca_worktree_into_project_and_worktree() {
        assert_eq!(
            orca_project(
                "C:\\Users\\Lenovo\\orca\\workspaces\\winbar\\firefish",
                ORCA
            ),
            Some(("winbar".into(), "firefish".into()))
        );
        assert_eq!(
            orca_project(
                "C:/Users/Lenovo/orca/workspaces/qikify-theme-v3/makara",
                ORCA
            ),
            Some(("qikify-theme-v3".into(), "makara".into()))
        );
    }

    #[test]
    fn two_worktrees_of_one_project_report_the_same_project() {
        let a = orca_project(
            "C:\\Users\\Lenovo\\orca\\workspaces\\qikify-theme-v3\\makara",
            ORCA,
        );
        let b = orca_project(
            "C:\\Users\\Lenovo\\orca\\workspaces\\qikify-theme-v3\\fangtooth",
            ORCA,
        );
        assert_eq!(a.map(|p| p.0), b.map(|p| p.0));
    }

    #[test]
    fn anything_outside_that_shape_is_left_alone() {
        assert_eq!(orca_project("C:\\Users\\Lenovo\\brain", ORCA), None);
        // The projects folder is the checkout, not a worktree.
        assert_eq!(
            orca_project("C:\\Users\\Lenovo\\orca\\projects\\winbar", ORCA),
            None
        );
        // One level short, and one level too deep.
        assert_eq!(
            orca_project("C:\\Users\\Lenovo\\orca\\workspaces\\winbar", ORCA),
            None
        );
        assert_eq!(
            orca_project(
                "C:\\Users\\Lenovo\\orca\\workspaces\\winbar\\firefish\\src",
                ORCA
            ),
            None
        );
        assert_eq!(orca_project("", ORCA), None);
    }

    #[test]
    fn a_different_orca_root_still_works() {
        assert_eq!(
            orca_project(
                "D:\\dev\\orca\\workspaces\\winbar\\firefish",
                "D:\\dev\\orca"
            ),
            Some(("winbar".into(), "firefish".into()))
        );
        // …and the default root does not match a path under another one.
        assert_eq!(
            orca_project("D:\\dev\\orca\\workspaces\\winbar\\firefish", ORCA),
            None
        );
    }

    #[test]
    fn matching_ignores_case_and_slash_direction_but_display_keeps_them() {
        assert_eq!(
            orca_project("c:/users/lenovo/ORCA/workspaces/WinBar/FireFish", ORCA),
            Some(("WinBar".into(), "FireFish".into())),
            "the name shown should read as the folder is actually spelled"
        );
    }

    #[test]
    fn a_title_falls_back_to_the_folder_name_outside_orca() {
        assert_eq!(
            title_for("C:\\Users\\Lenovo\\brain", "brain", ORCA),
            ("brain".to_string(), None)
        );
        assert_eq!(
            title_for(
                "C:\\Users\\Lenovo\\orca\\workspaces\\winbar\\firefish",
                "firefish",
                ORCA
            ),
            ("firefish".to_string(), Some("winbar".to_string()))
        );
    }

    #[test]
    fn what_needs_you_comes_first() {
        let mut list = vec![
            session("idle", Phase::Idle, 500, None),
            session("thinking", Phase::Thinking, 400, None),
            session("permission", Phase::Permission, 100, None),
            session("tool", Phase::Tool, 200, None),
        ];
        sort(&mut list);
        let order: Vec<&str> = list.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(order, ["permission", "tool", "thinking", "idle"]);
    }

    #[test]
    fn same_phase_puts_the_freshest_first() {
        let mut list = vec![
            session("older", Phase::Idle, 100, None),
            session("newer", Phase::Idle, 900, None),
        ];
        sort(&mut list);
        assert_eq!(list[0].id, "newer");
    }

    #[test]
    fn stale_sessions_go_last_whatever_their_phase() {
        let mut list = vec![
            session("busy", Phase::Tool, 0, None),
            session("fresh", Phase::Idle, 0, None),
        ];
        list[0].stale = true;
        sort(&mut list);
        assert_eq!(list[0].id, "fresh");
    }

    #[test]
    fn a_long_quiet_session_is_marked_stale() {
        let now = 10 * STALE_AFTER_MS;
        let mut list = vec![
            session("quiet", Phase::Idle, now - STALE_AFTER_MS - 1, None),
            session("recent", Phase::Idle, now - 1000, None),
        ];
        mark_stale(&mut list, now);
        assert!(list[0].stale);
        assert!(!list[1].stale);
    }

    #[test]
    fn the_ghost_of_a_replaced_session_is_folded_away() {
        // Same worktree twice: the old one was killed without a clean exit, so its file is still there.
        let now = 10 * STALE_AFTER_MS;
        let cwd = Some("C:\\work\\firefish");
        let mut list = vec![
            session("ghost", Phase::Idle, now - SIBLING_WINDOW_MS - 1, cwd),
            session("live", Phase::Tool, now - 1000, cwd),
        ];
        mark_stale(&mut list, now);
        assert!(list[0].stale, "the older row for this folder steps aside");
        assert!(!list[1].stale);
    }

    #[test]
    fn a_short_parallel_task_in_the_same_worktree_stays() {
        // Both alive in the last few minutes: this is the real second session Lauren described.
        let now = 10 * STALE_AFTER_MS;
        let cwd = Some("C:\\work\\firefish");
        let mut list = vec![
            session("side-task", Phase::Tool, now - 60_000, cwd),
            session("main", Phase::Thinking, now - 1000, cwd),
        ];
        mark_stale(&mut list, now);
        assert!(!list[0].stale);
        assert!(!list[1].stale);
    }

    #[test]
    fn a_different_folder_is_never_shadowed() {
        let now = 10 * STALE_AFTER_MS;
        let mut list = vec![
            session(
                "a",
                Phase::Idle,
                now - SIBLING_WINDOW_MS - 1,
                Some("C:\\work\\one"),
            ),
            session("b", Phase::Tool, now - 1000, Some("C:\\work\\two")),
        ];
        mark_stale(&mut list, now);
        assert!(
            !list[0].stale,
            "an older session elsewhere is still its own session"
        );
    }

    #[test]
    fn history_rows_are_never_marked_stale() {
        let now = 10 * STALE_AFTER_MS;
        let mut list = vec![session("old-desktop", Phase::Idle, 0, None)];
        list[0].source = Source::History;
        mark_stale(&mut list, now);
        assert!(!list[0].stale, "history is already presented as the past");
    }

    #[test]
    fn a_session_serialises_without_empty_fields() {
        let json = serde_json::to_value(session("a", Phase::Idle, 5, None)).expect("serialises");
        let fields = json.as_object().expect("an object");
        assert_eq!(fields["phase"], "idle");
        assert_eq!(fields["source"], "cli");
        for absent in ["project", "tool", "cwd", "startedAt", "turns", "stale"] {
            assert!(!fields.contains_key(absent), "{absent} should be left out");
        }
    }
}
