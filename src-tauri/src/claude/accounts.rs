//! Usage for every account an account-switcher CLI manages (SPEC-claude §3.3b).
//!
//! `.credentials.json` only ever holds the active account's token, so on its own winbar sees one account. A
//! switcher CLI that prints `accounts@1` JSON already polls all of them, so winbar asks it instead — and never
//! reads the CLI's own token store, never refreshes a token. The output carries no token; it does carry emails,
//! so only the fields below are kept, nothing is logged, and nothing here is written to disk.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::usage::{round_percent, Window};

/// Where the CLI installs itself, under the user's home.
const DEFAULT_CLI: [&str; 3] = [".local", "bin", "token-slayer.cmd"];
/// `status` asks the endpoint for every account (~3 s measured); `list` answers from the CLI's own cache.
const LIVE: [&str; 2] = ["status", "--json"];
const CACHED: [&str; 2] = ["list", "--json"];
pub const LIVE_TIMEOUT: Duration = Duration::from_secs(20);
pub const CACHED_TIMEOUT: Duration = Duration::from_secs(10);
/// Two accounts come to about 1 KB; anything past this is not an account list.
const MAX_OUTPUT: usize = 256 * 1024;
/// Keeps a hand-set alias from pushing the card around.
const MAX_LABEL: usize = 32;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUsage {
    /// The account's `uuid`, or the CLI's slot name when there is none yet.
    pub id: String,
    /// The alias, or a masked email. Never a full email.
    pub label: String,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<Window>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seven_day: Option<Window>,
    /// Epoch ms of the CLI's last poll for this account; 0 when unknown.
    pub fetched_at: u64,
    pub needs_login: bool,
}

/// The CLI to run: the configured path, or the default one. `None` when there is nothing safe to run.
///
/// Only an absolute path to an `.exe` or `.cmd` that exists is accepted, so nothing is looked up through `PATH` or
/// the working directory. A network path is refused before it is touched: checking that one exists is already
/// enough for Windows to open an SMB connection and offer the user's credentials.
pub fn cli_path(home: &Path, configured: &str) -> Option<PathBuf> {
    let configured = configured.trim();
    let path = if configured.is_empty() {
        DEFAULT_CLI
            .iter()
            .fold(home.to_path_buf(), |p, part| p.join(part))
    } else {
        PathBuf::from(configured)
    };
    if !path.is_absolute() || crate::command_bar::launch::is_network_path(&path.to_string_lossy()) {
        return None;
    }
    let runnable = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("cmd"));
    (runnable && path.is_file()).then_some(path)
}

/// Asks the CLI, live first and its cache second. `None` when neither answer is usable.
pub fn fetch(cli: &Path) -> Option<Vec<AccountUsage>> {
    run(cli, &LIVE, LIVE_TIMEOUT)
        .and_then(|out| parse(&out))
        .or_else(|| run(cli, &CACHED, CACHED_TIMEOUT).and_then(|out| parse(&out)))
}

/// Runs the CLI with fixed arguments and returns stdout, or `None` on failure, timeout or oversized output.
///
/// stderr is discarded rather than read: it is free text and may name an account.
#[cfg(windows)]
fn run(cli: &Path, args: &[&str], timeout: Duration) -> Option<Vec<u8>> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    /// No console window flashes up on each poll.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    // A `.cmd` goes through cmd.exe; the standard library quotes arguments for it, and these are constants anyway.
    let mut child = Command::new(cli)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    // Read on a thread so a CLI that stops mid-write cannot hold this one past the timeout.
    let reader = std::thread::spawn(move || {
        let mut out = Vec::new();
        (&mut stdout)
            .take(MAX_OUTPUT as u64 + 1)
            .read_to_end(&mut out)
            .ok()
            .map(|_| out)
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                eprintln!("winbar claude: account switcher did not answer in time");
                return None;
            }
        }
    };
    let out = reader.join().ok()??;
    (status.success() && out.len() <= MAX_OUTPUT).then_some(out)
}

