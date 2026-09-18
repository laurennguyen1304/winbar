//! Pure parts of the media module (SPEC-media §5, §6.2): the state sent to the frontend, which session to show,
//! timeline maths and app names. No WinRT here, so all of it is unit tested.

use serde::Serialize;

use crate::command_bar::apps::AppEntry;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSession {
    /// AppUserModelId of the app (made unique when two sessions share one).
    pub id: String,
    pub app_name: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Controls {
    pub play_pause: bool,
    pub next: bool,
    pub previous: bool,
    pub seek: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub session_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Changes whenever the track changes; the frontend fetches artwork per key.
    pub track_key: String,
    pub status: &'static str,
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    /// When Windows reported `position_ms`, in Unix epoch ms.
    pub position_at: i64,
    pub rate: f64,
    pub can: Controls,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub sessions: Vec<MediaSession>,
    pub current: Option<Track>,
}

/// What the widget asks the media thread to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    PlayPause,
    Next,
    Previous,
    /// Position in ms from the start of the track.
    Seek(u64),
    /// Show this session; `None` follows Windows again.
    Select(Option<String>),
}

impl Action {
    /// The button actions of `media_control`.
    pub fn parse(name: &str) -> Option<Action> {
        match name {
            "playPause" => Some(Action::PlayPause),
            "next" => Some(Action::Next),
            "previous" => Some(Action::Previous),
            _ => None,
        }
    }
}

/// Timeline position (100 ns ticks) for a seek to `ms` into a track that starts at `start_hns`.
pub fn seek_ticks(start_hns: i64, ms: u64, duration: Option<u64>) -> i64 {
    let ms = duration.map_or(ms, |d| ms.min(d));
    start_hns + (ms as i64) * HNS_PER_MS
}

/// A timeline report that lands this close to where the page already estimates playback is not worth an event.
pub const DRIFT_TOLERANCE_MS: i64 = 1500;

/// True when `next` only re-reports the position of `prev`'s track and that position matches the estimate the page
/// makes from `prev` (SPEC-media §5.1). Skipping these keeps events to real changes: track, status, seek, controls.
pub fn is_timeline_drift(prev: &MediaState, next: &MediaState) -> bool {
    let (Some(a), Some(b)) = (&prev.current, &next.current) else {
        return false;
    };
    if prev.sessions != next.sessions {
        return false;
    }
    let same_apart_from_timeline = Track {
        position_ms: a.position_ms,
        position_at: a.position_at,
        ..b.clone()
    } == *a;
    if !same_apart_from_timeline {
        return false;
    }
    let (Some(from), Some(to)) = (a.position_ms, b.position_ms) else {
        return a.position_ms == b.position_ms;
    };
    let elapsed = if a.status == "playing" {
        ((b.position_at - a.position_at) as f64 * a.rate) as i64
    } else {
        0
    };
    let estimated = from as i64 + elapsed;
    (to as i64 - estimated).abs() < DRIFT_TOLERANCE_MS
}

/// Session to show: the user's pick while it still exists, else the one Windows chose, else the first.
pub fn pick_session<'a>(
    ids: &'a [String],
    system: Option<&str>,
    manual: Option<&str>,
) -> Option<&'a String> {
    let find = |want: Option<&str>| want.and_then(|w| ids.iter().find(|id| id.as_str() == w));
    find(manual)
        .or_else(|| find(system))
        .or_else(|| ids.first())
}

/// Stable key for "the same track in the same app". It also changes when artwork shows up, since apps often report
/// the title before the thumbnail.
pub fn track_key(
    session_id: &str,
    title: &str,
    artist: &str,
    album: &str,
    has_art: bool,
) -> String {
    let art = if has_art { "art" } else { "" };
    [session_id, title, artist, album, art].join("\u{1f}")
}

/// `GlobalSystemMediaTransportControlsSessionPlaybackStatus` as the frontend's status.
pub fn status_name(status: i32) -> &'static str {
    match status {
        4 => "playing",
        5 => "paused",
        3 => "stopped",
        _ => "other",
    }
}

const HNS_PER_MS: i64 = 10_000;
const SEVEN_DAYS_MS: i64 = 7 * 24 * 60 * 60 * 1000;
/// 1601-01-01 to 1970-01-01 in 100 ns ticks.
const FILETIME_UNIX_EPOCH: i64 = 116_444_736_000_000_000;

