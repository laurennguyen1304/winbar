//! Usage over time, for the pace forecast on the limits card (SPEC-claude §5.5b).
//!
//! One sample per successful usage read: when it was true and the two percentages. Nothing else — no reset time,
//! no label, no email. Samples are kept per account (`accountUuid`, the same key the usage cache already uses), so
//! a switch never mixes two accounts' lines.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::accounts::AccountUsage;
use super::usage::{Usage, Window};

/// A little more than one 7-day window.
pub const KEEP_MS: u64 = 8 * 24 * 3600 * 1000;
/// Two reads closer than this are one sample: the newer one replaces the older.
const MIN_GAP_MS: u64 = 60 * 1000;
/// Older than a day, one sample per this is plenty for the 7-day chart.
const THIN_AFTER_MS: u64 = 24 * 3600 * 1000;
const THIN_GAP_MS: u64 = 10 * 60 * 1000;
/// The owner nobody: a cache file written before accounts were recorded.
const NO_ACCOUNT: &str = "";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    /// Epoch ms the numbers were fetched.
    pub t: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seven_day: Option<u32>,
}

type History = BTreeMap<String, Vec<Sample>>;

pub fn history_path(config_dir: &Path) -> PathBuf {
    config_dir.join("winbar").join("claude-usage-history.json")
}

