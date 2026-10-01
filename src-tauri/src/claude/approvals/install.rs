//! Adding winbar's hooks to Claude Code's `settings.json`, and taking them out again (SPEC-claude-approvals §4.7).
//!
//! This is the only code in winbar that writes into Claude Code's configuration, so it is strict about it:
//!
//! * the file is read first, and anything that is not a JSON object is refused — never treated as empty, because
//!   "empty plus our hooks" written back would erase everything the user had;
//! * nothing is written without a preview, and the write is refused if the file changed since that preview;
//! * the old file is copied aside before the new one replaces it, and the replacement is atomic, so a crash
//!   leaves either the old file or the new one, never half of each;
//! * only hooks whose command is exactly the one winbar writes are added or removed — hook by hook, not group by
//!   group. Everybody else's hooks, and every other key, stay exactly where they were.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Map, Value};

use super::relay::FLAG;

/// Seconds Claude Code lets the permission hook run: the server's 300, the relay's 305, and a margin.
const DECISION_TIMEOUT: u64 = 310;
/// The other events only pass a line along.
const QUICK_TIMEOUT: u64 = 5;

/// The events winbar listens to. Only the first one holds Claude Code's attention; the rest run in the
/// background (`async`), so a tool call never waits for winbar.
const EVENTS: [(&str, bool); 5] = [
    ("PermissionRequest", false),
    ("PreToolUse", true),
    ("PostToolUse", true),
    ("UserPromptSubmit", true),
    ("Stop", true),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HookState {
    Absent,
    Installed,
    /// winbar's hooks are there but not the ones this build would write — usually the exe has moved.
    Stale,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookStatus {
    pub state: HookState,
    pub settings_path: String,
    /// winbar has its pipe open, so an installed hook has someone to talk to. Filled in by the caller.
    pub listening: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookPreview {
    pub diff: String,
    /// Where the current file will be copied before the write. Empty when there is no file yet.
    pub backup_path: String,
    pub settings_path: String,
    /// Identifies the bytes this preview was computed from; `apply` only writes over those same bytes.
    pub fingerprint: String,
    /// The time this preview was made, as it appears in the backup's name. Handed back to `apply` so the backup
    /// lands where this preview says it will.
    pub stamp: String,
    /// The file is not laid out the way winbar writes JSON, so indentation will change beyond what the diff shows.
    pub reformats: bool,
    /// Nothing would change: there is nothing to write.
    pub unchanged: bool,
}

pub fn settings_path(claude_dir: &Path) -> PathBuf {
    claude_dir.join("settings.json")
}

/// The command written into `settings.json` for this exe.
///
/// Claude Code runs it through Git Bash, so the path is single-quoted — nothing inside single quotes is expanded,
/// which a `$` or a backtick in a folder name would otherwise be — and a single quote in the path is closed,
/// escaped and reopened. Under PowerShell the same line is a syntax error, which fails the hook without running
/// anything.
pub fn hook_command(exe: &Path) -> String {
    let path = exe.to_string_lossy().replace('\\', "/");
    // The verbatim prefix `current_exe` can return means nothing to a shell: `//?/C:/…` is `C:/…`, and
    // `//?/UNC/server/share` is `//server/share`.
    let path = match (path.strip_prefix("//?/UNC/"), path.strip_prefix("//?/")) {
        (Some(share), _) => format!("//{share}"),
        (None, Some(local)) => local.to_string(),
        (None, None) => path,
    };
    format!("'{}' {FLAG}", path.replace('\'', r"'\''"))
}

/// One hook as winbar writes it.
fn hook(command: &str, background: bool) -> Value {
    if background {
        json!({ "type": "command", "command": command, "async": true, "timeout": QUICK_TIMEOUT })
    } else {
        json!({ "type": "command", "command": command, "timeout": DECISION_TIMEOUT })
    }
}

/// The matcher group winbar adds: its one hook, matching every tool.
fn entry(command: &str, background: bool) -> Value {
    json!({ "hooks": [hook(command, background)] })
}

/// Whether one hook object is winbar's: a command of exactly the shape `hook_command` writes, a quoted path and
/// the flag and nothing else. A wrapper script that happens to pass the flag along is somebody else's hook.
fn is_ours(hook: &Value) -> bool {
    hook.get("type").and_then(Value::as_str) == Some("command")
        && hook
            .get("command")
            .and_then(Value::as_str)
            .is_some_and(|c| c.starts_with('\'') && c.ends_with(&format!("' {FLAG}")))
}

/// A matcher group with winbar's hooks taken out. `None` when that leaves it with no hooks at all.
///
/// Hook by hook: someone may have moved winbar's hook into a group of their own, next to a hook of theirs, and
/// removing the group would take theirs with it.
fn group_without_ours(group: &Value) -> Option<Value> {
    let Some(hooks) = group.get("hooks").and_then(Value::as_array) else {
        return Some(group.clone());
    };
    if !hooks.iter().any(is_ours) {
        return Some(group.clone());
    }
    let rest: Vec<Value> = hooks.iter().filter(|h| !is_ours(h)).cloned().collect();
    if rest.is_empty() {
        return None;
    }
    let mut group = group.clone();
    group["hooks"] = Value::Array(rest);
    Some(group)
}

/// `settings` with every winbar hook removed. A group left with no hooks because of that is dropped, then an
/// event left with no groups, then a `hooks` object left with no events; anything that was already empty is left
/// alone.
fn without_ours(settings: &Value) -> Value {
    let mut root = settings.as_object().cloned().unwrap_or_default();
    let Some(Value::Object(hooks)) = root.get("hooks") else {
        return Value::Object(root);
    };
    let mut kept = Map::new();
    let mut dropped_an_event = false;
    for (event, groups) in hooks {
        match groups.as_array() {
            Some(list) => {
                let rest: Vec<Value> = list.iter().filter_map(group_without_ours).collect();
                if rest.is_empty() && !list.is_empty() {
                    dropped_an_event = true;
                } else {
                    kept.insert(event.clone(), Value::Array(rest));
                }
            }
            // Not a shape winbar understands: not winbar's to touch.
            None => {
                kept.insert(event.clone(), groups.clone());
            }
        }
    }
    if kept.is_empty() && dropped_an_event {
        root.shift_remove("hooks");
    } else {
        root.insert("hooks".into(), Value::Object(kept));
    }
    Value::Object(root)
}

/// `settings` with winbar's hooks for `command` in place, replacing any older ones.
///
/// Refuses a `hooks` section that is not shaped the way Claude Code documents it, rather than writing over a
/// value it does not understand.
fn with_ours(settings: &Value, command: &str) -> Result<Value, String> {
    let odd =
        |what: &str| format!("Mục {what} trong settings.json có dạng lạ. winbar không ghi đè nó.");
    let mut root = match without_ours(settings) {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    let mut hooks = match root.get("hooks") {
        Some(Value::Object(map)) => map.clone(),
        None => Map::new(),
        Some(_) => return Err(odd("hooks")),
    };
    for (event, background) in EVENTS {
        let mut groups = match hooks.get(event) {
            Some(Value::Array(list)) => list.clone(),
            None => Vec::new(),
            Some(_) => return Err(odd(&format!("hooks.{event}"))),
        };
        groups.push(entry(command, background));
        hooks.insert(event.to_string(), Value::Array(groups));
    }
    root.insert("hooks".into(), Value::Object(hooks));
    Ok(Value::Object(root))
}

fn state_of(settings: &Value, command: &str) -> HookState {
    // Every winbar hook in the file, with the event it hangs on — whichever group it sits in.
    let ours: Vec<(&str, &Value)> = settings
        .get("hooks")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .flat_map(|(event, groups)| {
            groups
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|group| group.get("hooks").and_then(Value::as_array))
                .flatten()
                .filter(|h| is_ours(h))
                .map(move |h| (event.as_str(), h))
        })
        .collect();
    if ours.is_empty() {
        return HookState::Absent;
    }
    let complete = ours.len() == EVENTS.len()
        && EVENTS
            .iter()
            .all(|(event, background)| ours.contains(&(*event, &hook(command, *background))));
    if complete {
        HookState::Installed
    } else {
        HookState::Stale
    }
}

/// Parses `settings.json`. Only an absent or blank file counts as "start from nothing".
fn parse(bytes: &[u8]) -> Result<Value, String> {
    // PowerShell's `Set-Content -Encoding utf8` writes a byte order mark, which serde_json refuses.
    let text = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    if text.iter().all(u8::is_ascii_whitespace) {
        return Ok(json!({}));
    }
    match serde_json::from_slice::<Value>(text) {
        Ok(value) if value.is_object() => Ok(value),
        Ok(_) => Err("settings.json không phải một JSON object. winbar không ghi vào file này.".into()),
        Err(err) => Err(format!(
            "settings.json không phải JSON hợp lệ (dòng {}, cột {}). Sửa file rồi thử lại; winbar không ghi đè nó.",
            err.line(),
            err.column()
        )),
    }
}

/// A settings file is a few kilobytes. One this large is not something to parse, diff and rewrite.
const MAX_FILE: u64 = 4 * 1024 * 1024;
/// The most cells the diff's table may have: about 16 MB of it. Past this the change is not shown line by line —
/// and what cannot be shown is not written.
const MAX_DIFF_CELLS: usize = 4_000_000;

/// The file's bytes and what they parse to. A missing file is an empty object; any other failure to read is an
/// error, because not knowing what is in there is not the same as it being empty.
fn read(path: &Path) -> Result<(Vec<u8>, Value), String> {
    if std::fs::metadata(path).is_ok_and(|meta| meta.len() > MAX_FILE) {
        return Err(
            "settings.json lớn bất thường (trên 4 MB). winbar không ghi vào file này.".into(),
        );
    }
    match std::fs::read(path) {
        Ok(bytes) => {
            let value = parse(&bytes)?;
            Ok((bytes, value))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok((Vec::new(), json!({}))),
        Err(err) => Err(format!("Không đọc được settings.json: {}", err.kind())),
    }
}

fn pretty(value: &Value) -> String {
    let mut text = serde_json::to_string_pretty(value).unwrap_or_default();
    text.push('\n');
    text
}

/// FNV-1a over the file's bytes. The only question it answers is "is this still the file I showed you?".
fn fingerprint(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf2_9ce4_8422_2325u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    });
    format!("{hash:016x}")
}

/// Line diff with three lines of context around each change: a plain longest-common-subsequence table, the
/// simplest thing that is certainly right.
///
/// The lines the two texts share at the start and at the end are set aside first, so the table only covers the
/// stretch that actually differs. `None` when even that stretch is too long to tabulate.
fn diff(before: &str, after: &str) -> Option<String> {
    let all_a: Vec<&str> = before.lines().collect();
    let all_b: Vec<&str> = after.lines().collect();
    let head = all_a.iter().zip(&all_b).take_while(|(x, y)| x == y).count();
    let tail = all_a[head..]
        .iter()
        .rev()
        .zip(all_b[head..].iter().rev())
        .take_while(|(x, y)| x == y)
        .count();
    let a = &all_a[head..all_a.len() - tail];
    let b = &all_b[head..all_b.len() - tail];
    if (a.len() + 1).saturating_mul(b.len() + 1) > MAX_DIFF_CELLS {
        return None;
    }
    let mut common = vec![vec![0u32; b.len() + 1]; a.len() + 1];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            common[i][j] = if a[i] == b[j] {
                common[i + 1][j + 1] + 1
            } else {
                common[i + 1][j].max(common[i][j + 1])
            };
        }
    }
    let mut lines: Vec<(char, &str)> = all_a[..head].iter().map(|line| (' ', *line)).collect();
    let (mut i, mut j) = (0, 0);
    while i < a.len() || j < b.len() {
        if i < a.len() && j < b.len() && a[i] == b[j] {
            lines.push((' ', a[i]));
            i += 1;
            j += 1;
        } else if j == b.len() || (i < a.len() && common[i + 1][j] >= common[i][j + 1]) {
            lines.push(('-', a[i]));
            i += 1;
        } else {
            lines.push(('+', b[j]));
            j += 1;
        }
    }
    lines.extend(all_a[all_a.len() - tail..].iter().map(|line| (' ', *line)));

    const CONTEXT: usize = 3;
    let mut keep = vec![false; lines.len()];
    for (at, (mark, _)) in lines.iter().enumerate() {
        if *mark != ' ' {
            let from = at.saturating_sub(CONTEXT);
            let to = (at + CONTEXT + 1).min(lines.len());
            keep[from..to].iter_mut().for_each(|k| *k = true);
        }
    }
    let mut out = String::new();
    let mut in_gap = false;
    for (at, (mark, text)) in lines.iter().enumerate() {
        if keep[at] {
            out.push(*mark);
            out.push(' ');
            out.push_str(text);
            out.push('\n');
            in_gap = false;
        } else if !in_gap {
            out.push_str("  …\n");
            in_gap = true;
        }
    }
    Some(out)
}

