//! How much of the Claude limit is left (SPEC-claude §3.3, §5.5).
//!
//! The OAuth token is read from Claude Code's own credentials file for each request and put straight into an
//! Authorization header. It is never logged, never written anywhere, and never part of a value that reaches the
//! page — [`Usage`] carries percentages and reset times only.
//!
//! The endpoint is not a public API: it can change shape or refuse. So the parser takes what it recognises and
//! leaves the rest, and a failed call keeps the last good numbers rather than blanking the card.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::http::{self, HttpError};

const HOST: &str = "api.anthropic.com";
const PATH: &str = "/api/oauth/usage";
/// The beta header the Claude Code CLI sends for this endpoint.
const OAUTH_BETA: &str = "oauth-2025-04-20";

/// How long a fetched record is reused. The endpoint is not public, so we ask rarely (capability map).
pub const CACHE_TTL_MS: u64 = 120 * 1000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UsageError {
    /// The token was refused: Claude Code needs signing in again.
    Auth,
    /// Could not reach the endpoint. The numbers shown are the last known ones.
    Network,
    /// There is no credentials file, so there is nothing to ask with.
    NoLogin,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    /// 0–100, rounded.
    pub percent: u32,
    /// ISO 8601, straight from the payload.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelLimit {
    pub label: String,
    pub percent: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<Window>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seven_day: Option<Window>,
    /// Weekly limits scoped to one model, e.g. "Fable 9%".
    pub per_model: Vec<ModelLimit>,
    /// Epoch ms of the last successful fetch; 0 when there has never been one.
    pub fetched_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<UsageError>,
    /// Every account an account-switcher CLI manages (§3.3b). Filled in by the caller, never cached to disk.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accounts: Option<Vec<super::accounts::AccountUsage>>,
}

pub(super) fn round_percent(value: f64) -> u32 {
    value.clamp(0.0, 100.0).round() as u32
}

/// The highest-percentage entry in `limits` belonging to one of `groups`.
fn pick_limit<'a>(payload: &'a Value, groups: &[&str]) -> Option<&'a Value> {
    payload
        .get("limits")?
        .as_array()?
        .iter()
        .filter(|item| {
            let matches = |key: &str| {
                item.get(key)
                    .and_then(Value::as_str)
                    .is_some_and(|v| groups.contains(&v))
            };
            (matches("group") || matches("kind"))
                && item.get("percent").and_then(Value::as_f64).is_some()
        })
        .max_by(|a, b| {
            let get = |v: &Value| v.get("percent").and_then(Value::as_f64).unwrap_or(0.0);
            get(a).total_cmp(&get(b))
        })
}

/// One usage window, from either the named object or the `limits` array.
///
/// Both shapes turn up: an account can have a top-level object with a real number, or an empty one while the
/// number lives in `limits`. Neither missing form should sink the read, so both are tried.
fn window(payload: &Value, key: &str, groups: &[&str]) -> Option<Window> {
    let object = payload.get(key);
    let utilisation = object
        .and_then(|o| o.get("utilization"))
        .and_then(Value::as_f64);
    let resets = object
        .and_then(|o| o.get("resets_at"))
        .and_then(Value::as_str)
        .map(str::to_string);
    if let (Some(value), Some(at)) = (utilisation, resets.clone()) {
        return Some(Window {
            percent: round_percent(value),
            resets_at: Some(at),
        });
    }
    if let Some(limit) = pick_limit(payload, groups) {
        return Some(Window {
            percent: round_percent(limit.get("percent").and_then(Value::as_f64)?),
            resets_at: limit
                .get("resets_at")
                .and_then(Value::as_str)
                .map(str::to_string),
        });
    }
    utilisation.map(|value| Window {
        percent: round_percent(value),
        resets_at: resets,
    })
}

