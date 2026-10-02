//! Answering Claude Code's permission requests from the notch (SPEC-claude-approvals).
//!
//! The one part of winbar that reaches into Claude Code: a hook relays each permission request to the running app
//! over a named pipe, the notch shows it, and the answer travels back the same way. The rest of the Claude layout
//! stays read-only.
//!
//! What a tool was asked to do — a command line, a file path — is held in memory for as long as the request is
//! open and goes to the page that draws it. It is never logged and never written to disk: log lines here carry
//! error kinds and nothing else.

mod install;
mod pending;
#[cfg(windows)]
mod pipe;
mod protocol;
pub mod relay;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

use crate::settings::{Settings, SettingsState};
pub use install::{HookPreview, HookStatus};
// File names dropped on the notch are drawn too (SPEC-claude-drop §3).
pub(crate) use protocol::clean;
use pending::{Answer, Approval, Book, Notice, NoticeKind};

/// A request arrived, was answered, or went away.
pub const APPROVALS_CHANGED: &str = "claude-approvals-changed";
/// A session took a step, started a new turn, or its count of running subagents changed.
pub const STEPS_CHANGED: &str = "claude-steps-changed";
/// A turn ended and there is something to say about it (SPEC-claude-notices).
pub const NOTICES_CHANGED: &str = "claude-notices-changed";

/// The widget that draws the requests. With it turned off nobody can answer one.
const WIDGET: &str = "claude-sessions";

/// How long each stage of one connection may take (SPEC §4.3).
#[derive(Clone, Copy)]
struct Limits {
    /// For the relay to send its line after connecting.
    read: Duration,
    /// For the page to confirm the pill is on screen.
    shown: Duration,
    /// For a person to answer.
    answer: Duration,
    /// How often a waiting request checks whether it should still be waiting.
    tick: Duration,
}

const LIMITS: Limits = Limits {
    read: Duration::from_secs(2),
    shown: Duration::from_secs(2),
    answer: Duration::from_secs(300),
    tick: Duration::from_millis(200),
};

/// More connections than this at once is not Claude Code asking; the extra ones are dropped unread.
#[cfg(windows)]
const MAX_CONNECTIONS: usize = 64;

#[derive(Default)]
pub struct ApprovalsState {
    book: Mutex<Book>,
    /// The pipe is open and being served. False when its name could not be had — someone else created it first —
    /// in which case the hooks can be installed and nothing will ever arrive. Settings says so.
    listening: AtomicBool,
}

fn with_book<T>(book: &Mutex<Book>, f: impl FnOnce(&mut Book) -> T) -> Option<T> {
    book.lock().ok().map(|mut book| f(&mut book))
}

/// Whether anyone could answer a request right now: the Claude layout is on, its widget is on, and the notch is
/// not hidden. When not, the relay gets no answer and the terminal asks as usual.
fn accepting(settings: &Settings, notch_hidden: bool) -> bool {
    settings.claude.enabled
        && !notch_hidden
        && !settings
            .widgets
            .iter()
            .any(|w| w.id == WIDGET && !w.enabled)
}

/// The last folder of a path, for a session outside Orca.
fn folder_name(cwd: &str) -> &str {
    cwd.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("(không rõ)")
}

/// Longest session or project name drawn. A folder name longer than this is cut; it only labels the request.
const MAX_NAME: usize = 80;

/// What a session is called on the notch, cleaned and capped: its title, and its project when it has one.
fn who(cwd: &str, orca_root: &str) -> (String, Option<String>) {
    let name = |text: &str| protocol::capped(&protocol::clean(text, false), MAX_NAME);
    let cwd = protocol::capped(cwd, protocol::MAX_CWD);
    let (title, project) = super::model::title_for(&cwd, folder_name(&cwd), orca_root);
    (name(&title), project.map(|p| name(&p)))
}