pub fn status(claude_dir: &Path, exe: &Path) -> HookStatus {
    let path = settings_path(claude_dir);
    // A file that cannot be read shows as "absent" here; pressing the button then says why it cannot be used.
    let state = read(&path)
        .map(|(_, settings)| state_of(&settings, &hook_command(exe)))
        .unwrap_or(HookState::Absent);
    HookStatus {
        state,
        settings_path: path.to_string_lossy().into_owned(),
        listening: false,
    }
}

fn backup_path(path: &Path, stamp: &str) -> PathBuf {
    path.with_file_name(format!("settings.json.winbar-{stamp}.bak"))
}

/// Whether `stamp` is one `stamp()` could have made: `yyyymmdd-hhmmss`, digits and one dash. It comes back from
/// the page and becomes part of a file name, so nothing else is let through.
fn is_stamp(stamp: &str) -> bool {
    let bytes = stamp.as_bytes();
    bytes.len() == 15
        && bytes.iter().enumerate().all(|(at, b)| {
            if at == 8 {
                *b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
}

/// Writes `bytes` to a new file and makes sure they are on the disk before returning. Fails if the file exists.
fn write_new(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

/// Copies the old settings aside without ever writing over an earlier backup: a second write in the same second
/// gets `-2`, `-3`… after the stamp.
fn back_up(path: &Path, stamp: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    let mut last = std::io::Error::other("no free backup name");
    for attempt in 1..=20 {
        let name = if attempt == 1 {
            stamp.to_string()
        } else {
            format!("{stamp}-{attempt}")
        };
        let backup = backup_path(path, &name);
        match write_new(&backup, bytes) {
            Ok(()) => return Ok(backup),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => last = err,
            Err(err) => return Err(err),
        }
    }
    Err(last)
}

/// Puts `temp` in place of `target` in one step.
///
/// `ReplaceFileW` when there is a file to replace: unlike a rename it keeps the old file's permissions and
/// attributes, so a settings file someone locked down stays locked down. A rename otherwise.
#[cfg(windows)]
fn replace(temp: &Path, target: &Path) -> std::io::Result<()> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Storage::FileSystem::{
        ReplaceFileW, REPLACEFILE_IGNORE_ACL_ERRORS, REPLACEFILE_IGNORE_MERGE_ERRORS,
    };
    if target.exists() {
        // SAFETY: both names are NUL-terminated strings that live across the call; no backup name is passed.
        let replaced = unsafe {
            ReplaceFileW(
                &HSTRING::from(target.as_os_str()),
                &HSTRING::from(temp.as_os_str()),
                PCWSTR::null(),
                REPLACEFILE_IGNORE_MERGE_ERRORS | REPLACEFILE_IGNORE_ACL_ERRORS,
                None,
                None,
            )
        };
        if replaced.is_ok() {
            return Ok(());
        }
        // Some file systems do not support it. The rename below is still atomic; it only loses the attributes.
    }
    std::fs::rename(temp, target)
}

#[cfg(not(windows))]
fn replace(temp: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::rename(temp, target)
}

/// What installing (or removing) the hooks would change. Writes nothing.
pub fn preview(
    claude_dir: &Path,
    exe: &Path,
    install: bool,
    stamp: &str,
) -> Result<HookPreview, String> {
    let path = settings_path(claude_dir);
    let (bytes, current) = read(&path)?;
    let next = if install {
        with_ours(&current, &hook_command(exe))?
    } else {
        without_ours(&current)
    };
    let before = pretty(&current);
    let text = String::from_utf8_lossy(bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes));
    let Some(diff) = diff(&before, &pretty(&next)) else {
        return Err(
            "settings.json quá dài để winbar hiện phần thay đổi. Vì không xem trước được nên không ghi gì.".into(),
        );
    };
    Ok(HookPreview {
        diff,
        stamp: stamp.to_string(),
        backup_path: if bytes.is_empty() {
            String::new()
        } else {
            backup_path(&path, stamp).to_string_lossy().into_owned()
        },
        settings_path: path.to_string_lossy().into_owned(),
        fingerprint: fingerprint(&bytes),
        // Line endings are not layout: a CRLF file with the same content reads the same.
        reformats: !bytes.is_empty() && text.replace("\r\n", "\n").trim_end() != before.trim_end(),
        unchanged: next == current,
    })
}

/// Writes what `preview` showed. Returns the backup's path, or an empty string when there was nothing to back up
/// or nothing to change.
///
/// `seen` and `stamp` are the preview's fingerprint and stamp. A failed write leaves the settings file as it was
/// and nothing of winbar's beside it.
pub fn apply(
    claude_dir: &Path,
    exe: &Path,
    install: bool,
    seen: &str,
    stamp: &str,
) -> Result<String, String> {
    const CHANGED: &str =
        "settings.json đã đổi sau khi bạn xem trước. Chưa ghi gì; hãy xem lại phần thay đổi.";
    if !is_stamp(stamp) {
        return Err("Bản xem trước không hợp lệ. Hãy xem lại phần thay đổi.".into());
    }
    let path = settings_path(claude_dir);
    let (bytes, current) = read(&path)?;
    if fingerprint(&bytes) != seen {
        return Err(CHANGED.into());
    }
    let next = if install {
        with_ours(&current, &hook_command(exe))?
    } else {
        without_ours(&current)
    };
    if next == current {
        return Ok(String::new());
    }

    std::fs::create_dir_all(claude_dir)
        .map_err(|e| format!("Không tạo được thư mục cấu hình: {}", e.kind()))?;
    let backup = if bytes.is_empty() {
        None
    } else {
        // The bytes just read, not a second read of the file: the backup is exactly what the preview was made from.
        Some(
            back_up(&path, stamp, &bytes)
                .map_err(|e| format!("Không sao lưu được settings.json: {}", e.kind()))?,
        )
    };
    // From here on a failure must leave no trace: neither the temporary file nor a backup of a write that never
    // happened.
    let undo = |temp: &Path| {
        let _ = std::fs::remove_file(temp);
        if let Some(backup) = &backup {
            let _ = std::fs::remove_file(backup);
        }
    };

    // Where the bytes really live. Someone who keeps their dotfiles in a repository has a link here, and replacing
    // the link would turn it into a plain file and leave the repository's copy behind.
    let target = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    // Written beside the target and flushed to disk, then swapped in: a crash or a full disk leaves the original
    // file whole.
    let temp = target.with_file_name(format!("settings.json.winbar-tmp-{}", std::process::id()));
    let _ = std::fs::remove_file(&temp);
    if let Err(err) = write_new(&temp, pretty(&next).as_bytes()) {
        undo(&temp);
        return Err(format!("Không ghi được settings.json: {}", err.kind()));
    }
    // One last look, as late as it can be: Claude Code saves this file too (an "always allow" rule, say), and a
    // save that landed since the read above must not be written over.
    if std::fs::read(&path).unwrap_or_default() != bytes {
        undo(&temp);
        return Err(CHANGED.into());
    }
    if let Err(err) = replace(&temp, &target) {
        undo(&temp);
        return Err(format!("Không ghi được settings.json: {}", err.kind()));
    }
    Ok(backup
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default())
}

/// `yyyymmdd-hhmmss` in local time: installing and removing in the same minute must not share a backup.
#[cfg(windows)]
pub fn stamp() -> String {
    // SAFETY: GetLocalTime takes no arguments and returns a plain struct.
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
    )
}

#[cfg(not(windows))]
pub fn stamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const EXE: &str = r"C:\Apps\winbar\winbar.exe";
    const STAMP: &str = "20261001-120000";

    fn exe() -> &'static Path {
        Path::new(EXE)
    }

    fn installed(settings: &Value, command: &str) -> Value {
        with_ours(settings, command).expect("a well-formed hooks section")
    }

    /// Lines the diff marks with `mark`, leaving out a bracket that only gained or lost its trailing comma —
    /// adding an element after the last one in a JSON list always touches the line before it.
    fn marked(diff: &str, mark: char) -> Vec<String> {
        diff.lines()
            .filter(|l| l.starts_with(mark))
            .map(|l| l[1..].trim().to_string())
            .filter(|l| !matches!(l.as_str(), "}" | "}," | "]" | "],"))
            .collect()
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("winbar-approvals-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates");
        dir
    }

    /// A settings file shaped like a real one: other tools' hooks on the same events, and keys in no order.
    const REAL: &str = r#"{
  "model": "opus",
  "permissions": {
    "allow": [
      "Bash(npm test:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:\\tools\\status\\lifecycle.js\" pre"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "other-tool.cmd || echo {}",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python start.py"
          }
        ]
      }
    ]
  },
  "alwaysThinkingEnabled": true
}
"#;

    #[test]
    fn the_command_survives_the_shell() {
        assert_eq!(
            hook_command(exe()),
            "'C:/Apps/winbar/winbar.exe' --winbar-claude-hook"
        );
        // Inside single quotes bash expands nothing: not `$HOME`, not a backtick, not a space.
        assert_eq!(
            hook_command(Path::new(r"C:\Users\a $HOME `x`\win bar\winbar.exe")),
            "'C:/Users/a $HOME `x`/win bar/winbar.exe' --winbar-claude-hook"
        );
        // A quote in the path closes the string, adds an escaped quote, and opens it again.
        assert_eq!(
            hook_command(Path::new(r"C:\it's\winbar.exe")),
            r"'C:/it'\''s/winbar.exe' --winbar-claude-hook"
        );
        assert_eq!(
            hook_command(Path::new(r"\\?\C:\Apps\winbar.exe")),
            "'C:/Apps/winbar.exe' --winbar-claude-hook"
        );
        // The verbatim form of a network path names the share, not a folder called "UNC".
        assert_eq!(
            hook_command(Path::new(r"\\?\UNC\server\share\winbar.exe")),
            "'//server/share/winbar.exe' --winbar-claude-hook"
        );
    }

    #[test]
    fn installing_adds_five_entries_and_touches_nothing_else() {
        let before: Value = serde_json::from_str(REAL).unwrap();
        let after = installed(&before, &hook_command(exe()));

        assert_eq!(after["model"], "opus");
        assert_eq!(after["permissions"], before["permissions"]);
        assert_eq!(after["alwaysThinkingEnabled"], true);
        assert_eq!(
            after["hooks"]["SessionStart"],
            before["hooks"]["SessionStart"]
        );

        // Other tools' hooks stay first, exactly as they were; winbar's goes after them.
        let pre = after["hooks"]["PreToolUse"].as_array().unwrap();
        assert_eq!(pre.len(), 2);
        assert_eq!(pre[0], before["hooks"]["PreToolUse"][0]);
        assert_eq!(
            pre[1],
            json!({ "hooks": [{ "type": "command", "command": "'C:/Apps/winbar/winbar.exe' --winbar-claude-hook", "async": true, "timeout": 5 }] })
        );
        let ask = after["hooks"]["PermissionRequest"].as_array().unwrap();
        assert_eq!(ask[0], before["hooks"]["PermissionRequest"][0]);
        assert_eq!(
            ask[1],
            json!({ "hooks": [{ "type": "command", "command": "'C:/Apps/winbar/winbar.exe' --winbar-claude-hook", "timeout": 310 }] }),
            "the one hook Claude Code waits for is not a background one"
        );
        for event in ["PostToolUse", "UserPromptSubmit", "Stop"] {
            assert_eq!(
                after["hooks"][event].as_array().unwrap().len(),
                1,
                "{event}"
            );
            assert_eq!(
                after["hooks"][event][0]["hooks"][0]["async"], true,
                "{event}"
            );
        }
        assert_eq!(state_of(&after, &hook_command(exe())), HookState::Installed);
    }

    #[test]
    fn the_keys_stay_in_the_order_the_user_had_them() {
        let before: Value = serde_json::from_str(REAL).unwrap();
        let after = installed(&before, &hook_command(exe()));
        let keys = |v: &Value| v.as_object().unwrap().keys().cloned().collect::<Vec<_>>();
        assert_eq!(
            keys(&after),
            ["model", "permissions", "hooks", "alwaysThinkingEnabled"]
        );
        assert_eq!(
            keys(&after["hooks"]),
            [
                "PreToolUse",
                "PermissionRequest",
                "SessionStart",
                "PostToolUse",
                "UserPromptSubmit",
                "Stop"
            ]
        );
        assert_eq!(keys(&without_ours(&after)), keys(&before));
    }

    #[test]
    fn removing_puts_the_file_back_exactly() {
        let before: Value = serde_json::from_str(REAL).unwrap();
        let after = installed(&before, &hook_command(exe()));
        assert_eq!(without_ours(&after), before);
        assert_eq!(
            pretty(&without_ours(&after)),
            REAL,
            "byte for byte, key order included"
        );

        // From nothing and back to nothing.
        let empty = json!({});
        let fresh = installed(&empty, &hook_command(exe()));
        assert_eq!(fresh["hooks"].as_object().unwrap().len(), 5);
        assert_eq!(without_ours(&fresh), empty);

        // Things that were already empty, or not winbar's to judge, are left as they are.
        let odd = json!({ "hooks": { "Notification": [], "Weird": "not a list" } });
        assert_eq!(
            without_ours(&installed(&odd, "'x/winbar.exe' --winbar-claude-hook")),
            odd
        );
    }

    #[test]
    fn installing_twice_changes_nothing_the_second_time() {
        let before: Value = serde_json::from_str(REAL).unwrap();
        let once = installed(&before, &hook_command(exe()));
        assert_eq!(installed(&once, &hook_command(exe())), once);
    }

    #[test]
    fn a_moved_exe_is_noticed_and_reinstalling_repoints_every_hook() {
        let old = installed(&json!({}), &hook_command(Path::new(r"D:\old\winbar.exe")));
        let now = hook_command(exe());
        assert_eq!(state_of(&old, &now), HookState::Stale);
        let fixed = installed(&old, &now);
        assert_eq!(state_of(&fixed, &now), HookState::Installed);
        assert!(
            !pretty(&fixed).contains("D:/old"),
            "no entry still points at the old exe"
        );
        for (event, _) in EVENTS {
            assert_eq!(
                fixed["hooks"][event].as_array().unwrap().len(),
                1,
                "{event}"
            );
        }

        // Some of the hooks removed by hand: there, but not whole.
        let mut partial = fixed.clone();
        partial["hooks"]
            .as_object_mut()
            .unwrap()
            .shift_remove("Stop");
        assert_eq!(state_of(&partial, &now), HookState::Stale);
        assert_eq!(state_of(&json!({}), &now), HookState::Absent);
        assert_eq!(
            state_of(&serde_json::from_str(REAL).unwrap(), &now),
            HookState::Absent
        );
    }

    #[test]
    fn another_tools_hook_is_never_taken_for_ours() {
        let theirs = json!({ "hooks": { "PreToolUse": [
            { "hooks": [{ "type": "command", "command": "coucou-hook.exe PreToolUse" }] },
            { "hooks": [{ "type": "command", "command": "winbar-helper.exe" }] },
            { "hooks": [{ "type": "command", "command": "other.exe --claude-hook" }] },
            { "hooks": [{ "type": "http", "url": "http://localhost:1/winbar --winbar-claude-hook" }] },
            // A wrapper that runs winbar's relay among other things is the wrapper's author's hook.
            { "hooks": [{ "type": "command", "command": "log.sh 'C:/Apps/winbar.exe' --winbar-claude-hook" }] },
            { "hooks": [{ "type": "command", "command": "'C:/Apps/winbar.exe' --winbar-claude-hook && notify" }] },
            { "hooks": [{ "type": "command", "command": "winbar.exe --winbar-claude-hook" }] }
        ] } });
        assert_eq!(without_ours(&theirs), theirs);
        assert_eq!(state_of(&theirs, &hook_command(exe())), HookState::Absent);
        // …and installing next to them removes none of them.
        let after = installed(&theirs, &hook_command(exe()));
        assert_eq!(after["hooks"]["PreToolUse"].as_array().unwrap().len(), 8);
        assert_eq!(without_ours(&after), theirs);
    }

    #[test]
    fn a_hook_moved_into_someone_elses_group_leaves_their_hook_behind() {
        // The user tidied winbar's hook into a group of their own. Removing winbar must not remove the group.
        let ours = hook(&hook_command(exe()), true);
        let merged = json!({ "hooks": { "PreToolUse": [
            { "matcher": "Bash", "hooks": [
                { "type": "command", "command": "their-check.sh" },
                ours.clone()
            ] }
        ] } });
        assert_eq!(
            without_ours(&merged),
            json!({ "hooks": { "PreToolUse": [
                { "matcher": "Bash", "hooks": [{ "type": "command", "command": "their-check.sh" }] }
            ] } })
        );
        // Reinstalling puts winbar's hook in a group of its own and still keeps theirs.
        let again = installed(&merged, &hook_command(exe()));
        let groups = again["hooks"]["PreToolUse"].as_array().unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(
            groups[0]["hooks"],
            json!([{ "type": "command", "command": "their-check.sh" }])
        );
        assert_eq!(groups[1], json!({ "hooks": [ours] }));
        assert_eq!(state_of(&again, &hook_command(exe())), HookState::Installed);
    }

    #[test]
    fn hooks_that_are_all_there_count_as_installed_whichever_group_they_sit_in() {
        let command = hook_command(exe());
        let mut tidy = installed(&json!({}), &command);
        tidy["hooks"]["Stop"] = json!([
            { "matcher": "*", "hooks": [{ "type": "command", "command": "mine.sh" }, hook(&command, true)] }
        ]);
        assert_eq!(state_of(&tidy, &command), HookState::Installed);
    }

    #[test]
    fn a_renamed_exe_is_still_recognised_as_ours() {
        // The flag is the marker, not the file name: someone who renames the exe can still remove the hooks.
        let renamed = installed(&json!({}), &hook_command(Path::new(r"D:\tools\wb.exe")));
        assert_eq!(without_ours(&renamed), json!({}));
    }

    #[test]
    fn a_hooks_section_of_an_unknown_shape_is_refused_not_overwritten() {
        for odd in [
            json!({ "hooks": "nope" }),
            json!({ "hooks": { "Stop": "nope" } }),
            json!({ "hooks": [] }),
        ] {
            assert!(with_ours(&odd, "x").is_err(), "{odd}");
            assert_eq!(without_ours(&odd), odd);
        }
    }

    #[test]
    fn only_a_json_object_is_something_to_write_into() {
        assert_eq!(parse(b"").unwrap(), json!({}));
        assert_eq!(parse(b"  \r\n ").unwrap(), json!({}));
        let mut with_bom = vec![0xEF, 0xBB, 0xBF];
        with_bom.extend_from_slice(br#"{"model":"opus"}"#);
        assert_eq!(parse(&with_bom).unwrap()["model"], "opus");
        for bad in [&b"{ not json"[..], b"[1,2,3]", b"\"text\"", b"null"] {
            let err = parse(bad).unwrap_err();
            // The message must not quote the file back: it is shown in a window and may hold anything.
            assert!(!err.contains("not json") && !err.contains("1,2,3"), "{err}");
        }
    }

    #[test]
    fn the_diff_shows_what_changes_and_only_that() {
        let text = diff(
            "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n",
            "a\nb\nc\nd\ne\nf\ng\nNEW\nh\ni\nj\n",
        )
        .expect("short");
        assert_eq!(text, "  …\n  e\n  f\n  g\n+ NEW\n  h\n  i\n  j\n");
        assert_eq!(diff("same\n", "same\n").as_deref(), Some("  …\n"));
        assert_eq!(diff("", "x\n").as_deref(), Some("+ x\n"));
        assert_eq!(diff("x\ny\n", "y\n").as_deref(), Some("- x\n  y\n"));
        // Two changes far apart, each with its own context and a gap between them.
        assert_eq!(
            diff(
                "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\n",
                "A\nb\nc\nd\ne\nf\ng\nh\ni\nj\nK\n"
            )
            .as_deref(),
            Some("- a\n+ A\n  b\n  c\n  d\n  …\n  h\n  i\n  j\n- k\n+ K\n")
        );
    }

    #[test]
    fn a_long_file_with_a_small_change_costs_a_small_table() {
        // Twenty thousand shared lines around one new one: tabulating all of it would take 1.6 GB.
        let shared: String = (0..20_000).map(|i| format!("line {i}\n")).collect();
        let before = format!("{shared}tail\n");
        let after = format!("{shared}NEW\ntail\n");
        let text = diff(&before, &after).expect("only the changed stretch is tabulated");
        assert_eq!(
            text,
            "  …\n  line 19997\n  line 19998\n  line 19999\n+ NEW\n  tail\n"
        );
    }

    #[test]
    fn a_change_too_long_to_show_is_not_shown_at_all() {
        let a: String = (0..3_000).map(|i| format!("a{i}\n")).collect();
        let b: String = (0..3_000).map(|i| format!("b{i}\n")).collect();
        assert_eq!(diff(&a, &b), None);
    }

    #[test]
    fn only_a_real_stamp_becomes_part_of_a_file_name() {
        assert!(is_stamp(STAMP));
        assert!(is_stamp(&stamp()), "{}", stamp());
        for bad in [
            "",
            "s",
            "20261001_120000",
            "2026100-1120000",
            "20261001-12000",
            "..\\..\\evil-000000",
            "20261001-120000.bak",
            "20261001-1200００",
        ] {
            assert!(!is_stamp(bad), "{bad:?}");
        }
        let dir = temp_dir("stamp");
        fs::write(settings_path(&dir), REAL).expect("writes");
        let plan = preview(&dir, exe(), true, STAMP).expect("previews");
        assert_eq!(plan.stamp, STAMP);
        assert!(apply(&dir, exe(), true, &plan.fingerprint, "..\\x").is_err());
        assert_eq!(fs::read_to_string(settings_path(&dir)).unwrap(), REAL);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_earlier_backup_is_never_written_over() {
        let dir = temp_dir("backups");
        let path = settings_path(&dir);
        fs::write(&path, REAL).expect("writes");
        // Install and remove within the same second: both writes carry the same stamp.
        let plan = preview(&dir, exe(), true, STAMP).expect("previews");
        let first = apply(&dir, exe(), true, &plan.fingerprint, STAMP).expect("installs");
        let installed_bytes = fs::read(&path).unwrap();
        let undo = preview(&dir, exe(), false, STAMP).expect("previews");
        let second = apply(&dir, exe(), false, &undo.fingerprint, STAMP).expect("removes");

        assert_ne!(first, second);
        assert!(
            second.ends_with(&format!("settings.json.winbar-{STAMP}-2.bak")),
            "{second}"
        );
        assert_eq!(
            fs::read_to_string(&first).unwrap(),
            REAL,
            "the first backup is untouched"
        );
        assert_eq!(fs::read(&second).unwrap(), installed_bytes);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_far_too_large_is_refused_unread() {
        let dir = temp_dir("huge");
        let path = settings_path(&dir);
        let file = fs::File::create(&path).expect("creates");
        file.set_len(MAX_FILE + 1).expect("sizes");
        drop(file);
        assert!(preview(&dir, exe(), true, STAMP)
            .unwrap_err()
            .contains("4 MB"));
        assert!(apply(&dir, exe(), true, "anything", STAMP).is_err());
        assert_eq!(fs::metadata(&path).unwrap().len(), MAX_FILE + 1);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_read_only_settings_file_fails_cleanly() {
        let dir = temp_dir("readonly");
        let path = settings_path(&dir);
        fs::write(&path, REAL).expect("writes");
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions.clone()).expect("locks");

        let plan = preview(&dir, exe(), true, STAMP).expect("previews");
        let outcome = apply(&dir, exe(), true, &plan.fingerprint, STAMP);

        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).expect("unlocks");
        // Whether Windows lets a read-only file be replaced is its business; either way nothing is half done.
        match outcome {
            Ok(_) => assert_eq!(status(&dir, exe()).state, HookState::Installed),
            Err(_) => {
                assert_eq!(fs::read_to_string(&path).unwrap(), REAL);
                assert_eq!(
                    fs::read_dir(&dir).unwrap().count(),
                    1,
                    "a failed write leaves no backup and no temporary file"
                );
            }
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_whole_trip_on_disk() {
        let dir = temp_dir("trip");
        let path = settings_path(&dir);
        // The way PowerShell 5 writes a file: a byte order mark and Windows line endings.
        let mut original = vec![0xEF, 0xBB, 0xBF];
        original.extend_from_slice(REAL.replace('\n', "\r\n").as_bytes());
        fs::write(&path, &original).expect("writes");

        assert_eq!(status(&dir, exe()).state, HookState::Absent);
        let plan = preview(&dir, exe(), true, "20261001-120000").expect("previews");
        assert!(plan.diff.contains("--winbar-claude-hook"), "{}", plan.diff);
        assert!(!marked(&plan.diff, '+').is_empty());
        assert_eq!(
            marked(&plan.diff, '-'),
            Vec::<String>::new(),
            "installing removes nothing:\n{}",
            plan.diff
        );
        assert!(!plan.reformats, "a BOM and CRLF are not a layout change");
        assert!(!plan.unchanged);
        assert_eq!(
            fs::read(&path).unwrap(),
            original,
            "a preview writes nothing"
        );

        let backup =
            apply(&dir, exe(), true, &plan.fingerprint, "20261001-120000").expect("installs");
        assert!(
            backup.ends_with("settings.json.winbar-20261001-120000.bak"),
            "{backup}"
        );
        assert_eq!(
            fs::read(&backup).unwrap(),
            original,
            "the backup is the old file, byte for byte"
        );
        assert_eq!(status(&dir, exe()).state, HookState::Installed);
        let written: Value = serde_json::from_slice(&fs::read(&path).unwrap()).expect("valid JSON");
        assert_eq!(written["model"], "opus");
        assert_eq!(written["hooks"]["PreToolUse"].as_array().unwrap().len(), 2);

        // Installing again: nothing to do, and no second backup.
        let again = preview(&dir, exe(), true, "20261001-120005").expect("previews");
        assert!(again.unchanged);
        assert_eq!(
            apply(&dir, exe(), true, &again.fingerprint, "20261001-120005").unwrap(),
            ""
        );
        assert!(!dir
            .join("settings.json.winbar-20261001-120005.bak")
            .exists());

        // Removing puts the content back.
        let undo = preview(&dir, exe(), false, "20261001-120010").expect("previews");
        assert!(!marked(&undo.diff, '-').is_empty());
        assert_eq!(
            marked(&undo.diff, '+'),
            Vec::<String>::new(),
            "removing adds nothing:\n{}",
            undo.diff
        );
        apply(&dir, exe(), false, &undo.fingerprint, "20261001-120010").expect("removes");
        assert_eq!(fs::read_to_string(&path).unwrap(), REAL);
        assert_eq!(status(&dir, exe()).state, HookState::Absent);
        assert!(
            fs::read_dir(&dir)
                .unwrap()
                .flatten()
                .all(|e| !e.file_name().to_string_lossy().contains("tmp")),
            "no temporary file is left behind"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_that_changed_since_the_preview_is_left_alone() {
        let dir = temp_dir("stale");
        let path = settings_path(&dir);
        fs::write(&path, REAL).expect("writes");
        let plan = preview(&dir, exe(), true, STAMP).expect("previews");
        fs::write(&path, r#"{"model":"someone else edited this"}"#).expect("writes");
        let err = apply(&dir, exe(), true, &plan.fingerprint, STAMP).unwrap_err();
        assert!(err.contains("đã đổi"), "{err}");
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            r#"{"model":"someone else edited this"}"#
        );
        assert!(
            !dir.join(format!("settings.json.winbar-{STAMP}.bak"))
                .exists(),
            "nothing is written, not even a backup"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_broken_file_is_refused_before_anything_is_written() {
        let dir = temp_dir("broken");
        let path = settings_path(&dir);
        fs::write(&path, "{ broken").expect("writes");
        assert!(preview(&dir, exe(), true, STAMP).is_err());
        assert!(apply(&dir, exe(), true, &fingerprint(b"{ broken"), STAMP).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ broken");
        assert_eq!(
            fs::read_dir(&dir).unwrap().count(),
            1,
            "no backup, no temporary file"
        );
        assert_eq!(status(&dir, exe()).state, HookState::Absent);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_file_yet_means_no_backup_and_a_new_file() {
        let dir = temp_dir("fresh").join("not-created-yet");
        let plan = preview(&dir, exe(), true, STAMP).expect("previews");
        assert_eq!(plan.backup_path, "");
        assert!(!plan.reformats);
        assert_eq!(
            apply(&dir, exe(), true, &plan.fingerprint, STAMP).expect("installs"),
            ""
        );
        assert_eq!(status(&dir, exe()).state, HookState::Installed);
        // Removing when nothing else is in the file leaves an empty object, not a deleted file.
        let undo = preview(&dir, exe(), false, STAMP).expect("previews");
        apply(&dir, exe(), false, &undo.fingerprint, STAMP).expect("removes");
        assert_eq!(fs::read_to_string(settings_path(&dir)).unwrap(), "{}\n");
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[cfg(windows)]
    #[test]
    fn a_linked_settings_file_stays_a_link() {
        let dir = temp_dir("link");
        let home = dir.join("claude");
        let dotfiles = dir.join("dotfiles");
        fs::create_dir_all(&home).expect("creates");
        fs::create_dir_all(&dotfiles).expect("creates");
        let real = dotfiles.join("claude-settings.json");
        fs::write(&real, REAL).expect("writes");
        let link = settings_path(&home);
        if std::os::windows::fs::symlink_file(&real, &link).is_err() {
            // Creating a link needs Developer Mode or elevation; without it there is nothing to test here.
            let _ = fs::remove_dir_all(&dir);
            return;
        }

        let plan = preview(&home, exe(), true, STAMP).expect("previews");
        apply(&home, exe(), true, &plan.fingerprint, STAMP).expect("installs");

        assert!(
            fs::symlink_metadata(&link)
                .expect("still there")
                .file_type()
                .is_symlink(),
            "the link was replaced by a plain file"
        );
        let written: Value = serde_json::from_slice(&fs::read(&real).unwrap()).expect("valid JSON");
        assert_eq!(
            state_of(&written, &hook_command(exe())),
            HookState::Installed
        );
        assert_eq!(status(&home, exe()).state, HookState::Installed);
        assert!(
            fs::read_dir(&dotfiles).unwrap().count() == 1,
            "nothing but the settings file is left beside the real file"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_laid_out_differently_is_flagged() {
        let dir = temp_dir("layout");
        fs::write(
            settings_path(&dir),
            "{\"model\":\"opus\",\n    \"hooks\": {}}",
        )
        .expect("writes");
        assert!(
            preview(&dir, exe(), true, STAMP)
                .expect("previews")
                .reformats
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
