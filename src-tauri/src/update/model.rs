//! The pure part of the update notice (SPEC-update §5.1): reading a version, comparing two, and deciding whether a
//! check is due. No network, no disk, so every branch is tested.

use serde_json::Value;

/// `major.minor.patch`. Tuples compare field by field, which is exactly version order: `(0, 10, 0) > (0, 9, 0)`.
pub type Version = (u64, u64, u64);

/// A check at most this often (chủ dự án, 25/09).
pub const CHECK_EVERY_MS: u64 = 7 * 24 * 60 * 60 * 1000;

/// No part of a version needs more digits than this, and capping it keeps `parse` from ever overflowing.
const MAX_PART_DIGITS: usize = 9;

/// `1.2.3` or `v1.2.3`: three whole numbers and nothing else. Anything else reads as "no version", which the
/// caller treats as "nothing new" — a malformed file on GitHub must never produce a notice.
pub fn parse_version(raw: &str) -> Option<Version> {
    let digits = raw.strip_prefix('v').unwrap_or(raw);
    let mut parts = digits.split('.');
    let mut next = || -> Option<u64> {
        let part = parts.next()?;
        if part.is_empty()
            || part.len() > MAX_PART_DIGITS
            || !part.bytes().all(|b| b.is_ascii_digit())
        {
            return None;
        }
        part.parse().ok()
    };
    let version = (next()?, next()?, next()?);
    parts.next().is_none().then_some(version)
}

pub fn format(version: Version) -> String {
    format!("{}.{}.{}", version.0, version.1, version.2)
}

/// The `version` field of a `tauri.conf.json` body. Nothing else in the file is looked at.
pub fn version_from_config(body: &[u8]) -> Option<Version> {
    let text = std::str::from_utf8(body).ok()?;
    let config: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    parse_version(config.get("version")?.as_str()?)
}

/// Whether a week has passed since the last successful check.
///
/// Never checked (0) is due. So is a mark in the future: the clock was set back, and waiting for it to catch up
/// could mean waiting for years.
pub fn is_due(last_checked_ms: u64, now_ms: u64) -> bool {
    last_checked_ms == 0 || last_checked_ms > now_ms || now_ms - last_checked_ms >= CHECK_EVERY_MS
}

/// The version to put on the pill, if any: newer than what is running and newer than the last one the user
/// already saw.
pub fn to_announce(
    current: Version,
    latest: Option<Version>,
    dismissed: Option<Version>,
) -> Option<Version> {
    let latest = latest?;
    (latest > current && dismissed.is_none_or(|d| latest > d)).then_some(latest)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_790_000_000_000;

    #[test]
    fn reads_three_whole_numbers_with_or_without_a_v() {
        assert_eq!(parse_version("0.2.0"), Some((0, 2, 0)));
        assert_eq!(parse_version("v1.10.3"), Some((1, 10, 3)));
        assert_eq!(parse_version("12.0.007"), Some((12, 0, 7)));
    }

    #[test]
    fn anything_else_is_no_version() {
        for raw in [
            "",
            "1",
            "1.2",
            "1.2.3.4",
            "1.2.",
            ".1.2",
            "1..2",
            "v",
            "vv1.2.3",
            "V1.2.3",
            " 1.2.3",
            "1.2.3 ",
            "1.2.3-beta",
            "1.2.3+build",
            "-1.2.3",
            "1.-2.3",
            "a.b.c",
            "1.2.3\n",
            "１.2.3",
            "1.2.9999999999",
        ] {
            assert_eq!(parse_version(raw), None, "{raw:?}");
        }
    }

    #[test]
    fn newer_means_newer_number_by_number_not_as_text() {
        assert!((0, 10, 0) > (0, 9, 0));
        assert!((1, 0, 0) > (0, 99, 99));
        assert_eq!(
            to_announce((0, 9, 0), Some((0, 10, 0)), None),
            Some((0, 10, 0))
        );
    }

    #[test]
    fn the_same_or_an_older_version_is_not_announced() {
        assert_eq!(to_announce((0, 2, 0), Some((0, 2, 0)), None), None);
        assert_eq!(to_announce((0, 2, 0), Some((0, 1, 9)), None), None);
        assert_eq!(to_announce((0, 2, 0), None, None), None);
    }

    #[test]
    fn a_dismissed_version_stays_quiet_until_a_newer_one_comes() {
        assert_eq!(
            to_announce((0, 1, 0), Some((0, 2, 0)), Some((0, 2, 0))),
            None
        );
        assert_eq!(
            to_announce((0, 1, 0), Some((0, 2, 0)), Some((0, 3, 0))),
            None
        );
        assert_eq!(
            to_announce((0, 1, 0), Some((0, 3, 0)), Some((0, 2, 0))),
            Some((0, 3, 0))
        );
    }

    #[test]
    fn reads_only_the_version_field_of_the_config() {
        let body = br#"{"productName":"winbar","version":"0.2.0","identifier":"com.winbar.app"}"#;
        assert_eq!(version_from_config(body), Some((0, 2, 0)));
        let with_bom = "\u{feff}{\"version\":\"0.3.1\"}";
        assert_eq!(version_from_config(with_bom.as_bytes()), Some((0, 3, 1)));
    }

    #[test]
    fn a_config_that_is_not_what_we_expect_has_no_version() {
        for body in [
            &b""[..],
            b"not json",
            b"{}",
            b"{\"version\":2}",
            b"{\"version\":\"latest\"}",
            b"[\"0.2.0\"]",
            b"\xff\xfe",
        ] {
            assert_eq!(version_from_config(body), None);
        }
    }

    #[test]
    fn a_check_is_due_once_a_week() {
        assert!(is_due(0, NOW), "never checked");
        assert!(
            !is_due(NOW - CHECK_EVERY_MS + 1, NOW),
            "a moment short of a week"
        );
        assert!(!is_due(NOW - 60 * 60 * 1000, NOW));
        assert!(is_due(NOW - CHECK_EVERY_MS, NOW), "exactly a week");
        assert!(is_due(NOW - 30 * CHECK_EVERY_MS, NOW));
    }

    #[test]
    fn a_mark_in_the_future_is_due_rather_than_waiting_for_the_clock() {
        assert!(is_due(NOW + 1000, NOW));
    }

    #[test]
    fn format_round_trips() {
        assert_eq!(format((0, 10, 3)), "0.10.3");
        assert_eq!(parse_version(&format((1, 2, 3))), Some((1, 2, 3)));
    }
}