/// The end of a turn: its subagents and open requests are over, and the page gets a notice about it.
///
/// What goes into the notice is cleaned and capped here whoever sent it, like a request (see `view`).
fn turn_ended(book: &Mutex<Book>, session: &str, cwd: &str, orca_root: &str, now: u64, outcome: Result<&str, &str>, notify: &dyn Fn(&'static str)) {
    if with_book(book, |b| b.turn_over(session)).unwrap_or(0) > 0 {
        notify(APPROVALS_CHANGED);
    }
    if with_book(book, |b| b.clear_agents(session)) == Some(true) {
        notify(STEPS_CHANGED);
    }
    let (title, project) = who(cwd, orca_root);
    let turn_ms = with_book(book, |b| b.turn_ended(session, now)).flatten();
    let notice = match outcome {
        Ok(summary) => {
            // Cleaned first, so a line break someone smuggled in is already a visible mark when the line is cut.
            let line = protocol::summary_line(&protocol::clean(summary, false));
            Notice {
                id: String::new(),
                kind: NoticeKind::Finished,
                session_id: session.to_string(),
                title,
                project,
                summary: (!line.is_empty()).then_some(line),
                reason: None,
                turn_ms,
                at: now,
            }
        }
        Err(reason) => Notice {
            id: String::new(),
            kind: NoticeKind::Failed,
            session_id: session.to_string(),
            title,
            project,
            summary: None,
            reason: Some(protocol::reason_code(reason)),
            turn_ms: None,
            at: now,
        },
    };
    if with_book(book, |b| b.notice(notice)).is_some() {
        notify(NOTICES_CHANGED);
    }
}

/// A request as the page will draw it.
///
/// Every string that came over the pipe is cleaned and capped here, whatever the relay already did: the relay is
/// winbar's own code, but the pipe is open to any process of the same user, and the page should not have to care
/// which of them wrote the line.
fn view(
    session: &str,
    cwd: &str,
    tool: &str,
    mut input: serde_json::Value,
    truncated: bool,
    orca_root: &str,
    now: u64,
) -> Approval {
    let tool = protocol::capped(tool, protocol::MAX_ID);
    // A little over the relay's own limit, so a string the relay already cut and marked is not cut again.
    let cut_here = protocol::truncate_strings(&mut input, protocol::MAX_STRING + 100);
    let (title, project) = who(cwd, orca_root);
    let (detail, cut_detail) = protocol::detail(&input);
    let (summary, whole) = protocol::summary(&tool, &input);
    let truncated = truncated || cut_here || cut_detail;
    Approval {
        id: String::new(),
        session_id: protocol::capped(session, protocol::MAX_ID),
        title,
        project,
        tool: protocol::clean(&tool, false),
        summary,
        // What was cut cannot have been shown, whatever the line looks like.
        complete: whole && !truncated,
        detail,
        truncated,
        received_at: now,
    }
}

/// Serves one connection from the relay.
///
/// `notify` is called with the name of the event the page should hear about. Kept free of Tauri so the whole
/// exchange can be tested over a real pipe.
#[cfg(windows)]
fn serve(
    book: &Mutex<Book>,
    connection: &pipe::Connection,
    orca_root: &str,
    now: u64,
    limits: Limits,
    notify: &dyn Fn(&'static str),
) {
    use protocol::Message;
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::Instant;

    let Some(line) = connection.read_line(limits.read, protocol::MAX_LINE) else {
        return;
    };
    let Ok(message) = serde_json::from_slice::<Message>(&line) else {
        return;
    };
    let id_of = |text: &str| protocol::capped(text, protocol::MAX_ID);
    match message {
        Message::PreToolUse { session, label } => {
            let session = id_of(&session);
            let label = protocol::capped(&protocol::clean(&label, false), protocol::MAX_LABEL);
            if with_book(book, |b| b.step(&session, label)) == Some(true) {
                notify(STEPS_CHANGED);
            }
        }
        Message::PostToolUse {
            session,
            tool_use_id,
        } => {
            let (session, tool_use_id) = (id_of(&session), id_of(&tool_use_id));
            if with_book(book, |b| b.tool_finished(&session, &tool_use_id)).unwrap_or(0) > 0 {
                notify(APPROVALS_CHANGED);
            }
        }
        Message::UserPromptSubmit { session } => {
            let session = id_of(&session);
            let cleared = with_book(book, |b| {
                b.turn_started(&session, now);
                // Both run: `|`, not `||`.
                b.clear_steps(&session) | b.clear_agents(&session)
            });
            if cleared == Some(true) {
                notify(STEPS_CHANGED);
            }
            if with_book(book, |b| b.turn_over(&session)).unwrap_or(0) > 0 {
                notify(APPROVALS_CHANGED);
            }
        }
        Message::Stop { session, cwd, summary } => {
            turn_ended(book, &id_of(&session), &cwd, orca_root, now, Ok(&summary), notify);
        }
        Message::StopFailure { session, cwd, reason } => {
            turn_ended(book, &id_of(&session), &cwd, orca_root, now, Err(&reason), notify);
        }
        Message::SubagentStart { session, agent } => {
            if with_book(book, |b| b.agent_started(&id_of(&session), &id_of(&agent))) == Some(true) {
                notify(STEPS_CHANGED);
            }
        }
        Message::SubagentStop { session, agent } => {
            if with_book(book, |b| b.agent_stopped(&id_of(&session), &id_of(&agent))) == Some(true) {
                notify(STEPS_CHANGED);
            }
        }
        Message::PermissionRequest {
            session,
            cwd,
            tool,
            tool_use_id,
            input,
            truncated,
        } => {
            let request = view(&session, &cwd, &tool, input, truncated, orca_root, now);
            let tool_use_id = id_of(&tool_use_id);
            let Some(Some((id, answers))) = with_book(book, |b| b.open(request, tool_use_id))
            else {
                return;
            };
            let reply = |answer: Answer| match answer {
                Answer::Allow => {
                    connection.reply(b"allow\n");
                }
                Answer::Deny => {
                    connection.reply(b"deny\n");
                }
                // Released: say nothing, and the terminal keeps the question.
                Answer::Release => {}
            };
            notify(APPROVALS_CHANGED);
            let asked = Instant::now();
            loop {
                match answers.recv_timeout(limits.tick) {
                    Ok(answer) => return reply(answer),
                    // The book went away with the app.
                    Err(RecvTimeoutError::Disconnected) => return,
                    Err(RecvTimeoutError::Timeout) => {
                        let waited = asked.elapsed();
                        let unseen = waited > limits.shown
                            && with_book(book, |b| b.is_shown(&id)) != Some(true);
                        if connection.client_gone() || waited > limits.answer || unseen {
                            if with_book(book, |b| b.close(&id)) == Some(true) {
                                notify(APPROVALS_CHANGED);
                            } else if let Ok(answer) = answers.try_recv() {
                                // The request was already gone from the book: someone answered between the wait
                                // running out and this check. That click was real and is on the channel — it
                                // must not be dropped just because it tied with the clock.
                                reply(answer);
                            }
                            return;
                        }
                    }
                }
            }
        }
    }
}

/// Opens the pipe and serves the relay for as long as the app runs.
#[cfg(windows)]
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;

    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("claude-approvals".into())
        .spawn(move || {
            let Some(name) = pipe::pipe_name() else {
                eprintln!("winbar claude approvals: no user SID, the hook relay stays off");
                return;
            };
            let mut listener = match pipe::Listener::bind(&name) {
                Ok(listener) => listener,
                Err(err) => {
                    // Most likely the name is taken. Serving on top of someone else's pipe is not an option.
                    eprintln!(
                        "winbar claude approvals: cannot open the pipe: {}",
                        err.kind()
                    );
                    return;
                }
            };
            if let Some(state) = app.try_state::<ApprovalsState>() {
                state.listening.store(true, Ordering::Relaxed);
            }
            let active = Arc::new(AtomicUsize::new(0));
            loop {
                let connection = match listener.accept() {
                    Ok(connection) => connection,
                    Err(err) => {
                        eprintln!("winbar claude approvals: accept failed: {}", err.kind());
                        std::thread::sleep(Duration::from_secs(1));
                        continue;
                    }
                };
                if active.load(Ordering::Relaxed) >= MAX_CONNECTIONS {
                    continue;
                }
                let app = app.clone();
                let active = active.clone();
                active.fetch_add(1, Ordering::Relaxed);
                let spawned = std::thread::Builder::new()
                    .name("claude-approval".into())
                    .spawn({
                        let active = active.clone();
                        move || {
                            handle(&app, &connection);
                            active.fetch_sub(1, Ordering::Relaxed);
                        }
                    });
                if spawned.is_err() {
                    active.fetch_sub(1, Ordering::Relaxed);
                }
            }
        });
}

#[cfg(not(windows))]
pub fn start<R: Runtime>(_app: &AppHandle<R>) {}

#[cfg(windows)]
fn handle<R: Runtime>(app: &AppHandle<R>, connection: &pipe::Connection) {
    let (Some(state), Some(settings), Some(claude)) = (
        app.try_state::<ApprovalsState>(),
        app.try_state::<SettingsState>(),
        app.try_state::<super::ClaudeState>(),
    ) else {
        return;
    };
    if !accepting(&settings.get(), crate::window::is_hidden(app)) {
        return;
    }
    serve(
        &state.book,
        connection,
        &claude.orca_root,
        super::now_ms(),
        LIMITS,
        &|event| {
            let _ = app.emit(event, ());
        },
    );
}

/// Whether the call comes from a notch window. Requests and steps are command lines and file names: only the
/// window that draws them gets to read them, and only it gets to say one is on screen or answer it.
fn from_notch<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    crate::window::is_notch_label(window.label())
}