/// Weekly limits that name a model, so the card can show "Fable 9%".
fn per_model(payload: &Value) -> Vec<ModelLimit> {
    let Some(items) = payload.get("limits").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut out: Vec<ModelLimit> = items
        .iter()
        .filter_map(|item| {
            let label = item
                .get("scope")?
                .get("model")?
                .get("display_name")?
                .as_str()?
                .trim();
            let percent = item.get("percent").and_then(Value::as_f64)?;
            (!label.is_empty()).then(|| ModelLimit {
                label: label.to_string(),
                percent: round_percent(percent),
            })
        })
        .collect();
    out.sort_by(|a, b| b.percent.cmp(&a.percent).then(a.label.cmp(&b.label)));
    out.dedup_by(|a, b| a.label == b.label);
    out
}

/// Reads a usage payload into the shape the card needs. Unknown fields are ignored, missing ones are `None`.
pub fn parse(payload: &Value, fetched_at: u64) -> Usage {
    Usage {
        five_hour: window(payload, "five_hour", &["session"]),
        seven_day: window(
            payload,
            "seven_day",
            &["weekly", "weekly_all", "weekly_scoped"],
        ),
        per_model: per_model(payload),
        fetched_at,
        error: None,
        accounts: None,
    }
}

pub fn cache_path(config_dir: &Path) -> PathBuf {
    config_dir.join("winbar").join("claude-usage.json")
}

/// The credentials file inside an **already-resolved** `.claude` directory.
///
/// It takes the resolved directory rather than the home directory on purpose: resolving twice once produced
/// `~/.claude/.claude/.credentials.json`, and the card quietly said "not logged in" while showing stale numbers.
fn credentials_path(claude_dir: &Path) -> PathBuf {
    claude_dir.join(".credentials.json")
}

/// Reads the OAuth token. The value is never logged, and the caller wipes it as soon as the header is built.
///
/// A token that could not go in a header — a stray newline, a control character — is treated as no token at all,
/// rather than handed down to be refused with a misleading "network" error.
fn read_token(claude_dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(credentials_path(claude_dir)).ok()?;
    let value: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let token = value.get("claudeAiOauth")?.get("accessToken")?.as_str()?;
    if token.is_empty() || !http::is_safe_header(token) {
        return None;
    }
    Some(token.to_string())
}

/// Overwrites a string's bytes before it is freed.
///
/// Partial protection, and worth saying so plainly: the OS may already have copied the page, and the same token
/// sits unencrypted in `.credentials.json` anyway. It costs nothing and shortens the window, which is all it does.
fn wipe(mut text: String) {
    // SAFETY: every byte becomes a space, which is valid UTF-8, and the string is dropped immediately after.
    unsafe { text.as_bytes_mut() }
        .iter_mut()
        .for_each(|b| *b = b' ');
    drop(text);
}

/// What is kept on disk: the numbers, and which account they belong to.
#[derive(Serialize, Deserialize)]
struct Cached {
    /// `accountUuid` of the account the numbers are for. A file written before this field existed has none, and
    /// is treated as belonging to nobody.
    #[serde(default)]
    account: Option<String>,
    #[serde(flatten)]
    usage: Usage,
}

/// The active account's `accountUuid`, from Claude Code's own config file. Not a secret.
///
/// Without it the one cache record could not tell whose numbers it held: just after a switch, the card showed the
/// previous account's numbers until the cache ran out.
pub fn active_account(config_file: &Path) -> Option<String> {
    let text = std::fs::read_to_string(config_file).ok()?;
    let value: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let id = value
        .get("oauthAccount")?
        .get("accountUuid")?
        .as_str()?
        .trim();
    (!id.is_empty()).then(|| id.to_string())
}

/// The cached numbers, only when they belong to `account`.
fn load_cache(path: &Path, account: Option<&str>) -> Option<Usage> {
    let text = std::fs::read_to_string(path).ok()?;
    let cached: Cached = serde_json::from_str(&text).ok()?;
    (cached.account.as_deref() == account).then_some(cached.usage)
}

fn save_cache(path: &Path, account: Option<&str>, usage: &Usage) {
    let record = Cached {
        account: account.map(str::to_string),
        // The account list carries labels; it stays in memory only.
        usage: Usage {
            accounts: None,
            ..usage.clone()
        },
    };
    let Ok(json) = serde_json::to_string(&record) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, json).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Last known numbers tagged with why the latest attempt failed. Never saved: a blip should not become the