fn load(path: &Path) -> History {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(path: &Path, history: &History) {
    let Ok(json) = serde_json::to_string(history) else {
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

/// Adds `sample` to `list` (oldest first) and drops what is no longer worth keeping.
///
/// Samples can arrive out of order — the account-switcher CLI reports when *it* last polled, which can be older
/// than a sample already kept — so the new one goes in at its place, replacing any neighbour within a minute.
fn push(list: &mut Vec<Sample>, sample: Sample) {
    list.retain(|s| s.t.abs_diff(sample.t) >= MIN_GAP_MS);
    let at = list.partition_point(|s| s.t < sample.t);
    list.insert(at, sample);
    let latest = list.last().map_or(0, |s| s.t);
    let mut kept: Vec<Sample> = Vec::with_capacity(list.len());
    for s in list.drain(..) {
        let age = latest.saturating_sub(s.t);
        if age > KEEP_MS {
            continue;
        }
        if age > THIN_AFTER_MS && kept.last().is_some_and(|k| s.t < k.t + THIN_GAP_MS) {
            continue;
        }
        kept.push(s);
    }
    *list = kept;
}

/// A sample, or nothing when there is no time or neither window to record.
fn sample(t: u64, five: Option<&Window>, seven: Option<&Window>) -> Option<Sample> {
    let sample = Sample {
        t,
        five_hour: five.map(|w| w.percent),
        seven_day: seven.map(|w| w.percent),
    };
    (t != 0 && (sample.five_hour.is_some() || sample.seven_day.is_some())).then_some(sample)
}

/// Adds every `(account, sample)` in one read and one write of the file.
fn record_all(config_dir: &Path, samples: Vec<(String, Sample)>) {
    let Some(latest) = samples.iter().map(|(_, s)| s.t).max() else {
        return;
    };
    let path = history_path(config_dir);
    let mut history = load(&path);
    for (account, sample) in samples {
        push(history.entry(account).or_default(), sample);
    }
    // An account not seen for longer than we keep anything is gone from the file too.
    history.retain(|_, list| {
        list.last()
            .is_some_and(|s| latest.saturating_sub(s.t) <= KEEP_MS)
    });
    save(&path, &history);
}

/// Records a successful read of the active account. Does nothing for a record with neither window.
pub fn record(config_dir: &Path, account: Option<&str>, usage: &Usage) {
    if let Some(s) = sample(
        usage.fetched_at,
        usage.five_hour.as_ref(),
        usage.seven_day.as_ref(),
    ) {
        record_all(
            config_dir,
            vec![(account.unwrap_or(NO_ACCOUNT).to_string(), s)],
        );
    }
}

/// Records the other accounts from the account-switcher CLI (§3.3b), each at the time the CLI polled it.
///
/// The active account is left out: its own reads (§3.3) are fresher and more frequent, and the CLI's `uuid` is the
/// same `accountUuid` those are kept under (checked on this machine, 29/10), so one would only blur the other.
pub fn record_accounts(config_dir: &Path, accounts: &[AccountUsage]) {
    let samples = accounts
        .iter()
        .filter(|a| !a.active && !a.needs_login)
        .filter_map(|a| {
            sample(a.fetched_at, a.five_hour.as_ref(), a.seven_day.as_ref())
                .map(|s| (a.id.clone(), s))
        })
        .collect();
    record_all(config_dir, samples);
}

/// The samples of one account, oldest first.
pub fn read(config_dir: &Path, account: Option<&str>) -> Vec<Sample> {
    load(&history_path(config_dir))
        .remove(account.unwrap_or(NO_ACCOUNT))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_789_725_126_000;
    const MIN: u64 = 60 * 1000;

    fn usage(t: u64, five: u32, seven: u32) -> Usage {
        Usage {
            five_hour: Some(Window {
                percent: five,
                resets_at: Some("x".into()),
            }),
            seven_day: Some(Window {
                percent: seven,
                resets_at: None,
            }),
            fetched_at: t,
            ..Usage::default()
        }
    }

    fn dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn samples_are_kept_per_account_in_order() {
        let dir = dir("winbar-usage-history-accounts");
        record(&dir, Some("a"), &usage(NOW, 10, 40));
        record(&dir, Some("b"), &usage(NOW + MIN, 70, 80));
        record(&dir, Some("a"), &usage(NOW + 10 * MIN, 12, 41));
        let a = read(&dir, Some("a"));
        assert_eq!(
            a.iter().map(|s| s.five_hour).collect::<Vec<_>>(),
            [Some(10), Some(12)]
        );
        assert_eq!(read(&dir, Some("b")).len(), 1);
        assert!(read(&dir, None).is_empty(), "no account is its own owner");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn two_reads_a_moment_apart_are_one_sample() {
        let mut list = Vec::new();
        push(
            &mut list,
            Sample {
                t: NOW,
                five_hour: Some(1),
                seven_day: None,
            },
        );
        push(
            &mut list,
            Sample {
                t: NOW + 20_000,
                five_hour: Some(2),
                seven_day: None,
            },
        );
        assert_eq!(
            list,
            [Sample {
                t: NOW + 20_000,
                five_hour: Some(2),
                seven_day: None
            }]
        );
    }

    #[test]
    fn old_samples_are_thinned_and_very_old_ones_dropped() {
        let mut list = Vec::new();
        // Every two minutes for nine days.
        let start = NOW - 9 * 24 * 60 * MIN;
        let mut t = start;
        while t <= NOW {
            push(
                &mut list,
                Sample {
                    t,
                    five_hour: Some(0),
                    seven_day: Some(0),
                },
            );
            t += 2 * MIN;
        }
        assert!(
            list.iter().all(|s| NOW - s.t <= KEEP_MS),
            "nothing past eight days"
        );
        let last_day = list.iter().filter(|s| NOW - s.t <= THIN_AFTER_MS).count();
        assert!(
            last_day >= 700,
            "the last day keeps its resolution: {last_day}"
        );
        let older = list.iter().filter(|s| NOW - s.t > THIN_AFTER_MS).count();
        assert!(
            older <= 7 * 24 * 6 + 1,
            "older days thinned to one per 10 min: {older}"
        );
    }

    #[test]
    fn a_read_without_numbers_records_nothing() {
        let dir = dir("winbar-usage-history-empty");
        record(
            &dir,
            Some("a"),
            &Usage {
                fetched_at: NOW,
                ..Usage::default()
            },
        );
        record(&dir, Some("a"), &usage(0, 5, 5));
        assert!(read(&dir, Some("a")).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_broken_file_starts_over_instead_of_failing() {
        let dir = dir("winbar-usage-history-broken");
        std::fs::create_dir_all(dir.join("winbar")).expect("creates");
        std::fs::write(history_path(&dir), "{ not json").expect("writes");
        assert!(read(&dir, Some("a")).is_empty());
        record(&dir, Some("a"), &usage(NOW, 3, 4));
        assert_eq!(read(&dir, Some("a")).len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_file_holds_numbers_and_times_only() {
        let dir = dir("winbar-usage-history-private");
        record(&dir, Some("acc-uuid"), &usage(NOW, 3, 4));
        let text = std::fs::read_to_string(history_path(&dir)).expect("reads");
        assert_eq!(
            text,
            format!(r#"{{"acc-uuid":[{{"t":{NOW},"fiveHour":3,"sevenDay":4}}]}}"#)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_sample_older_than_the_last_one_goes_in_at_its_place() {
        let mut list = Vec::new();
        push(
            &mut list,
            Sample {
                t: NOW,
                five_hour: Some(1),
                seven_day: None,
            },
        );
        push(
            &mut list,
            Sample {
                t: NOW + 20 * MIN,
                five_hour: Some(3),
                seven_day: None,
            },
        );
        push(
            &mut list,
            Sample {
                t: NOW + 10 * MIN,
                five_hour: Some(2),
                seven_day: None,
            },
        );
        assert_eq!(
            list.iter().map(|s| s.five_hour).collect::<Vec<_>>(),
            [Some(1), Some(2), Some(3)]
        );
    }

    #[test]
    fn the_other_accounts_are_recorded_at_their_poll_time_and_the_active_one_is_not() {
        let dir = dir("winbar-usage-history-others");
        let account = |id: &str, active: bool, t: u64, five: u32| AccountUsage {
            id: id.into(),
            label: "Label-on-screen".into(),
            active,
            five_hour: Some(Window {
                percent: five,
                resets_at: Some("x".into()),
            }),
            seven_day: None,
            fetched_at: t,
            needs_login: false,
        };
        record_accounts(
            &dir,
            &[
                account("me", true, NOW, 50),
                account("other", false, NOW - 30 * MIN, 7),
            ],
        );
        // The CLI answers again from its cache: same poll, same numbers, one sample.
        record_accounts(&dir, &[account("other", false, NOW - 30 * MIN, 7)]);
        assert!(read(&dir, Some("me")).is_empty());
        assert_eq!(
            read(&dir, Some("other")),
            [Sample {
                t: NOW - 30 * MIN,
                five_hour: Some(7),
                seven_day: None
            }]
        );
        let text = std::fs::read_to_string(history_path(&dir)).expect("reads");
        assert!(
            !text.contains("Label-on-screen"),
            "labels stay off the disk"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