/// The requests waiting for an answer, oldest first.
#[tauri::command]
pub fn claude_approvals<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, ApprovalsState>,
) -> Vec<Approval> {
    if !from_notch(&window) {
        return Vec::new();
    }
    with_book(&state.book, |b| b.list()).unwrap_or_default()
}

/// The page has the request on screen: a person can act on it, so the long wait may begin.
#[tauri::command]
pub fn claude_approval_shown<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, ApprovalsState>,
    id: String,
) {
    if from_notch(&window) {
        with_book(&state.book, |b| b.mark_shown(&id));
    }
}

/// Answers a request: `allow`, `deny`, or `release` to leave it to the terminal.
///
/// Only a notch window may answer. Settings and the command bar have no business approving a tool call, so a
/// call from there is refused rather than trusted.
#[tauri::command]
pub fn claude_approval_decide<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, ApprovalsState>,
    id: String,
    decision: String,
) -> Result<(), String> {
    if !from_notch(&window) {
        return Err("not the notch".into());
    }
    let answer = Answer::parse(&decision).ok_or("unknown decision")?;
    if with_book(&state.book, |b| b.answer(&id, answer)) == Some(true) {
        let _ = window.app_handle().emit(APPROVALS_CHANGED, ());
    }
    Ok(())
}

/// The last few steps of each session, oldest first.
#[tauri::command]
pub fn claude_steps<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, ApprovalsState>,
) -> BTreeMap<String, Vec<String>> {
    if !from_notch(&window) {
        return BTreeMap::new();
    }
    with_book(&state.book, |b| b.steps()).unwrap_or_default()
}