/// stored "last good" record.
fn with_error(cache: Option<Usage>, error: UsageError) -> Usage {
    let mut usage = cache.unwrap_or_default();
    usage.error = Some(error);
    usage
}

/// Fetches usage, or reuses a recent answer. `force` skips the cache for a manual refresh.
///
/// `config_file` is Claude Code's `.claude.json`, read only for the active account's id.
pub fn fetch(
    claude_dir: &Path,
    config_file: &Path,
    config_dir: &Path,
    now_ms: u64,
    force: bool,
) -> Usage {
    let path = cache_path(config_dir);
    let account = active_account(config_file);
    let cache = load_cache(&path, account.as_deref());
    if !force {
        if let Some(cached) = &cache {
            if cached.error.is_none() && now_ms.saturating_sub(cached.fetched_at) < CACHE_TTL_MS {
                return cached.clone();
            }
        }
    }

    let Some(token) = read_token(claude_dir) else {
        // No credentials file: nothing to ask with, and no reason to touch the network.
        return with_error(cache, UsageError::NoLogin);
    };
    let headers = vec![
        format!("Authorization: Bearer {token}"),
        format!("anthropic-beta: {OAUTH_BETA}"),
    ];
    wipe(token);

    let answer = http::get(HOST, PATH, &headers);
    // The Authorization line is a second copy of the token; it goes the same way.
    headers.into_iter().for_each(wipe);

    match answer {
        Ok(body) => match serde_json::from_slice::<Value>(&body) {
            Ok(payload) => {
                let usage = parse(&payload, now_ms);
                save_cache(&path, account.as_deref(), &usage);
                usage
            }
            Err(_) => {
                eprintln!("winbar claude: usage endpoint returned something that is not JSON");
                with_error(cache, UsageError::Network)
            }
        },
        Err(HttpError::Unauthorized) => with_error(cache, UsageError::Auth),
        Err(HttpError::Network) => with_error(cache, UsageError::Network),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: u64 = 1_789_725_126_000;

    /// The payload this account really returns, trimmed to what the parser looks at.
    fn real_payload() -> Value {
        json!({
            "five_hour": { "utilization": 52.0, "resets_at": "2026-09-18T10:00:00.335117+00:00" },
            "seven_day": { "utilization": 24.0, "resets_at": "2026-09-19T00:00:00.335141+00:00" },
            "nimbus_quill": { "utilization": 0.0, "resets_at": null },
            "limits": [
                { "kind": "session", "group": "session", "percent": 52, "resets_at": "2026-09-18T10:00:00Z", "is_active": true },
                { "kind": "weekly_all", "group": "weekly", "percent": 24, "resets_at": "2026-09-19T00:00:00Z" },
                { "kind": "weekly_scoped", "group": "weekly", "percent": 9, "resets_at": "2026-09-18T23:59:59Z",
                  "scope": { "model": { "id": null, "display_name": "Fable" } } }
            ]
        })
    }

    #[test]
    fn reads_the_payload_this_account_returns() {
        let usage = parse(&real_payload(), NOW);
        assert_eq!(usage.five_hour.as_ref().map(|w| w.percent), Some(52));
        assert_eq!(usage.seven_day.as_ref().map(|w| w.percent), Some(24));
        assert_eq!(
            usage.five_hour.and_then(|w| w.resets_at).as_deref(),
            Some("2026-09-18T10:00:00.335117+00:00")
        );
        assert_eq!(
            usage.per_model,
            vec![ModelLimit {
                label: "Fable".into(),
                percent: 9
            }]
        );
        assert_eq!(usage.error, None);
    }

    #[test]
    fn falls_back_to_the_limits_array_when_the_named_objects_are_empty() {
        let payload = json!({
            "five_hour": { "utilization": null, "resets_at": null },
            "seven_day": null,
            "limits": [
                { "group": "session", "percent": 71, "resets_at": "later" },
                { "group": "weekly", "percent": 33, "resets_at": "much later" }
            ]
        });
        let usage = parse(&payload, NOW);
        assert_eq!(
            usage.five_hour,
            Some(Window {
                percent: 71,
                resets_at: Some("later".into())
            })
        );
        assert_eq!(usage.seven_day.map(|w| w.percent), Some(33));
    }

    #[test]
    fn takes_the_worst_limit_of_a_group() {
        let payload = json!({ "limits": [
            { "group": "weekly", "percent": 12 },
            { "group": "weekly", "percent": 44 },
            { "group": "weekly", "percent": 30 }
        ]});
        assert_eq!(parse(&payload, NOW).seven_day.map(|w| w.percent), Some(44));
    }

    #[test]
    fn a_window_with_a_number_but_no_reset_time_still_counts() {
        let payload = json!({ "five_hour": { "utilization": 5.0 } });
        assert_eq!(
            parse(&payload, NOW).five_hour,
            Some(Window {
                percent: 5,
                resets_at: None
            })
        );
    }

    #[test]
    fn an_unrecognisable_payload_gives_no_numbers_rather_than_wrong_ones() {
        for payload in [
            json!({}),
            json!({ "limits": [] }),
            json!({ "limits": "nonsense" }),
            json!(42),
        ] {
            let usage = parse(&payload, NOW);
            assert_eq!(usage.five_hour, None, "{payload}");
            assert_eq!(usage.seven_day, None, "{payload}");
            assert!(usage.per_model.is_empty());
        }
    }

    #[test]
    fn per_model_rows_are_sorted_and_unique() {
        let payload = json!({ "limits": [
            { "group": "weekly", "percent": 9, "scope": { "model": { "display_name": "Fable" } } },
            { "group": "weekly", "percent": 40, "scope": { "model": { "display_name": "Opus" } } },
            { "group": "weekly", "percent": 3, "scope": { "model": { "display_name": "Fable" } } },
            { "group": "weekly", "percent": 7, "scope": { "model": { "display_name": "   " } } },
            { "group": "weekly", "percent": 5 }
        ]});
        let rows = parse(&payload, NOW).per_model;
        assert_eq!(
            rows,
            vec![
                ModelLimit {
                    label: "Opus".into(),
                    percent: 40
                },
                ModelLimit {
                    label: "Fable".into(),
                    percent: 9
                },
            ]
        );
    }

    #[test]
    fn percentages_are_rounded_and_kept_in_range() {
        let payload = json!({
            "five_hour": { "utilization": 52.6, "resets_at": "x" },
            "seven_day": { "utilization": -3.0, "resets_at": "y" }
        });
        let usage = parse(&payload, NOW);
        assert_eq!(usage.five_hour.map(|w| w.percent), Some(53));
        assert_eq!(usage.seven_day.map(|w| w.percent), Some(0));
    }

    #[test]
    fn a_failed_call_keeps_the_last_numbers_and_says_why() {
        let good = parse(&real_payload(), NOW);
        let after = with_error(Some(good.clone()), UsageError::Network);
        assert_eq!(
            after.five_hour, good.five_hour,
            "the numbers stay on screen"
        );
        assert_eq!(after.error, Some(UsageError::Network));
        assert_eq!(after.fetched_at, NOW, "…and still say when they were true");

        let never = with_error(None, UsageError::NoLogin);
        assert_eq!(never.five_hour, None);
        assert_eq!(never.error, Some(UsageError::NoLogin));
    }

    #[test]
    fn a_usage_record_never_carries_anything_secret() {
        let json = serde_json::to_string(&parse(&real_payload(), NOW)).expect("serialises");
        for forbidden in ["token", "Bearer", "accessToken", "authorization"] {
            assert!(
                !json.to_lowercase().contains(&forbidden.to_lowercase()),
                "usage must not carry {forbidden}"
            );
        }
    }

    #[test]
    fn the_cache_round_trips_and_a_broken_one_is_ignored() {
        let dir = std::env::temp_dir().join("winbar-claude-usage-cache");
        let _ = std::fs::remove_dir_all(&dir);
        let path = cache_path(&dir);
        let usage = parse(&real_payload(), NOW);
        save_cache(&path, Some("acc-a"), &usage);
        assert_eq!(load_cache(&path, Some("acc-a")), Some(usage));

        std::fs::write(&path, "{ not json").expect("writes");
        assert_eq!(load_cache(&path, Some("acc-a")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn after_an_account_switch_the_other_accounts_numbers_are_not_reused() {
        // The regression this pins: one cache record with no owner, so for two minutes after a switch the card
        // showed the previous account's numbers as if they were the new one's.
        let dir = std::env::temp_dir().join("winbar-claude-usage-cache-switch");
        let _ = std::fs::remove_dir_all(&dir);
        let path = cache_path(&dir);
        save_cache(&path, Some("acc-a"), &parse(&real_payload(), NOW));
        assert_eq!(load_cache(&path, Some("acc-b")), None);
        assert_eq!(load_cache(&path, None), None);

        // A file from before the owner was recorded belongs to nobody.
        std::fs::write(&path, r#"{"perModel":[],"fetchedAt":1}"#).expect("writes");
        assert_eq!(load_cache(&path, Some("acc-a")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_account_list_is_never_written_to_disk() {
        let dir = std::env::temp_dir().join("winbar-claude-usage-cache-accounts");
        let _ = std::fs::remove_dir_all(&dir);
        let path = cache_path(&dir);
        let mut usage = parse(&real_payload(), NOW);
        usage.accounts = Some(vec![super::super::accounts::AccountUsage {
            id: "u".into(),
            label: "Label-on-screen".into(),
            active: false,
            five_hour: None,
            seven_day: None,
            fetched_at: 0,
            needs_login: false,
        }]);
        save_cache(&path, Some("acc-a"), &usage);
        let text = std::fs::read_to_string(&path).expect("reads");
        assert!(!text.contains("Label-on-screen") && !text.contains("accounts"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_active_account_comes_from_claude_codes_config() {
        let dir = std::env::temp_dir().join("winbar-claude-active-account");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("creates");
        let file = dir.join(".claude.json");
        assert_eq!(active_account(&file), None, "no file");
        std::fs::write(
            &file,
            "\u{feff}{\"oauthAccount\":{\"accountUuid\":\" acc-a \",\"emailAddress\":\"x@y.z\"}}",
        )
        .expect("writes");
        assert_eq!(active_account(&file).as_deref(), Some("acc-a"));
        std::fs::write(&file, r#"{"oauthAccount":{"accountUuid":""}}"#).expect("writes");
        assert_eq!(active_account(&file), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_token_that_could_not_go_in_a_header_is_treated_as_no_token() {
        let home = std::env::temp_dir().join("winbar-claude-bad-token");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(home.join(".claude")).expect("creates");
        std::fs::write(
            home.join(".claude").join(".credentials.json"),
            "{\"claudeAiOauth\":{\"accessToken\":\"abc\r\nX-Evil: 1\"}}",
        )
        .expect("writes");
        assert_eq!(read_token(&home.join(".claude")), None);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn the_token_sits_directly_in_the_directory_it_is_handed() {
        // The regression this pins: the caller passes the resolved `.claude` directory, and resolving it a second
        // time here looked for `~/.claude/.claude/.credentials.json`. The card then said "not logged in" while
        // still showing the last good numbers, which is the kind of wrong that is easy to miss.
        assert_eq!(
            credentials_path(Path::new(r"D:\claude")),
            PathBuf::from(r"D:\claude\.credentials.json")
        );

        let dir = std::env::temp_dir().join("winbar-claude-token-here");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("creates");
        std::fs::write(
            dir.join(".credentials.json"),
            r#"{"claudeAiOauth":{"accessToken":"sk-test-abc"}}"#,
        )
        .expect("writes");
        assert_eq!(read_token(&dir).as_deref(), Some("sk-test-abc"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn with_no_credentials_file_it_never_reaches_the_network() {
        let home = std::env::temp_dir().join("winbar-claude-no-login");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).expect("creates");
        let config = home.join("config");
        let usage = fetch(&home, &home.join(".claude.json"), &config, NOW, true);
        assert_eq!(usage.error, Some(UsageError::NoLogin));
        let _ = std::fs::remove_dir_all(&home);
    }
}