#[cfg(not(windows))]
fn run(_cli: &Path, _args: &[&str], _timeout: Duration) -> Option<Vec<u8>> {
    None
}

/// `accounts@1`, or `accounts@1.<minor>`: a minor bump only adds fields.
fn schema_ok(payload: &Value) -> bool {
    payload
        .get("schema")
        .and_then(Value::as_str)
        .and_then(|s| s.rsplit_once('@'))
        .is_some_and(|(name, version)| name == "accounts" && version.split('.').next() == Some("1"))
}

/// Reads the CLI's JSON. Unknown fields are ignored; a wrong schema or no usable account gives `None`, so the
/// caller falls back to the single-account path instead of showing an empty list.
pub fn parse(bytes: &[u8]) -> Option<Vec<AccountUsage>> {
    let payload: Value = serde_json::from_slice(bytes).ok()?;
    if !schema_ok(&payload) {
        return None;
    }
    let list: Vec<AccountUsage> = payload
        .get("accounts")?
        .as_array()?
        .iter()
        .enumerate()
        .filter_map(|(i, item)| account(item, i))
        .collect();
    (!list.is_empty()).then_some(list)
}

fn account(item: &Value, position: usize) -> Option<AccountUsage> {
    let text = |key: &str| {
        item.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
    };
    let id = text("uuid").or_else(|| text("name"))?.to_string();
    let usage = item.get("usage");
    let window = |key: &str| {
        let w = usage?.get(key)?;
        Some(Window {
            percent: round_percent(w.get("utilization")?.as_f64()?),
            resets_at: w
                .get("resets_at")
                .and_then(Value::as_f64)
                .and_then(iso_from_epoch),
        })
    };
    let token_expired = usage
        .and_then(|u| u.get("token_expired"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Some(AccountUsage {
        label: text("alias")
            // An alias that is itself an address gets the same masking as the email would.
            .map(|a| {
                if a.contains('@') {
                    mask_email(a)
                } else {
                    clean_label(a)
                }
            })
            .filter(|s| !s.is_empty())
            .or_else(|| text("email").map(mask_email))
            .unwrap_or_else(|| format!("Tài khoản {}", position + 1)),
        active: item.get("active").and_then(Value::as_bool).unwrap_or(false),
        five_hour: window("five_hour"),
        seven_day: window("seven_day"),
        fetched_at: usage
            .and_then(|u| u.get("polled_at"))
            .and_then(Value::as_f64)
            .filter(|s| *s > 0.0)
            .map_or(0, |s| (s * 1000.0) as u64),
        needs_login: text("state") == Some("expired") || token_expired,
        id,
    })
}

/// A label for the card: no control characters, and short.
fn clean_label(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(MAX_LABEL)
        .collect::<String>()
        .trim()
        .to_string()
}

/// `ab…@domain`: enough to tell two accounts apart, not enough to read the address off a shared screen.
fn mask_email(email: &str) -> String {
    let (local, domain) = email.split_once('@').unwrap_or((email, ""));
    let head: String = local.chars().take(2).collect();
    let domain = clean_label(domain);
    if domain.is_empty() {
        format!("{head}…")
    } else {
        format!("{head}…@{domain}")
    }
}

/// Epoch seconds as ISO 8601 UTC, the form the card already reads for reset times.
fn iso_from_epoch(seconds: f64) -> Option<String> {
    if !seconds.is_finite() || seconds < 0.0 || seconds > 253_402_300_799.0 {
        return None;
    }
    let total = seconds as i64;
    let (days, rest) = (total.div_euclid(86_400), total.rem_euclid(86_400));
    // Howard Hinnant's civil-from-days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    Some(format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The shape the CLI prints, with made-up people.
    fn sample() -> Value {
        json!({
            "schema": "accounts@1",
            "active": "work",
            "generated_at": 1_789_000_000,
            "accounts": [
                { "index": 0, "name": "home", "alias": null, "email": "jane.doe@example.com",
                  "uuid": "11111111-aaaa", "org_uuid": "o1", "plan": "max", "active": false, "state": "ready",
                  "usage": { "five_hour": { "utilization": 2.0, "resets_at": 1_789_725_600 },
                             "seven_day": { "utilization": 21.4, "resets_at": 1_790_000_000 },
                             "polled_at": 1_789_720_000, "token_expired": false } },
                { "index": 1, "name": "work", "alias": "Work", "email": "sam@example.org",
                  "uuid": "22222222-bbbb", "active": true, "state": "active",
                  "usage": { "five_hour": { "utilization": 20.0, "resets_at": null },
                             "seven_day": { "utilization": 33.0 }, "polled_at": 1_789_720_001 } }
            ]
        })
    }

    fn parse_value(v: &Value) -> Option<Vec<AccountUsage>> {
        parse(&serde_json::to_vec(v).expect("serialises"))
    }

    #[test]
    fn reads_every_account_in_the_order_given() {
        let list = parse_value(&sample()).expect("parses");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "11111111-aaaa");
        assert!(!list[0].active);
        assert_eq!(list[0].five_hour.as_ref().map(|w| w.percent), Some(2));
        assert_eq!(list[0].seven_day.as_ref().map(|w| w.percent), Some(21));
        assert_eq!(list[0].fetched_at, 1_789_720_000_000);
        assert_eq!(
            list[0]
                .five_hour
                .as_ref()
                .and_then(|w| w.resets_at.as_deref()),
            Some("2026-09-18T10:00:00Z")
        );
        assert!(list[1].active);
        assert_eq!(list[1].label, "Work");
        assert_eq!(
            list[1].five_hour.as_ref().and_then(|w| w.resets_at.clone()),
            None
        );
    }

    #[test]
    fn the_label_never_carries_a_full_email() {
        let list = parse_value(&sample()).expect("parses");
        assert_eq!(list[0].label, "ja…@example.com");
        let json = serde_json::to_string(&list).expect("serialises");
        for leaked in ["jane.doe", "sam@", "o1", "\"max\""] {
            assert!(!json.contains(leaked), "{leaked} must not reach the page");
        }
    }

    #[test]
    fn a_wrong_or_missing_schema_is_not_read() {
        for schema in [
            json!("accounts@2"),
            json!("sessions@1"),
            json!(null),
            json!("accounts"),
        ] {
            let mut v = sample();
            v["schema"] = schema.clone();
            assert_eq!(parse_value(&v), None, "{schema}");
        }
        let mut minor = sample();
        minor["schema"] = json!("accounts@1.3");
        assert!(
            parse_value(&minor).is_some(),
            "a minor bump only adds fields"
        );
    }

    #[test]
    fn nothing_usable_gives_none_so_the_single_account_path_takes_over() {
        for v in [
            json!({ "schema": "accounts@1", "accounts": [] }),
            json!({ "schema": "accounts@1", "accounts": [{ "alias": "no id" }] }),
            json!({ "schema": "accounts@1" }),
        ] {
            assert_eq!(parse_value(&v), None, "{v}");
        }
        assert_eq!(parse(b"not json"), None);
        assert_eq!(parse(b""), None);
    }

    #[test]
    fn an_expired_account_asks_for_a_login_and_keeps_its_numbers() {
        let mut v = sample();
        v["accounts"][0]["state"] = json!("expired");
        v["accounts"][1]["usage"]["token_expired"] = json!(true);
        let list = parse_value(&v).expect("parses");
        assert!(list[0].needs_login && list[1].needs_login);
        assert_eq!(list[0].seven_day.as_ref().map(|w| w.percent), Some(21));
    }

    #[test]
    fn missing_usage_gives_no_numbers_rather_than_zeros() {
        let v = json!({ "schema": "accounts@1", "accounts": [
            { "name": "fresh", "email": "x@y.z", "active": false, "state": "ready" }
        ]});
        let list = parse_value(&v).expect("parses");
        assert_eq!(list[0].id, "fresh");
        assert_eq!(list[0].five_hour, None);
        assert_eq!(list[0].fetched_at, 0);
    }

    #[test]
    fn labels_are_cleaned_and_fall_back_in_order() {
        assert_eq!(clean_label("  Wo\u{7}rk\r\n "), "Work");
        assert_eq!(clean_label(&"a".repeat(80)).len(), MAX_LABEL);
        assert_eq!(mask_email("x@example.com"), "x…@example.com");
        assert_eq!(mask_email("nodomain"), "no…");
        let v = json!({ "schema": "accounts@1", "accounts": [{ "uuid": "u", "alias": "   " }] });
        assert_eq!(parse_value(&v).expect("parses")[0].label, "Tài khoản 1");
        let v = json!({ "schema": "accounts@1", "accounts": [
            { "uuid": "u", "alias": "jane.doe@example.com", "email": "other@example.com" }
        ]});
        assert_eq!(
            parse_value(&v).expect("parses")[0].label,
            "ja…@example.com",
            "an alias that is an address is masked too"
        );
    }

    #[test]
    fn epoch_seconds_become_iso_utc() {
        assert_eq!(iso_from_epoch(0.0).as_deref(), Some("1970-01-01T00:00:00Z"));
        assert_eq!(
            iso_from_epoch(951_782_400.0).as_deref(),
            Some("2000-02-29T00:00:00Z")
        );
        assert_eq!(
            iso_from_epoch(1_789_725_600.5).as_deref(),
            Some("2026-09-18T10:00:00Z")
        );
        assert_eq!(iso_from_epoch(-1.0), None);
        assert_eq!(iso_from_epoch(f64::NAN), None);
    }

    #[test]
    fn only_an_absolute_existing_exe_or_cmd_is_run() {
        let home = std::env::temp_dir().join("winbar-claude-switcher");
        let _ = std::fs::remove_dir_all(&home);
        let bin = home.join(".local").join("bin");
        std::fs::create_dir_all(&bin).expect("creates");

        assert_eq!(cli_path(&home, ""), None, "nothing installed");
        std::fs::write(bin.join("token-slayer.cmd"), "@echo off").expect("writes");
        assert_eq!(cli_path(&home, ""), Some(bin.join("token-slayer.cmd")));

        let other = bin.join("other.exe");
        std::fs::write(&other, "").expect("writes");
        assert_eq!(
            cli_path(&home, &other.to_string_lossy()),
            Some(other.clone())
        );
        for refused in ["other.exe", r"\\server\share\x.exe", "//server/share/x.cmd"] {
            assert_eq!(cli_path(&home, refused), None, "{refused}");
        }
        let script = bin.join("x.ps1");
        std::fs::write(&script, "").expect("writes");
        assert_eq!(
            cli_path(&home, &script.to_string_lossy()),
            None,
            "not an exe or cmd"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(windows)]
    #[test]
    fn a_cli_that_hangs_is_cut_off_and_its_output_ignored() {
        let dir = std::env::temp_dir().join("winbar-claude-switcher-run");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("creates");
        let ok = dir.join("ok.cmd");
        std::fs::write(
            &ok,
            "@echo {\"schema\":\"accounts@1\",\"accounts\":[{\"uuid\":\"u\"}]}\r\n",
        )
        .expect("writes");
        assert_eq!(fetch(&ok).map(|l| l.len()), Some(1));

        let slow = dir.join("slow.cmd");
        std::fs::write(&slow, "@ping -n 30 127.0.0.1 >nul\r\n").expect("writes");
        let started = Instant::now();
        assert_eq!(run(&slow, &LIVE, Duration::from_millis(500)), None);
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "must not wait for the CLI"
        );

        let failing = dir.join("fail.cmd");
        std::fs::write(
            &failing,
            "@echo {\"schema\":\"accounts@1\",\"accounts\":[{\"uuid\":\"u\"}]}\r\n@exit /b 3\r\n",
        )
        .expect("writes");
        assert_eq!(
            run(&failing, &LIVE, CACHED_TIMEOUT),
            None,
            "a non-zero exit is not an answer"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