/// How many subagents each session has running (SPEC-claude-notices §4).
#[tauri::command]
pub fn claude_agents<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, ApprovalsState>,
) -> BTreeMap<String, usize> {
    if !from_notch(&window) {
        return BTreeMap::new();
    }
    with_book(&state.book, |b| b.agents()).unwrap_or_default()
}

/// The turns that ended lately, oldest first (SPEC-claude-notices §3). A notice can carry a line of what Claude
/// wrote, so like a request it goes to the notch and nowhere else.
#[tauri::command]
pub fn claude_notices<R: Runtime>(
    window: WebviewWindow<R>,
    state: tauri::State<'_, ApprovalsState>,
) -> Vec<Notice> {
    if !from_notch(&window) {
        return Vec::new();
    }
    with_book(&state.book, |b| b.notices()).unwrap_or_default()
}

fn this_exe() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("Không xác định được đường dẫn winbar: {}", e.kind()))
}

/// Whether winbar's hooks are in Claude Code's settings, and whether winbar is there to hear them. Reads one
/// file, writes nothing. Off the main thread, like every command here that touches the disk.
#[tauri::command(async)]
pub fn claude_hook_status(
    claude: tauri::State<'_, super::ClaudeState>,
    state: tauri::State<'_, ApprovalsState>,
) -> Result<HookStatus, String> {
    Ok(HookStatus {
        listening: state.listening.load(Ordering::Relaxed),
        ..install::status(&claude.claude_dir, &this_exe()?)
    })
}

/// What installing (`install: true`) or removing the hooks would change. Writes nothing.
#[tauri::command(async)]
pub fn claude_hook_preview(
    claude: tauri::State<'_, super::ClaudeState>,
    install: bool,
) -> Result<HookPreview, String> {
    install::preview(&claude.claude_dir, &this_exe()?, install, &install::stamp())
}

