//! What the relay tells the running winbar, and how a tool call is put into words (SPEC-claude-approvals §4).
//!
//! Nothing here touches a pipe, a window or the disk, so all of it is tested directly. Two rules matter more than
//! the rest: a prompt never leaves the relay, and what the notch shows for a request is what Claude Code will run —
//! no character is allowed to hide, reorder or disappear on the way to the screen.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Longest string kept from a tool's input. A single `Write` can carry a whole file.
pub const MAX_STRING: usize = 4_000;
/// Longest message on the pipe, in bytes. Past this the input is dropped and the request says so.
pub const MAX_LINE: usize = 256 * 1024;
/// Longest step label and one-line summary, in characters.
pub const MAX_LABEL: usize = 80;
pub const MAX_SUMMARY: usize = 200;
/// Longest text handed to the full card.
pub const MAX_DETAIL: usize = 16_000;
/// Longest line taken from a reply for the "finished" notice (SPEC-claude-notices §3).
pub const MAX_NOTICE: usize = 140;
/// A session id is a UUID; anything much longer is not one.
pub const MAX_ID: usize = 128;
/// Longest working directory kept. A path is a few hundred characters; the cap only stops a silly value.
pub const MAX_CWD: usize = 1024;

/// The first `max` characters of `text`. For values that are identifiers, not prose: nothing marks the cut.
pub fn capped(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// One line on the pipe, relay to server.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "event", rename_all_fields = "camelCase")]
pub enum Message {
    PermissionRequest {
        session: String,
        cwd: String,
        tool: String,
        tool_use_id: String,
        input: Value,
        /// Something was cut on the way: the card must not claim to show everything.
        truncated: bool,
    },
    PreToolUse {
        session: String,
        label: String,
    },
    PostToolUse {
        session: String,
        tool_use_id: String,
    },
    UserPromptSubmit {
        session: String,
    },
    /// The turn ended. The last two fields are absent on a line from a relay older than SPEC-claude-notices.
    Stop {
        session: String,
        #[serde(default)]
        cwd: String,
        /// One line from the reply that ended the turn; empty when there was none.
        #[serde(default)]
        summary: String,
    },
    /// The turn ended in an error. `reason` is Claude Code's error type, e.g. `rate_limit`.
    StopFailure {
        session: String,
        #[serde(default)]
        cwd: String,
        #[serde(default)]
        reason: String,
    },
    SubagentStart {
        session: String,
        agent: String,
    },
    SubagentStop {
        session: String,
        agent: String,
    },
}

impl Message {
    /// Only a permission request keeps its connection open for an answer.
    pub fn waits_for_answer(&self) -> bool {
        matches!(self, Message::PermissionRequest { .. })
    }
}

fn text(map: &Map<String, Value>, key: &str, max: usize) -> String {
    map.get(key)
        .and_then(Value::as_str)
        .map(|s| capped(s, max))
        .unwrap_or_default()
}

/// Builds the message for one hook invocation from the JSON Claude Code wrote to stdin.
///
/// Only the named fields are picked out. Everything else — the prompt of a `UserPromptSubmit`, a transcript path,
/// a tool's response — never reaches the pipe, because it is never copied in the first place.
pub fn from_hook(raw: &[u8]) -> Option<Message> {
    let raw = raw.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(raw);
    let value: Value = serde_json::from_slice(raw).ok()?;
    let map = value.as_object()?;
    let session = text(map, "session_id", MAX_ID);
    if session.is_empty() {
        return None;
    }
    let tool = text(map, "tool_name", MAX_ID);
    let tool_use_id = text(map, "tool_use_id", MAX_ID);
    match map.get("hook_event_name").and_then(Value::as_str)? {
        "PermissionRequest" => {
            let mut input = map.get("tool_input").cloned().unwrap_or(Value::Null);
            let truncated = truncate_strings(&mut input, MAX_STRING);
            Some(Message::PermissionRequest {
                session,
                cwd: text(map, "cwd", MAX_CWD),
                tool,
                tool_use_id,
                input,
                truncated,
            })
        }
        "PreToolUse" => Some(Message::PreToolUse {
            session,
            label: step_label(&tool, map.get("tool_input").unwrap_or(&Value::Null)),
        }),
        "PostToolUse" => Some(Message::PostToolUse {
            session,
            tool_use_id,
        }),
        "UserPromptSubmit" => Some(Message::UserPromptSubmit { session }),
        "Stop" => Some(Message::Stop {
            session,
            cwd: text(map, "cwd", MAX_CWD),
            summary: summary_line(
                map.get("last_assistant_message")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            ),
        }),
        "StopFailure" => Some(Message::StopFailure {
            session,
            cwd: text(map, "cwd", MAX_CWD),
            reason: text(map, "error", MAX_ID),
        }),
        event @ ("SubagentStart" | "SubagentStop") => {
            let agent = text(map, "agent_id", MAX_ID);
            if agent.is_empty() {
                return None;
            }
            Some(if event == "SubagentStart" {
                Message::SubagentStart { session, agent }
            } else {
                Message::SubagentStop { session, agent }
            })
        }
        _ => None,
    }
}

/// The one line of a reply the notch shows when a turn finishes: the first line with words in it, without the
/// markdown that opens it, cut to `MAX_NOTICE`. A reply is the model's own text and can be pages long; the rest
/// of it never leaves the relay.
pub fn summary_line(reply: &str) -> String {
    reply
        .lines()
        .map(|line| line.trim().trim_start_matches(['#', '-', '*', '>', ' ']).trim())
        .find(|line| !line.starts_with("```") && line.chars().any(char::is_alphanumeric))
        .map(|line| cut(line, MAX_NOTICE))
        .unwrap_or_default()
}

/// Claude Code's error type as a plain code: lower-case letters and underscores, or `unknown`. The page turns
/// the code into words of its own, so nothing a sender wrote here is ever drawn.
pub fn reason_code(raw: &str) -> String {
    let plain = !raw.is_empty() && raw.len() <= 40 && raw.chars().all(|c| c.is_ascii_lowercase() || c == '_');
    if plain { raw.to_string() } else { "unknown".to_string() }
}

/// The line to write to the pipe, newline included.
///
/// A request too large to send loses its input rather than being dropped: the notch can still say which tool is
/// asking, and that the rest has to be read in the terminal.
pub fn to_line(message: &Message) -> Option<String> {
    let mut line = serde_json::to_string(message).ok()?;
    if line.len() >= MAX_LINE {
        let Message::PermissionRequest {
            session,
            cwd,
            tool,
            tool_use_id,
            ..
        } = message
        else {
            return None;
        };
        line = serde_json::to_string(&Message::PermissionRequest {
            session: session.clone(),
            cwd: cwd.clone(),
            tool: tool.clone(),
            tool_use_id: tool_use_id.clone(),
            input: Value::Null,
            truncated: true,
        })
        .ok()?;
        if line.len() >= MAX_LINE {
            return None;
        }
    }
    line.push('\n');
    Some(line)
}

/// Caps every string in a tool's input at `max` characters. Returns whether anything was cut.
///
/// A cut string says so where it ends, and by how much: a marker under the whole card would not tell which of
/// several fields is the incomplete one.
pub fn truncate_strings(value: &mut Value, max: usize) -> bool {
    match value {
        Value::String(s) => match s.char_indices().nth(max) {
            Some((end, _)) => {
                let dropped = s[end..].chars().count();
                s.truncate(end);
                s.push_str(&format!("… [đã cắt {dropped} ký tự]"));
                true
            }
            None => false,
        },
        // Every element is visited: `any` would stop at the first cut and leave the rest whole.
        Value::Array(items) => {
            let mut cut = false;
            for item in items {
                cut |= truncate_strings(item, max);
            }
            cut
        }
        Value::Object(map) => {
            let mut cut = false;
            for item in map.values_mut() {
                cut |= truncate_strings(item, max);
            }
            cut
        }
        _ => false,
    }
}

/// Characters that draw nothing, draw as a blank that is not a plain space, or change the order the ones around
/// them are drawn in.
fn is_invisible(c: char) -> bool {
    matches!(c,
        '\u{00AD}' | '\u{034F}' | '\u{061C}' | '\u{115F}' | '\u{1160}'
        | '\u{180B}'..='\u{180E}'
        | '\u{200B}'..='\u{200F}'
        | '\u{2028}'..='\u{202E}'
        | '\u{2060}'..='\u{206F}'
        | '\u{2800}' | '\u{3164}'
        | '\u{FE00}'..='\u{FE0F}'
        | '\u{FEFF}' | '\u{FFA0}'
        | '\u{FFF9}'..='\u{FFFB}'
        | '\u{E0000}'..='\u{E007F}'
        | '\u{E0100}'..='\u{E01EF}')
}

/// Makes `text` safe to put in front of someone who is about to approve it.
///
/// Control characters, bidirectional overrides, zero-width characters and every blank that is not an ordinary
/// space are spelled out as `\u{…}` instead of being drawn: an override can make `rm -rf` read as something
/// harmless, a zero-width character can hide a difference between two paths, and a run of wide blanks can push the
/// rest of a line out of sight. With `multiline` off a line break becomes ` ⏎ `, so a second line can never sit
/// below the first where nobody looks.
///
/// Not covered: letters from another script that merely look like Latin ones.
pub fn clean(text: &str, multiline: bool) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            // A Windows line ending is one line break, not a stray control character and a line break.
            '\r' if chars.peek() == Some(&'\n') => {}
            '\n' if multiline => out.push('\n'),
            '\n' => out.push_str(" ⏎ "),
            '\t' if multiline => out.push('\t'),
            '\t' => out.push(' '),
            ' ' => out.push(' '),
            c if c.is_control() || c.is_whitespace() || is_invisible(c) => {
                out.push_str(&format!("\\u{{{:x}}}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

/// Cuts to `max` characters, ending in `…` when something was dropped.
fn cut(text: &str, max: usize) -> String {
    match text.char_indices().nth(max.saturating_sub(1)) {
        Some((end, _)) if text[end..].chars().nth(1).is_some() => format!("{}…", &text[..end]),
        _ => text.to_string(),
    }
}

/// The fields that say what a tool is about to do, most specific first.
///
/// `description` is deliberately not one of them. It is free text the model writes about its own call, and a
/// request must be described by what it will do, not by what it says it will do.
const TARGET_FIELDS: [&str; 7] = [
    "command",
    "file_path",
    "notebook_path",
    "path",
    "url",
    "query",
    "pattern",
];

/// Fields that change nothing about what a tool does to the machine, so the pill may leave them out and still
/// count as showing the whole request. Everything not listed here is assumed to matter.
fn harmless(tool: &str, key: &str) -> bool {
    match tool {
        "Bash" | "PowerShell" => matches!(key, "description" | "timeout" | "run_in_background"),
        "Read" => matches!(key, "offset" | "limit"),
        _ => false,
    }
}

fn field<'a>(input: &'a Value, key: &str) -> Option<&'a str> {
    input
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

/// One line for the pill: the tool and the thing it wants to touch.
///
/// A shell command stands on its own. The pill has room for about thirty characters, and "Bash · " in front of
/// `git push` spends seven of them on what the command already says; the full card names the tool either way.
///
/// The second value says whether that line **is** the request: one field, on one line, shown in full, with nothing
/// else in the input that could change what happens. Only then may the pill offer to allow it without the card
/// being opened (SPEC §4.5). Whether the line also fits the pill's width is for the page to measure.
pub fn summary(tool: &str, input: &Value) -> (String, bool) {
    let shell = matches!(tool, "Bash" | "PowerShell");
    let name = clean(tool, false);
    let target = TARGET_FIELDS
        .iter()
        .find_map(|key| field(input, key).map(|value| (*key, value)));
    let (line, shortened) = match target {
        Some(("command", command)) if shell => (clean(command, false), false),
        Some(("file_path" | "notebook_path" | "path", path)) => {
            let tail = path_tail(path);
            let shortened = tail != path;
            (format!("{name} · {}", clean(&tail, false)), shortened)
        }
        Some((_, target)) => (format!("{name} · {}", clean(target, false)), false),
        None => (name, false),
    };
    let text = cut(&line, MAX_SUMMARY);
    let whole = match (input.as_object(), target) {
        (Some(fields), Some((key, value))) => {
            !shortened
                && text == line
                && !value.contains(['\n', '\r'])
                && fields.keys().all(|k| k == key || harmless(tool, k))
        }
        _ => false,
    };
    (text, whole)
}

/// A path longer than the pill can show, reduced to its last two components behind an ellipsis.
///
/// The pill cuts text at the right, which for a path is the file name — the part that says what is about to be
/// written. `…\.ssh\config` tells more than `C:\Users\someone\AppData\…`. The full path is on the card.
fn path_tail(path: &str) -> String {
    const FITS: usize = 30;
    if path.chars().count() <= FITS {
        return path.to_string();
    }
    let separator = if path.contains('\\') { '\\' } else { '/' };
    let parts: Vec<&str> = path
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .collect();
    match parts.as_slice() {
        [.., parent, name] => format!("…{separator}{parent}{separator}{name}"),
        _ => path.to_string(),
    }
}

/// Everything the tool was given, for the full card. Returns the text and whether it had to be cut.
///
/// One field per line, `name: value`, starting at the left edge. A value that runs over several lines goes on the
/// lines below its name, each indented — so a line inside a value can never pass for a field of its own, however
/// it is written.
pub fn detail(input: &Value) -> (String, bool) {
    let text = match input {
        Value::Null => String::new(),
        Value::Object(map) => map
            .iter()
            .map(|(key, value)| {
                let key = clean(key, false);
                match value {
                    Value::String(s) if s.contains(['\n', '\r']) => {
                        let body = clean(s, true);
                        let lines: Vec<String> = body.lines().map(|l| format!("  {l}")).collect();
                        format!("{key}:\n{}", lines.join("\n"))
                    }
                    Value::String(s) => format!("{key}: {}", clean(s, true)),
                    // Compact JSON: strings inside it keep their line breaks escaped, so it is one line.
                    other => format!("{key}: {}", clean(&other.to_string(), false)),
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        other => clean(&other.to_string(), false),
    };
    match text.char_indices().nth(MAX_DETAIL) {
        Some((end, _)) => {
            let dropped = text[end..].chars().count();
            (
                format!("{}\n… [đã cắt {dropped} ký tự]", &text[..end]),
                true,
            )
        }
        None => (text, false),
    }
}

/// The last component of a path, whichever slash it uses.
fn file_name(path: &str) -> &str {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(path)
}

/// The host of a URL, without scheme, credentials, port or path.
fn host(url: &str) -> &str {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    let host = authority.rsplit('@').next().unwrap_or(authority);
    host.split(':').next().unwrap_or(host)
}

/// What one step reads as in the sessions card (SPEC §4.6).
///
/// Deliberately less than the tool was given: a file is its name without the folders above it, a fetch is its
/// host. The line sits on screen for anyone walking past.
pub fn step_label(tool: &str, input: &Value) -> String {
    let target = match tool {
        "Bash" | "PowerShell" => field(input, "command").map(|c| c.lines().next().unwrap_or(c)),
        "Read" | "Edit" | "Write" | "MultiEdit" => field(input, "file_path").map(file_name),
        "NotebookEdit" => field(input, "notebook_path").map(file_name),
        "Grep" | "Glob" => field(input, "pattern"),
        "WebFetch" => field(input, "url").map(host),
        "WebSearch" => field(input, "query"),
        "Task" | "Agent" => field(input, "description"),
        _ => None,
    };
    let tool = clean(tool, false);
    let line = match target {
        // A step sits on screen with nobody asked to look at it, unlike a request someone has to read to answer.
        // A command carrying a key or a password is named by its tool alone.
        Some(target) if crate::clipboard::secrets::looks_secret(target) => {
            format!("{tool} · (ẩn: có vẻ chứa bí mật)")
        }
        Some(target) => format!("{tool} · {}", clean(target, false)),
        None => tool,
    };
    cut(&line, MAX_LABEL)
}

/// What the island's answer becomes on the hook's stdout. Anything that is not exactly `allow` or `deny` prints
/// nothing, and Claude Code carries on asking in the terminal.
pub fn decision_json(answer: &str) -> Option<&'static str> {
    match answer.trim() {
        "allow" => Some(
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}"#,
        ),
        "deny" => Some(
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied by the user from winbar."}}}"#,
        ),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn hook(value: Value) -> Option<Message> {
        from_hook(value.to_string().as_bytes())
    }

    #[test]
    fn a_permission_request_keeps_what_the_card_needs() {
        let message = hook(json!({
            "session_id": "abc", "cwd": "C:\\work\\shop", "hook_event_name": "PermissionRequest",
            "tool_name": "Bash", "tool_use_id": "toolu_1", "tool_input": { "command": "git push" },
            "transcript_path": "C:\\secret\\transcript.jsonl", "permission_mode": "default"
        }))
        .expect("parses");
        assert_eq!(
            message,
            Message::PermissionRequest {
                session: "abc".into(),
                cwd: "C:\\work\\shop".into(),
                tool: "Bash".into(),
                tool_use_id: "toolu_1".into(),
                input: json!({ "command": "git push" }),
                truncated: false,
            }
        );
        assert!(message.waits_for_answer());
        assert!(!to_line(&message).expect("fits").contains("transcript"));
    }

    #[test]
    fn a_prompt_never_reaches_the_pipe() {
        let message = hook(json!({
            "session_id": "abc", "hook_event_name": "UserPromptSubmit",
            "prompt": "my password is hunter2", "prompt_text": "my password is hunter2"
        }))
        .expect("parses");
        assert_eq!(
            message,
            Message::UserPromptSubmit {
                session: "abc".into()
            }
        );
        let line = to_line(&message).expect("fits");
        assert!(!line.contains("hunter2"), "{line}");
        assert!(!message.waits_for_answer());
    }

    #[test]
    fn a_tool_response_never_reaches_the_pipe() {
        let line = to_line(
            &hook(json!({
                "session_id": "abc", "hook_event_name": "PostToolUse", "tool_name": "Read",
                "tool_use_id": "toolu_9", "tool_input": { "file_path": "C:\\a\\.env" },
                "tool_response": "API_KEY=sk-live-123"
            }))
            .expect("parses"),
        )
        .expect("fits");
        assert!(!line.contains("sk-live"), "{line}");
        assert!(!line.contains(".env"), "{line}");
        assert!(line.contains("toolu_9"));
    }

    #[test]
    fn events_winbar_does_not_handle_and_broken_input_are_dropped() {
        assert!(hook(json!({ "session_id": "a", "hook_event_name": "SessionStart" })).is_none());
        assert!(
            hook(json!({ "hook_event_name": "Stop" })).is_none(),
            "no session"
        );
        assert!(hook(json!([1, 2, 3])).is_none());
        assert!(from_hook(b"{ not json").is_none());
        assert!(from_hook(b"").is_none());
    }

    #[test]
    fn a_byte_order_mark_does_not_defeat_the_parser() {
        let mut raw = vec![0xEF, 0xBB, 0xBF];
        raw.extend_from_slice(br#"{"session_id":"a","hook_event_name":"Stop"}"#);
        assert_eq!(
            from_hook(&raw),
            Some(Message::Stop {
                session: "a".into(),
                cwd: String::new(),
                summary: String::new(),
            })
        );
    }

    #[test]
    fn a_finished_turn_carries_one_line_of_the_reply_and_no_more() {
        let reply = "\n## Xong rồi\n\nĐã sửa 3 test ở `cart.ts`.\n- chi tiết một\n- chi tiết hai";
        assert_eq!(
            hook(json!({
                "session_id": "a", "cwd": "C:\\work\\shop", "hook_event_name": "Stop",
                "last_assistant_message": reply, "stop_hook_active": false
            })),
            Some(Message::Stop { session: "a".into(), cwd: "C:\\work\\shop".into(), summary: "Xong rồi".into() })
        );
        assert_eq!(summary_line("- **Đã xong** phần đầu"), "Đã xong** phần đầu");
        assert_eq!(summary_line("```ts\nconst a = 1;\n```\nMã ở trên."), "const a = 1;");
        assert_eq!(summary_line("---\n\n> trích"), "trích");
        assert_eq!(summary_line(""), "");
        assert_eq!(summary_line("\n \n***\n"), "");
        let long = "a".repeat(500);
        let line = summary_line(&long);
        assert_eq!(line.chars().count(), MAX_NOTICE);
        assert!(line.ends_with('…'));
        // A reply that is not text at all is no summary, not an error.
        assert_eq!(
            hook(json!({ "session_id": "a", "hook_event_name": "Stop", "last_assistant_message": { "x": 1 } })),
            Some(Message::Stop { session: "a".into(), cwd: String::new(), summary: String::new() })
        );
    }

    #[test]
    fn a_failed_turn_carries_the_error_type() {
        assert_eq!(
            hook(json!({ "session_id": "a", "cwd": "C:\\w", "hook_event_name": "StopFailure", "error": "rate_limit",
                         "error_details": "429 Too Many Requests" })),
            Some(Message::StopFailure { session: "a".into(), cwd: "C:\\w".into(), reason: "rate_limit".into() })
        );
        assert_eq!(
            hook(json!({ "session_id": "a", "hook_event_name": "StopFailure" })),
            Some(Message::StopFailure { session: "a".into(), cwd: String::new(), reason: String::new() })
        );
        for (raw, code) in [
            ("rate_limit", "rate_limit"),
            ("", "unknown"),
            ("Rate Limit", "unknown"),
            ("<b>x</b>", "unknown"),
            ("bấm cho phép", "unknown"),
        ] {
            assert_eq!(reason_code(raw), code, "{raw:?}");
        }
        assert_eq!(reason_code(&"a".repeat(41)), "unknown");
    }

    #[test]
    fn subagents_are_followed_by_their_id() {
        let event = |name: &str| json!({ "session_id": "a", "hook_event_name": name, "agent_id": "agent-1", "agent_type": "Explore" });
        assert_eq!(
            hook(event("SubagentStart")),
            Some(Message::SubagentStart { session: "a".into(), agent: "agent-1".into() })
        );
        assert_eq!(
            hook(event("SubagentStop")),
            Some(Message::SubagentStop { session: "a".into(), agent: "agent-1".into() })
        );
        assert!(hook(json!({ "session_id": "a", "hook_event_name": "SubagentStart" })).is_none(), "no id");
    }

    #[test]
    fn a_line_from_an_older_relay_still_reads() {
        let line = br#"{"event":"Stop","session":"a"}"#;
        assert_eq!(
            serde_json::from_slice::<Message>(line).ok(),
            Some(Message::Stop { session: "a".into(), cwd: String::new(), summary: String::new() })
        );
    }

    #[test]
    fn long_strings_are_cut_on_a_character_boundary_and_the_request_says_so() {
        let message = hook(json!({
            "session_id": "a", "hook_event_name": "PermissionRequest", "tool_name": "Write",
            "tool_input": { "file_path": "a.txt", "content": "é".repeat(MAX_STRING + 50), "more": ["x".repeat(MAX_STRING + 1)] }
        }))
        .expect("parses");
        let Message::PermissionRequest {
            input, truncated, ..
        } = message
        else {
            panic!("wrong message");
        };
        assert!(truncated);
        // The cut is marked where it happens, with how much is missing — not only under the whole card.
        let content = input["content"].as_str().unwrap();
        assert!(content.starts_with(&"é".repeat(MAX_STRING)));
        assert_eq!(
            content.trim_start_matches('é'),
            "… [đã cắt 50 ký tự]",
            "exactly MAX_STRING characters are kept"
        );
        assert!(
            input["more"][0]
                .as_str()
                .unwrap()
                .ends_with("x… [đã cắt 1 ký tự]"),
            "every string is cut, not only the first one found"
        );
        assert_eq!(input["file_path"], "a.txt");

        // The server caps again with a little room to spare, so a marked string is not cut a second time.
        let mut again = input.clone();
        assert!(!truncate_strings(&mut again, MAX_STRING + 100));
        assert_eq!(again, input);
    }

    #[test]
    fn a_request_too_large_for_the_pipe_loses_its_input_but_still_asks() {
        let many: Vec<String> = (0..200).map(|_| "x".repeat(MAX_STRING)).collect();
        let message = Message::PermissionRequest {
            session: "a".into(),
            cwd: "C:\\w".into(),
            tool: "Write".into(),
            tool_use_id: "t".into(),
            input: json!({ "parts": many }),
            truncated: false,
        };
        let line = to_line(&message).expect("still sent");
        assert!(line.len() < MAX_LINE);
        let back: Message = serde_json::from_str(line.trim_end()).expect("parses");
        assert_eq!(
            back,
            Message::PermissionRequest {
                session: "a".into(),
                cwd: "C:\\w".into(),
                tool: "Write".into(),
                tool_use_id: "t".into(),
                input: Value::Null,
                truncated: true,
            }
        );
    }

    #[test]
    fn the_line_survives_a_round_trip() {
        let message = Message::PreToolUse {
            session: "a".into(),
            label: "Bash · npm test".into(),
        };
        let line = to_line(&message).expect("fits");
        assert!(line.ends_with('\n'));
        assert_eq!(line.matches('\n').count(), 1, "exactly one line");
        assert_eq!(
            serde_json::from_str::<Message>(line.trim_end()).unwrap(),
            message
        );
    }

    #[test]
    fn nothing_invisible_is_drawn() {
        // A right-to-left override is the classic: the text after it is drawn backwards.
        assert_eq!(clean("rm \u{202E}fr- x", false), "rm \\u{202e}fr- x");
        assert_eq!(clean("a\u{200B}b\u{FEFF}c", false), "a\\u{200b}b\\u{feff}c");
        assert_eq!(
            clean("bell\u{7}esc\u{1b}[2J", false),
            "bell\\u{7}esc\\u{1b}[2J"
        );
        assert_eq!(clean("plain – tiếng Việt ✓", false), "plain – tiếng Việt ✓");
        // Blanks that are not a plain space can pad a line until the rest of it is off the pill.
        assert_eq!(
            clean("ls\u{00A0}\u{3000}\u{2003}\u{2800}x", false),
            "ls\\u{a0}\\u{3000}\\u{2003}\\u{2800}x"
        );
        // Fillers and selectors that draw nothing at all.
        assert_eq!(
            clean("a\u{3164}b\u{FE0F}c\u{206A}d", false),
            "a\\u{3164}b\\u{fe0f}c\\u{206a}d"
        );
        assert_eq!(clean("two  spaces stay", false), "two  spaces stay");
    }

    #[test]
    fn a_second_line_cannot_hide_on_the_pill() {
        assert_eq!(clean("echo ok\nrm -rf ~", false), "echo ok ⏎ rm -rf ~");
        assert_eq!(clean("echo ok\r\nrm -rf ~", false), "echo ok ⏎ rm -rf ~");
        assert_eq!(clean("a\tb", false), "a b");
        // …and on the card it is simply a second line.
        assert_eq!(clean("echo ok\r\nrm -rf ~", true), "echo ok\nrm -rf ~");
        // A carriage return on its own would send a terminal back to the start of the line.
        assert_eq!(clean("safe\rdanger", true), "safe\\u{d}danger");
    }

    /// The pill's line for a request, without the "is this all of it" half.
    fn line(tool: &str, input: Value) -> String {
        summary(tool, &input).0
    }

    /// Whether the pill's line is the whole request.
    fn whole(tool: &str, input: Value) -> bool {
        summary(tool, &input).1
    }

    #[test]
    fn the_summary_names_the_tool_and_its_target() {
        assert_eq!(
            line(
                "Bash",
                json!({ "command": "git push origin main", "description": "Push" })
            ),
            "git push origin main"
        );
        assert_eq!(
            line("PowerShell", json!({ "command": "Remove-Item x" })),
            "Remove-Item x"
        );
        assert_eq!(
            line(
                "Write",
                json!({ "file_path": "C:\\a\\.env", "content": "KEY=1" })
            ),
            "Write · C:\\a\\.env"
        );
        assert_eq!(
            line("mcp__db__drop", json!({ "table": "users" })),
            "mcp__db__drop"
        );
        assert_eq!(line("Bash", Value::Null), "Bash");
        let long = line("Bash", json!({ "command": "x".repeat(500) }));
        assert_eq!(long.chars().count(), MAX_SUMMARY);
        assert!(long.ends_with('…'));
    }

    #[test]
    fn what_the_model_says_about_a_call_is_never_shown_as_the_call() {
        // `description` is the model's own account of what it is doing. A destructive call described as a
        // harmless one must not read as the harmless one.
        assert_eq!(
            line(
                "mcp__db__exec",
                json!({ "sql": "DROP TABLE users", "description": "List tables" })
            ),
            "mcp__db__exec"
        );
        assert_eq!(line("Bash", json!({ "description": "Push" })), "Bash");
    }

    #[test]
    fn the_pill_may_only_offer_to_allow_what_it_shows_in_full() {
        // One short command, and nothing else that matters: the line is the request.
        assert!(whole("Bash", json!({ "command": "npm test" })));
        assert!(whole(
            "Bash",
            json!({ "command": "git push", "description": "Push", "timeout": 60000, "run_in_background": false })
        ));
        assert!(whole(
            "Read",
            json!({ "file_path": "C:\\work\\a.txt", "limit": 50 })
        ));

        // A second line, however it is spelled.
        assert!(!whole("Bash", json!({ "command": "echo ok\nrm -rf ~" })));
        assert!(!whole("Bash", json!({ "command": "echo ok\r\nrm -rf ~" })));
        // More than the summary keeps.
        assert!(!whole("Bash", json!({ "command": "x".repeat(500) })));
        // A path shown by its tail only.
        assert!(!whole(
            "Read",
            json!({ "file_path": "C:\\Users\\someone\\AppData\\Roaming\\.ssh\\config" })
        ));
        // Fields the line says nothing about: what gets written, an unknown switch, a tool with no target at all.
        assert!(!whole(
            "Write",
            json!({ "file_path": "a.txt", "content": "anything" })
        ));
        assert!(!whole(
            "Bash",
            json!({ "command": "ls", "dangerouslyDisableSandbox": true })
        ));
        assert!(!whole(
            "mcp__db__exec",
            json!({ "sql": "DROP TABLE users" })
        ));
        assert!(!whole(
            "WebFetch",
            json!({ "url": "https://example.com", "prompt": "summarise" })
        ));
        // Nothing to judge.
        assert!(!whole("Bash", Value::Null));
        assert!(!whole("Bash", json!("just a string")));
        assert!(!whole("Bash", json!({ "description": "Push" })));
    }

    #[test]
    fn a_long_path_keeps_its_end_on_the_pill() {
        assert_eq!(
            line(
                "Edit",
                json!({ "file_path": "C:\\Users\\someone\\AppData\\Roaming\\.ssh\\config" })
            ),
            "Edit · …\\.ssh\\config"
        );
        assert_eq!(
            line(
                "Read",
                json!({ "path": "/home/someone/projects/shop-app/src/cart.ts" })
            ),
            "Read · …/src/cart.ts"
        );
        // Short enough to show whole: nothing is hidden behind an ellipsis that did not need to be.
        assert_eq!(
            line("Write", json!({ "file_path": "C:\\work\\a.txt" })),
            "Write · C:\\work\\a.txt"
        );
        // The card always has the whole path.
        let (full, _) =
            detail(&json!({ "file_path": "C:\\Users\\someone\\AppData\\Roaming\\.ssh\\config" }));
        assert_eq!(
            full,
            "file_path: C:\\Users\\someone\\AppData\\Roaming\\.ssh\\config"
        );
    }

    #[test]
    fn a_step_that_carries_a_secret_is_named_by_its_tool_alone() {
        for command in [
            "curl -H 'Authorization: Bearer abcdefghijklmnop' https://api.example.com",
            "export API_KEY=sk-live-1234567890abcdef",
            "mysql --password=hunter2hunter2",
            "gh auth login --with-token ghp_abcdefghijklmnopqrstuvwx",
        ] {
            let label = step_label("Bash", &json!({ "command": command }));
            assert_eq!(label, "Bash · (ẩn: có vẻ chứa bí mật)", "{command}");
        }
        // …while a request to approve the same command shows all of it: you cannot approve what you cannot read.
        assert_eq!(
            line(
                "Bash",
                json!({ "command": "mysql --password=hunter2hunter2" })
            ),
            "mysql --password=hunter2hunter2"
        );
        assert_eq!(
            step_label("Bash", &json!({ "command": "git status" })),
            "Bash · git status"
        );
    }

    #[test]
    fn the_detail_shows_every_field() {
        let (text, cut) = detail(&json!({
            "file_path": "a.txt", "old_string": "one\ntwo", "replace_all": true
        }));
        assert_eq!(
            text,
            "file_path: a.txt\nold_string:\n  one\n  two\nreplace_all: true"
        );
        assert!(!cut);
        assert_eq!(detail(&Value::Null), (String::new(), false));
        let (text, cut) = detail(
            &json!({ "content": "y".repeat(MAX_STRING), "b": "y".repeat(MAX_STRING),
            "c": "y".repeat(MAX_STRING), "d": "y".repeat(MAX_STRING), "e": "y".repeat(MAX_STRING) }),
        );
        assert!(cut);
        let (kept, marker) = text.rsplit_once('\n').expect("a marker line");
        assert_eq!(kept.chars().count(), MAX_DETAIL);
        assert!(
            marker.starts_with("… [đã cắt ") && marker.ends_with(" ký tự]"),
            "{marker}"
        );
    }

    #[test]
    fn a_line_inside_a_value_cannot_pass_for_a_field() {
        // The value tries to look like the card ends and a harmless field follows.
        let (text, _) = detail(&json!({
            "command": "rm -rf ~\nfile_path: safe.txt\ncommand: echo hello",
            "note": { "nested": "a\nb" }
        }));
        assert_eq!(
            text,
            "command:\n  rm -rf ~\n  file_path: safe.txt\n  command: echo hello\nnote: {\"nested\":\"a\\nb\"}"
        );
        // Only real fields start at the left edge.
        let fields: Vec<&str> = text.lines().filter(|l| !l.starts_with(' ')).collect();
        assert_eq!(fields, ["command:", "note: {\"nested\":\"a\\nb\"}"]);
    }

    #[test]
    fn the_detail_keeps_the_order_the_tool_gave() {
        // `command` before `description`, not alphabetical by accident: this is what `preserve_order` is for.
        let input: Value = serde_json::from_str(r#"{"zeta":"1","alpha":"2"}"#).unwrap();
        assert_eq!(detail(&input).0, "zeta: 1\nalpha: 2");
    }

    #[test]
    fn a_step_says_less_than_the_tool_was_given() {
        let label = |tool: &str, input: Value| step_label(tool, &input);
        assert_eq!(
            label("Bash", json!({ "command": "npm test\nrm x" })),
            "Bash · npm test"
        );
        assert_eq!(
            label(
                "Read",
                json!({ "file_path": "C:\\Users\\me\\secret-project\\src\\cart.ts" })
            ),
            "Read · cart.ts"
        );
        assert_eq!(
            label("Edit", json!({ "file_path": "/home/me/a/b.rs" })),
            "Edit · b.rs"
        );
        assert_eq!(
            label("Grep", json!({ "pattern": "applyDiscount" })),
            "Grep · applyDiscount"
        );
        assert_eq!(
            label(
                "WebFetch",
                json!({ "url": "https://user:pw@example.com:8443/a/b?token=1" })
            ),
            "WebFetch · example.com"
        );
        assert_eq!(
            label(
                "Task",
                json!({ "description": "Audit auth", "prompt": "long" })
            ),
            "Task · Audit auth"
        );
        assert_eq!(
            label("mcp__x__y", json!({ "anything": "at all" })),
            "mcp__x__y"
        );
        assert_eq!(
            label("Bash", json!({ "command": "x".repeat(300) }))
                .chars()
                .count(),
            MAX_LABEL
        );
    }

    #[test]
    fn the_answer_is_the_documented_json_or_nothing() {
        assert_eq!(
            decision_json("allow\n").unwrap(),
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}"#
        );
        let deny: Value = serde_json::from_str(decision_json("deny").unwrap()).unwrap();
        assert_eq!(deny["hookSpecificOutput"]["decision"]["behavior"], "deny");
        assert!(deny["hookSpecificOutput"]["decision"]["message"].is_string());
        for other in [
            "",
            "release",
            "ALLOW",
            "allow deny",
            r#"{"behavior":"allow"}"#,
        ] {
            assert!(
                decision_json(other).is_none(),
                "{other:?} must print nothing"
            );
        }
    }
}