/// Track length from the timeline (100 ns ticks), or `None` when there is no usable length: missing, zero or
/// 7 days and more (livestreams report huge end times).
pub fn duration_ms(start_hns: i64, end_hns: i64) -> Option<u64> {
    let ms = (end_hns - start_hns) / HNS_PER_MS;
    (ms > 0 && ms < SEVEN_DAYS_MS).then_some(ms as u64)
}

/// Position inside the track in ms, clamped to its length; `None` without a usable length.
pub fn position_ms(start_hns: i64, position_hns: i64, duration: Option<u64>) -> Option<u64> {
    let duration = duration?;
    let ms = ((position_hns - start_hns) / HNS_PER_MS).max(0) as u64;
    Some(ms.min(duration))
}

/// Windows `DateTime` (FILETIME ticks) to Unix epoch ms.
pub fn filetime_to_epoch_ms(ticks: i64) -> i64 {
    (ticks - FILETIME_UNIX_EPOCH) / HNS_PER_MS
}

/// Makes session ids unique: a second session of the same app becomes `id#2`.
pub fn unique_ids(aumids: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashMap::<&str, usize>::new();
    aumids
        .iter()
        .map(|id| {
            let n = seen.entry(id.as_str()).or_insert(0);
            *n += 1;
            if *n == 1 {
                id.clone()
            } else {
                format!("{id}#{n}")
            }
        })
        .collect()
}