/// Writes what the preview showed, after backing the file up. `fingerprint` and `stamp` are the preview's: a
/// file that changed since is left alone, and the backup lands where the preview said it would.
///
/// Only the Settings window may call this — it is the one place that shows the preview first.
#[tauri::command(async)]
pub fn claude_hook_apply<R: Runtime>(
    window: WebviewWindow<R>,
    claude: tauri::State<'_, super::ClaudeState>,
    install: bool,
    fingerprint: String,
    stamp: String,
) -> Result<String, String> {
    if window.label() != crate::settings_window::SETTINGS_LABEL {
        return Err("not the settings window".into());
    }
    install::apply(
        &claude.claude_dir,
        &this_exe()?,
        install,
        &fingerprint,
        &stamp,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::WidgetSetting;
    use serde_json::json;

    #[test]
    fn nobody_can_answer_while_the_layout_the_widget_or_the_notch_is_off() {
        let on = Settings::default();
        assert!(accepting(&on, false));
        assert!(!accepting(&on, true), "a hidden notch shows nothing");

        let mut layout_off = on.clone();
        layout_off.claude.enabled = false;
        assert!(!accepting(&layout_off, false));

        let mut widget_off = on.clone();
        widget_off.widgets = vec![WidgetSetting {
            id: WIDGET.into(),
            enabled: false,
        }];
        assert!(!accepting(&widget_off, false));

        // Another widget being off is no reason, and neither is the widget being listed as on.
        let mut other_off = on;
        other_off.widgets = vec![
            WidgetSetting {
                id: "media".into(),
                enabled: false,
            },
            WidgetSetting {
                id: WIDGET.into(),
                enabled: true,
            },
        ];
        assert!(accepting(&other_off, false));
    }

    #[test]
    fn a_request_is_named_like_its_session_and_cleaned_before_it_is_drawn() {
        let orca = r"C:\Users\me\orca";
        let request = view(
            "s1",
            r"C:\Users\me\orca\workspaces\shop\checkout-fix",
            "Bash",
            json!({ "command": "echo ok\nrm -rf \u{202e}x" }),
            false,
            orca,
            42,
        );
        assert_eq!(request.title, "checkout-fix");
        assert_eq!(request.project.as_deref(), Some("shop"));
        assert_eq!(request.summary, "echo ok ⏎ rm -rf \\u{202e}x");
        assert_eq!(request.detail, "command:\n  echo ok\n  rm -rf \\u{202e}x");
        assert!(!request.truncated);
        assert!(
            !request.complete,
            "two lines are never the whole request on one line"
        );
        assert_eq!(request.received_at, 42);

        let outside = view(
            "s2",
            r"D:\work\blog-tools\",
            "Read",
            json!(null),
            true,
            orca,
            1,
        );
        assert_eq!(outside.title, "blog-tools");
        assert_eq!(outside.project, None);
        assert_eq!(outside.detail, "");
        assert!(outside.truncated, "what the relay cut stays marked");
        assert_eq!(
            view("s3", "", "Read", json!(null), false, orca, 1).title,
            "(không rõ)"
        );
    }

    #[test]
    fn the_pill_may_allow_only_a_request_it_shows_whole_and_uncut() {
        let short = |truncated| {
            view(
                "s",
                r"C:\w\shop",
                "Bash",
                json!({ "command": "npm test" }),
                truncated,
                "",
                1,
            )
        };
        assert!(short(false).complete);
        assert!(
            !short(true).complete,
            "the relay cut something: the line cannot be all of it"
        );
        let edit = view(
            "s",
            r"C:\w\shop",
            "Write",
            json!({ "file_path": "a.txt", "content": "x" }),
            false,
            "",
            1,
        );
        assert!(!edit.complete);
    }

    #[test]
    fn what_comes_over_the_pipe_is_capped_again_whoever_sent_it() {
        // Not the relay: something else writing to the pipe, with none of the relay's limits applied.
        let request = view(
            &"s".repeat(5_000),
            &format!(r"C:\work\{}", "d".repeat(5_000)),
            &"T".repeat(5_000),
            json!({ "command": "c".repeat(50_000) }),
            false,
            "",
            1,
        );
        assert_eq!(request.session_id.chars().count(), protocol::MAX_ID);
        assert_eq!(request.tool.chars().count(), protocol::MAX_ID);
        assert!(request.title.chars().count() <= MAX_NAME);
        assert!(request.truncated);
        assert!(!request.complete);
        assert!(
            request.detail.contains("… [đã cắt "),
            "the cut is marked in place"
        );
        assert!(request.detail.chars().count() < protocol::MAX_DETAIL);
    }

    #[test]
    fn no_request_serialises_anything_but_what_the_page_draws() {
        let request = view(
            "s1",
            r"C:\w\shop",
            "Bash",
            json!({ "command": "ls" }),
            false,
            "",
            7,
        );
        let value = serde_json::to_value(&request).expect("serialises");
        let mut keys: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "complete",
                "detail",
                "id",
                "receivedAt",
                "sessionId",
                "summary",
                "title",
                "tool",
                "truncated"
            ]
        );
    }

    #[test]
    fn a_notice_is_cleaned_capped_and_timed_whoever_sent_it() {
        let book = Mutex::new(Book::default());
        let quiet = |_: &'static str| {};
        with_book(&book, |b| b.turn_started("s1", 1_000));
        let reply = format!("{}\nsecond line", "x".repeat(400));
        turn_ended(&book, "s1", "C:\\work\\shop", "", 46_000, Ok(&reply), &quiet);
        turn_ended(&book, "s2", "C:\\work\\other", "", 50_000, Ok(""), &quiet);
        turn_ended(&book, "s3", "", "", 51_000, Err("<script>"), &quiet);

        let notices = with_book(&book, |b| b.notices()).unwrap();
        let line = notices[0].summary.as_deref().unwrap();
        assert_eq!(line.chars().count(), protocol::MAX_NOTICE);
        assert!(!line.contains("second"));
        assert_eq!(notices[0].turn_ms, Some(45_000));
        assert_eq!(notices[0].at, 46_000);
        // No reply, and a turn whose start winbar never saw.
        assert_eq!((notices[1].summary.as_deref(), notices[1].turn_ms), (None, None));
        // Whatever the sender called the error, the page gets a code it knows or `unknown`.
        assert_eq!(notices[2].reason.as_deref(), Some("unknown"));
        assert_eq!(notices[2].title, "(không rõ)");
    }

    #[cfg(windows)]
    mod over_a_real_pipe {
        use super::super::*;
        use std::sync::{Arc, Mutex};
        use std::time::{Duration, Instant};

        const QUICK: Limits = Limits {
            read: Duration::from_secs(2),
            shown: Duration::from_millis(300),
            answer: Duration::from_millis(1500),
            tick: Duration::from_millis(20),
        };

        struct Fixture {
            name: String,
            book: Arc<Mutex<Book>>,
            events: Arc<Mutex<Vec<&'static str>>>,
            server: std::thread::JoinHandle<()>,
        }

        /// A server that takes `connections` connections on a pipe of its own, then stops.
        fn serving(tag: &str, connections: usize) -> Fixture {
            let name = format!(
                r"\\.\pipe\winbar-test-serve-{}-{tag}-{}",
                std::process::id(),
                pipe::current_sid().expect("a SID")
            );
            let book = Arc::new(Mutex::new(Book::default()));
            let events = Arc::new(Mutex::new(Vec::new()));
            let mut listener = pipe::Listener::bind(&name).expect("binds");
            let server = std::thread::spawn({
                let (book, events) = (book.clone(), events.clone());
                move || {
                    let workers: Vec<_> = (0..connections)
                        .map(|_| {
                            let connection = listener.accept().expect("accepts");
                            let (book, events) = (book.clone(), events.clone());
                            std::thread::spawn(move || {
                                serve(&book, &connection, "", 1, QUICK, &|event| {
                                    events.lock().unwrap().push(event)
                                });
                            })
                        })
                        .collect();
                    workers.into_iter().for_each(|w| w.join().expect("worker"));
                }
            });
            Fixture {
                name,
                book,
                events,
                server,
            }
        }

        /// What the relay does with one hook event, minus stdin and stdout.
        fn relay(name: &str, hook: serde_json::Value) -> Option<String> {
            let message = protocol::from_hook(hook.to_string().as_bytes()).expect("a known event");
            let mut client = pipe::connect(name, Duration::from_secs(2)).expect("connects");
            assert!(client.send(protocol::to_line(&message).expect("fits").as_bytes()));
            message
                .waits_for_answer()
                .then(|| client.read_answer())
                .flatten()
        }

        fn ask(session: &str, tool_use_id: &str) -> serde_json::Value {
            serde_json::json!({
                "session_id": session, "cwd": "C:\\work\\shop", "hook_event_name": "PermissionRequest",
                "tool_name": "Bash", "tool_use_id": tool_use_id, "tool_input": { "command": "git push" }
            })
        }

        /// Waits until the book lists `count` requests and returns them.
        fn listed(book: &Mutex<Book>, count: usize) -> Vec<Approval> {
            let until = Instant::now() + Duration::from_secs(3);
            loop {
                let list = book.lock().unwrap().list();
                if list.len() == count {
                    return list;
                }
                assert!(
                    Instant::now() < until,
                    "expected {count} requests, have {}",
                    list.len()
                );
                std::thread::sleep(Duration::from_millis(5));
            }
        }

        #[test]
        fn a_click_on_allow_reaches_the_relay() {
            let f = serving("allow", 1);
            let name = f.name.clone();
            let client = std::thread::spawn(move || relay(&name, ask("s1", "t1")));

            let request = listed(&f.book, 1).remove(0);
            assert_eq!(request.summary, "git push");
            assert_eq!(request.title, "shop");
            f.book.lock().unwrap().mark_shown(&request.id);
            assert!(f.book.lock().unwrap().answer(&request.id, Answer::Allow));

            assert_eq!(client.join().expect("relay").as_deref(), Some("allow"));
            f.server.join().expect("server");
            assert_eq!(*f.events.lock().unwrap(), [APPROVALS_CHANGED]);
        }

        #[test]
        fn a_click_on_deny_reaches_the_relay() {
            let f = serving("deny", 1);
            let name = f.name.clone();
            let client = std::thread::spawn(move || relay(&name, ask("s1", "t1")));
            let request = listed(&f.book, 1).remove(0);
            f.book.lock().unwrap().mark_shown(&request.id);
            f.book.lock().unwrap().answer(&request.id, Answer::Deny);
            assert_eq!(client.join().expect("relay").as_deref(), Some("deny"));
            f.server.join().expect("server");
        }

        #[test]
        fn leaving_it_to_the_terminal_sends_the_relay_nothing() {
            let f = serving("release", 1);
            let name = f.name.clone();
            let client = std::thread::spawn(move || relay(&name, ask("s1", "t1")));
            let request = listed(&f.book, 1).remove(0);
            f.book.lock().unwrap().mark_shown(&request.id);
            f.book.lock().unwrap().answer(&request.id, Answer::Release);
            assert_eq!(client.join().expect("relay"), None);
            f.server.join().expect("server");
        }

        #[test]
        fn a_page_that_never_shows_the_pill_costs_a_moment_not_minutes() {
            let f = serving("unseen", 1);
            let started = Instant::now();
            // Nobody calls mark_shown: a dead or missing page.
            assert_eq!(relay(&f.name, ask("s1", "t1")), None);
            let waited = started.elapsed();
            assert!(waited >= QUICK.shown && waited < QUICK.answer, "{waited:?}");
            f.server.join().expect("server");
            assert!(f.book.lock().unwrap().list().is_empty());
            assert_eq!(
                *f.events.lock().unwrap(),
                [APPROVALS_CHANGED, APPROVALS_CHANGED]
            );
        }

        #[test]
        fn nobody_answering_ends_at_the_limit_and_the_request_goes_away() {
            let f = serving("timeout", 1);
            let name = f.name.clone();
            let started = Instant::now();
            let client = std::thread::spawn(move || relay(&name, ask("s1", "t1")));
            let request = listed(&f.book, 1).remove(0);
            f.book.lock().unwrap().mark_shown(&request.id);
            assert_eq!(client.join().expect("relay"), None);
            assert!(started.elapsed() >= QUICK.answer);
            f.server.join().expect("server");
            assert!(f.book.lock().unwrap().list().is_empty());
        }

        #[test]
        fn a_relay_that_claude_code_stopped_takes_its_request_off_the_notch() {
            let f = serving("gone", 1);
            let message = protocol::from_hook(ask("s1", "t1").to_string().as_bytes()).unwrap();
            let mut client = pipe::connect(&f.name, Duration::from_secs(2)).expect("connects");
            assert!(client.send(protocol::to_line(&message).unwrap().as_bytes()));
            let request = listed(&f.book, 1).remove(0);
            f.book.lock().unwrap().mark_shown(&request.id);
            // The user answered in the terminal and Claude Code killed the hook.
            drop(client);
            listed(&f.book, 0);
            f.server.join().expect("server");
            assert!(
                !f.book.lock().unwrap().answer(&request.id, Answer::Allow),
                "a late click finds nothing"
            );
        }

        #[test]
        fn a_tool_that_ran_releases_the_request_still_on_the_notch() {
            // Allowed in the terminal: the permission hook is still waiting when PostToolUse arrives.
            let f = serving("ran", 2);
            let name = f.name.clone();
            let client = std::thread::spawn(move || relay(&name, ask("s1", "toolu_7")));
            let request = listed(&f.book, 1).remove(0);
            f.book.lock().unwrap().mark_shown(&request.id);

            relay(
                &f.name,
                serde_json::json!({
                    "session_id": "s1", "hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_use_id": "toolu_7"
                }),
            );
            assert_eq!(
                client.join().expect("relay"),
                None,
                "no answer: Claude Code already has one"
            );
            f.server.join().expect("server");
            assert!(f.book.lock().unwrap().list().is_empty());
        }

        /// Sends one event and waits until the server has dealt with it, so the next one cannot overtake it.
        fn relay_and_wait(f: &Fixture, hook: serde_json::Value, done: impl Fn(&Book) -> bool) {
            relay(&f.name, hook);
            let until = Instant::now() + Duration::from_secs(3);
            while !done(&f.book.lock().unwrap()) {
                assert!(Instant::now() < until, "the event never arrived");
                std::thread::sleep(Duration::from_millis(5));
            }
        }

        #[test]
        fn the_end_of_a_turn_leaves_a_notice_and_no_subagents() {
            let f = serving("notices", 5);
            let event = |name: &str, more: serde_json::Value| {
                let mut hook = serde_json::json!({ "session_id": "s1", "cwd": "C:\\work\\shop", "hook_event_name": name });
                hook.as_object_mut().unwrap().extend(more.as_object().unwrap().clone());
                hook
            };
            relay_and_wait(&f, event("UserPromptSubmit", serde_json::json!({ "prompt": "secret" })), |_| true);
            relay_and_wait(&f, event("SubagentStart", serde_json::json!({ "agent_id": "a1" })), |b| {
                b.agents().get("s1") == Some(&1)
            });
            relay_and_wait(&f, event("SubagentStart", serde_json::json!({ "agent_id": "a2" })), |b| {
                b.agents().get("s1") == Some(&2)
            });
            relay_and_wait(
                &f,
                event("Stop", serde_json::json!({ "last_assistant_message": "## Xong\u{202e} rồi\nphần còn lại" })),
                |b| b.notices().len() == 1,
            );
            relay_and_wait(&f, event("StopFailure", serde_json::json!({ "error": "rate_limit" })), |b| {
                b.notices().len() == 2
            });
            f.server.join().expect("server");

            let book = f.book.lock().unwrap();
            assert!(book.agents().is_empty(), "the turn ended with a subagent still counted");
            let notices = book.notices();
            assert_eq!(notices[0].kind, NoticeKind::Finished);
            assert_eq!(notices[0].title, "shop");
            // One line, and the character that would have reversed it is spelled out.
            assert_eq!(notices[0].summary.as_deref(), Some("Xong\\u{202e} rồi"));
            assert_eq!(notices[1].kind, NoticeKind::Failed);
            assert_eq!(notices[1].reason.as_deref(), Some("rate_limit"));
            assert_eq!(notices[1].summary, None);
            let events = f.events.lock().unwrap();
            assert_eq!(events.iter().filter(|e| **e == NOTICES_CHANGED).count(), 2);
            // Two subagents starting, and the stop that cleared them.
            assert_eq!(events.iter().filter(|e| **e == STEPS_CHANGED).count(), 3);
        }

        #[test]
        fn steps_build_up_and_a_new_prompt_clears_them() {
            let f = serving("steps", 3);
            relay(
                &f.name,
                serde_json::json!({
                    "session_id": "s1", "hook_event_name": "PreToolUse", "tool_name": "Read",
                    "tool_input": { "file_path": "C:\\work\\shop\\src\\cart.ts" }
                }),
            );
            relay(
                &f.name,
                serde_json::json!({
                    "session_id": "s1", "hook_event_name": "PreToolUse", "tool_name": "Bash",
                    "tool_input": { "command": "npm test" }
                }),
            );
            let until = Instant::now() + Duration::from_secs(3);
            while f.book.lock().unwrap().steps().get("s1").map_or(0, Vec::len) < 2 {
                assert!(Instant::now() < until, "the steps never arrived");
                std::thread::sleep(Duration::from_millis(5));
            }
            let mut steps = f.book.lock().unwrap().steps()["s1"].clone();
            // Two relays race for the pipe; either order is a fair outcome of that.
            steps.sort();
            assert_eq!(steps, ["Bash · npm test", "Read · cart.ts"]);

            relay(
                &f.name,
                serde_json::json!({
                    "session_id": "s1", "hook_event_name": "UserPromptSubmit", "prompt": "secret"
                }),
            );
            f.server.join().expect("server");
            assert!(f.book.lock().unwrap().steps().is_empty());
            assert_eq!(
                *f.events.lock().unwrap(),
                [STEPS_CHANGED, STEPS_CHANGED, STEPS_CHANGED]
            );
        }

        #[test]
        fn rubbish_on_the_pipe_changes_nothing() {
            let f = serving("rubbish", 2);
            let mut client = pipe::connect(&f.name, Duration::from_secs(2)).expect("connects");
            assert!(client.send(b"this is not json\n"));
            assert_eq!(client.read_answer(), None);
            let mut client = pipe::connect(&f.name, Duration::from_secs(2)).expect("connects");
            assert!(client.send(b"{\"event\":\"Shutdown\",\"session\":\"s1\"}\n"));
            assert_eq!(client.read_answer(), None);
            f.server.join().expect("server");
            assert!(f.book.lock().unwrap().list().is_empty());
            assert!(f.events.lock().unwrap().is_empty());
        }
    }
}