/// Display name for a session's app (SPEC-media §5.3): the Start menu name when the id or the executable matches an
/// app from AppsFolder, else the executable name without `.exe`, else the part after `!` of a packaged AUMID.
///
/// Several Start entries can point at one executable (Windows PowerShell and Developer PowerShell; Chrome and its
/// web apps), so an executable match skips web apps, prefers names containing the executable's name, then the shortest.
pub fn app_name(aumid: &str, apps: &[AppEntry]) -> String {
    let exe = aumid
        .rsplit(['\\', '/'])
        .next()
        .filter(|f| f.to_ascii_lowercase().ends_with(".exe"));
    if let Some(app) = apps.iter().find(|a| a.id.eq_ignore_ascii_case(aumid)) {
        return app.name.clone();
    }
    let Some(exe) = exe else {
        return match aumid.rsplit_once('!') {
            Some((_, app)) if !app.is_empty() => app.to_string(),
            _ => aumid.to_string(),
        };
    };
    let stem = &exe[..exe.len() - 4];
    let stem_lower = stem.to_lowercase();
    let best = apps
        .iter()
        .filter(|a| !a.id.contains("_crx_"))
        .filter(|a| {
            a.path
                .as_deref()
                .and_then(|p| p.rsplit(['\\', '/']).next())
                .is_some_and(|f| f.eq_ignore_ascii_case(exe))
        })
        .min_by_key(|a| {
            (
                !a.name.to_lowercase().contains(&stem_lower),
                a.name.chars().count(),
            )
        });
    if let Some(app) = best {
        return app.name.clone();
    }
    let mut chars = stem.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => aumid.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn entry(id: &str, name: &str, path: Option<&str>) -> AppEntry {
        AppEntry {
            id: id.into(),
            name: name.into(),
            path: path.map(Into::into),
        }
    }

    #[test]
    fn picks_manual_then_system_then_first() {
        let all = ids(&["Spotify", "chrome.exe"]);
        assert_eq!(
            pick_session(&all, Some("Spotify"), Some("chrome.exe")).map(String::as_str),
            Some("chrome.exe")
        );
        assert_eq!(
            pick_session(&all, Some("Spotify"), None).map(String::as_str),
            Some("Spotify")
        );
        // The picked app closed: back to what Windows chose.
        assert_eq!(
            pick_session(&all, Some("chrome.exe"), Some("gone.exe")).map(String::as_str),
            Some("chrome.exe")
        );
        // Windows chose nothing (or a session we do not list): the first one.
        assert_eq!(
            pick_session(&all, None, None).map(String::as_str),
            Some("Spotify")
        );
        assert_eq!(pick_session(&[], Some("Spotify"), None), None);
    }

    fn playing_at(position_ms: u64, position_at: i64) -> MediaState {
        MediaState {
            sessions: vec![MediaSession {
                id: "Spotify".into(),
                app_name: "Spotify".into(),
            }],
            current: Some(Track {
                session_id: "Spotify".into(),
                title: "t".into(),
                artist: "a".into(),
                album: "b".into(),
                track_key: "k".into(),
                status: "playing",
                position_ms: Some(position_ms),
                duration_ms: Some(243_000),
                position_at,
                rate: 1.0,
                can: Controls {
                    play_pause: true,
                    ..Default::default()
                },
            }),
        }
    }

    #[test]
    fn skips_position_reports_that_match_the_estimate() {
        let prev = playing_at(60_000, 1_000_000);
        // Six seconds later the app reports six seconds further on.
        assert!(is_timeline_drift(&prev, &playing_at(66_000, 1_006_000)));
        assert!(is_timeline_drift(&prev, &playing_at(67_200, 1_006_000)));
        // A seek, or a position that disagrees with the estimate, goes out.
        assert!(!is_timeline_drift(&prev, &playing_at(120_000, 1_006_000)));
        assert!(!is_timeline_drift(&prev, &playing_at(60_000, 1_006_000)));
    }

    #[test]
    fn never_skips_real_changes() {
        let prev = playing_at(60_000, 1_000_000);
        let mut paused = playing_at(66_000, 1_006_000);
        paused.current.as_mut().unwrap().status = "paused";
        assert!(!is_timeline_drift(&prev, &paused));
        let mut other_track = playing_at(66_000, 1_006_000);
        other_track.current.as_mut().unwrap().track_key = "k2".into();
        assert!(!is_timeline_drift(&prev, &other_track));
        let mut more_sessions = playing_at(66_000, 1_006_000);
        more_sessions.sessions.push(MediaSession {
            id: "chrome.exe".into(),
            app_name: "Chrome".into(),
        });
        assert!(!is_timeline_drift(&prev, &more_sessions));
        assert!(!is_timeline_drift(&MediaState::default(), &prev));
        assert!(!is_timeline_drift(&prev, &MediaState::default()));
        // Paused and still reporting the same spot: nothing to send.
        let mut still = playing_at(60_000, 1_000_000);
        still.current.as_mut().unwrap().status = "paused";
        let mut still_later = playing_at(60_000, 1_009_000);
        still_later.current.as_mut().unwrap().status = "paused";
        assert!(is_timeline_drift(&still, &still_later));
    }

    #[test]
    fn parses_button_actions_only() {
        assert_eq!(Action::parse("playPause"), Some(Action::PlayPause));
        assert_eq!(Action::parse("next"), Some(Action::Next));
        assert_eq!(Action::parse("previous"), Some(Action::Previous));
        assert_eq!(Action::parse("seek"), None);
        assert_eq!(Action::parse("PlayPause"), None);
    }

    #[test]
    fn seek_is_relative_to_the_start_and_capped_at_the_end() {
        assert_eq!(seek_ticks(0, 60_000, Some(243_000)), 600_000_000);
        assert_eq!(seek_ticks(50_000_000, 1_000, Some(243_000)), 60_000_000);
        assert_eq!(seek_ticks(0, 999_000, Some(243_000)), 2_430_000_000);
        assert_eq!(seek_ticks(0, 5_000, None), 50_000_000);
    }

    #[test]
    fn track_key_changes_with_any_field() {
        let a = track_key("Spotify", "Midnight City", "M83", "Hurry Up", true);
        assert_eq!(
            a,
            track_key("Spotify", "Midnight City", "M83", "Hurry Up", true)
        );
        assert_ne!(a, track_key("Spotify", "Midnight City", "M83", "", true));
        assert_ne!(
            a,
            track_key("chrome.exe", "Midnight City", "M83", "Hurry Up", true)
        );
        // Artwork arriving after the title refreshes it.
        assert_ne!(
            a,
            track_key("Spotify", "Midnight City", "M83", "Hurry Up", false)
        );
        // Fields cannot run into each other.
        assert_ne!(
            track_key("a", "bc", "", "", false),
            track_key("a", "b", "c", "", false)
        );
    }

    #[test]
    fn maps_playback_status() {
        assert_eq!(status_name(4), "playing");
        assert_eq!(status_name(5), "paused");
        assert_eq!(status_name(3), "stopped");
        assert_eq!(status_name(2), "other");
    }

    #[test]
    fn duration_is_hidden_when_unusable() {
        let s = 10_000_000; // 1 s
        assert_eq!(duration_ms(0, 2_430_000_000), Some(243_000));
        assert_eq!(duration_ms(s, s + 1_200_000_000), Some(120_000));
        assert_eq!(duration_ms(0, 0), None);
        assert_eq!(duration_ms(0, -5), None);
        assert_eq!(duration_ms(0, 7 * 24 * 3600 * s), None);
        assert_eq!(
            duration_ms(0, 7 * 24 * 3600 * s - s),
            Some(7 * 24 * 3600 * 1000 - 1000)
        );
    }

    #[test]
    fn position_is_relative_to_start_and_clamped() {
        assert_eq!(position_ms(0, 1_020_000_000, Some(243_000)), Some(102_000));
        assert_eq!(
            position_ms(50_000_000, 60_000_000, Some(10_000)),
            Some(1_000)
        );
        assert_eq!(position_ms(0, 3_000_000_000, Some(243_000)), Some(243_000));
        assert_eq!(position_ms(0, -10, Some(243_000)), Some(0));
        assert_eq!(position_ms(0, 1_020_000_000, None), None);
    }

    #[test]
    fn converts_windows_time_to_epoch() {
        assert_eq!(filetime_to_epoch_ms(FILETIME_UNIX_EPOCH), 0);
        // 2026-09-17T00:00:00Z
        assert_eq!(
            filetime_to_epoch_ms(FILETIME_UNIX_EPOCH + 1_789_603_200_000 * HNS_PER_MS),
            1_789_603_200_000
        );
    }

    #[test]
    fn makes_duplicate_session_ids_unique() {
        assert_eq!(
            unique_ids(&ids(&["msedge.exe", "Spotify", "msedge.exe"])),
            ids(&["msedge.exe", "Spotify", "msedge.exe#2"])
        );
    }

    #[test]
    fn names_apps_from_the_start_menu_or_the_id() {
        let apps = vec![
            entry(
                "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify",
                "Spotify",
                None,
            ),
            entry(
                "Chrome",
                "Google Chrome",
                Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            ),
            entry(
                "MSEdge",
                "Microsoft Edge",
                Some(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            ),
        ];
        assert_eq!(
            app_name("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", &apps),
            "Spotify"
        );
        assert_eq!(app_name("chrome", &apps), "Google Chrome");
        assert_eq!(app_name("msedge.exe", &apps), "Microsoft Edge");
        assert_eq!(app_name(r"C:\Tools\vlc.exe", &apps), "Vlc");
        assert_eq!(app_name("powershell.exe", &[]), "Powershell");
        let shared = vec![
            entry(
                r"{1AC14E77}\WindowsPowerShell\v1.0\powershell.exe",
                "Windows PowerShell",
                Some(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"),
            ),
            entry(
                "VS.DevShell",
                "Developer PowerShell for VS 2022",
                Some(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"),
            ),
            entry(
                "Chrome._crx_agimnkijcaahngcdmfeangaknmldooml",
                "YouTube",
                Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            ),
            entry(
                "Chrome",
                "Google Chrome",
                Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            ),
        ];
        assert_eq!(app_name("powershell.exe", &shared), "Windows PowerShell");
        assert_eq!(app_name("chrome.exe", &shared), "Google Chrome");
        assert_eq!(app_name("Contoso.Player_abc!App", &[]), "App");
        assert_eq!(app_name("SomeApp", &[]), "SomeApp");
    }

    #[test]
    fn serialises_like_the_frontend_contract() {
        let state = MediaState {
            sessions: vec![MediaSession {
                id: "Spotify".into(),
                app_name: "Spotify".into(),
            }],
            current: Some(Track {
                session_id: "Spotify".into(),
                title: "t".into(),
                artist: "a".into(),
                album: "b".into(),
                track_key: "k".into(),
                status: "playing",
                position_ms: Some(1),
                duration_ms: None,
                position_at: 5,
                rate: 1.0,
                can: Controls {
                    play_pause: true,
                    ..Default::default()
                },
            }),
        };
        let v = serde_json::to_value(&state).unwrap();
        assert_eq!(v["sessions"][0]["appName"], "Spotify");
        assert_eq!(v["current"]["trackKey"], "k");
        assert_eq!(v["current"]["positionAt"], 5);
        assert_eq!(v["current"]["durationMs"], serde_json::Value::Null);
        assert_eq!(v["current"]["can"]["playPause"], true);
        assert_eq!(
            serde_json::to_value(MediaState::default()).unwrap()["current"],
            serde_json::Value::Null
        );
    }
}
