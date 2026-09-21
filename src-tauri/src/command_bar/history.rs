//! What was run from the command bar (SPEC-command-bar §5.4): feeds "Gần đây" and ranks often-used rows higher.
//! Stored in `%APPDATA%\winbar\command-history.json`. Only things that can be run again are kept (apps, files,
//! winbar actions), and never the text that was typed.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use super::apps::AppsState;

pub const MAX_ITEMS: usize = 200;
const HALF_LIFE_DAYS: f64 = 7.0;
const DAY_MS: f64 = 86_400_000.0;
const MAX_TEXT: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    App,
    File,
    Folder,
    Action,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub kind: Kind,
    /// App id, absolute path, or winbar action id.
    pub target: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub count: u32,
    /// Milliseconds since the Unix epoch.
    pub last_used: u64,
}

/// What the page sends when a row runs.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub kind: Kind,
    pub target: String,
    pub title: String,
    pub subtitle: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct FileFormat {
    version: u32,
    items: Vec<Entry>,
}

/// Frequency weighted by recency: each use counts half as much after 7 days.
pub fn frecency(entry: &Entry, now_ms: u64) -> f64 {
    let age_days = now_ms.saturating_sub(entry.last_used) as f64 / DAY_MS;
    f64::from(entry.count) * 0.5_f64.powf(age_days / HALF_LIFE_DAYS)
}

fn clip(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(MAX_TEXT)
        .collect()
}

/// Adds one use, keeping at most 200 entries (the least useful go first).
pub fn record(items: &mut Vec<Entry>, run: &Run, now_ms: u64) -> Result<(), String> {
    if run.target.trim().is_empty() || run.target.len() > 2048 {
        return Err("invalid history target".into());
    }
    match items
        .iter_mut()
        .find(|e| e.kind == run.kind && e.target == run.target)
    {
        Some(entry) => {
            entry.count = entry.count.saturating_add(1);
            entry.last_used = now_ms;
            entry.title = clip(&run.title);
            entry.subtitle = run.subtitle.as_deref().map(clip);
        }
        None => items.push(Entry {
            kind: run.kind,
            target: run.target.clone(),
            title: clip(&run.title),
            subtitle: run.subtitle.as_deref().map(clip),
            count: 1,
            last_used: now_ms,
        }),
    }
    if items.len() > MAX_ITEMS {
        sort_by_use(items, now_ms);
        items.truncate(MAX_ITEMS);
    }
    Ok(())
}

pub fn sort_by_use(items: &mut [Entry], now_ms: u64) {
    items.sort_by(|a, b| {
        frecency(b, now_ms)
            .total_cmp(&frecency(a, now_ms))
            .then(b.last_used.cmp(&a.last_used))
    });
}

/// Reads the history; a corrupt file is kept as `.bak` and treated as empty.
pub fn load(path: &Path) -> Vec<Entry> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    match serde_json::from_str::<FileFormat>(text.trim_start_matches('\u{feff}')) {
        Ok(file) => file.items,
        Err(e) => {
            eprintln!("winbar history: corrupt {}: {e}", path.display());
            let _ = fs::copy(path, path.with_extension("json.bak"));
            Vec::new()
        }
    }
}

pub fn save(path: &Path, items: &[Entry]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&FileFormat {
        version: 1,
        items: items.to_vec(),
    })
    .map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub struct HistoryState {
    path: PathBuf,
    items: Mutex<Vec<Entry>>,
}

impl HistoryState {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        let path = app
            .path()
            .config_dir()?
            .join("winbar")
            .join("command-history.json");
        let items = load(&path);
        Ok(HistoryState {
            path,
            items: Mutex::new(items),
        })
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Whether a remembered item can still be run: files must exist; apps must still be installed once the app list
/// is known.
fn still_there(entry: &Entry, apps: Option<&AppsState>) -> bool {
    match entry.kind {
        Kind::File | Kind::Folder => Path::new(&entry.target).exists(),
        Kind::App => apps.is_none_or(|a| !a.is_loaded() || a.find(&entry.target).is_some()),
        Kind::Action => true,
    }
}

#[tauri::command]
pub fn history_record<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, HistoryState>,
    run: Run,
) -> Result<(), String> {
    if matches!(run.kind, Kind::App) && app.state::<AppsState>().find(&run.target).is_none() {
        return Err(format!("unknown app id {:?}", run.target));
    }
    let mut items = state.items.lock().map_err(|e| e.to_string())?;
    record(&mut items, &run, now_ms())?;
    save(&state.path, &items)
}

/// Entries that can still run, most useful first, each with its frecency for ranking.
#[tauri::command]
pub fn history_list<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, HistoryState>,
) -> Result<Vec<(Entry, f64)>, String> {
    let now = now_ms();
    let apps = app.try_state::<AppsState>();
    let mut items = state.items.lock().map_err(|e| e.to_string())?.clone();
    items.retain(|e| still_there(e, apps.as_deref()));
    sort_by_use(&mut items, now);
    Ok(items
        .into_iter()
        .map(|e| {
            let score = frecency(&e, now);
            (e, score)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: u64 = 86_400_000;

    fn run(kind: Kind, target: &str) -> Run {
        Run {
            kind,
            target: target.into(),
            title: target.into(),
            subtitle: None,
        }
    }

    #[test]
    fn frecency_halves_every_seven_days() {
        let mut items = Vec::new();
        record(&mut items, &run(Kind::App, "Chrome"), 0).unwrap();
        record(&mut items, &run(Kind::App, "Chrome"), 0).unwrap();
        let e = &items[0];
        assert_eq!(e.count, 2);
        assert!((frecency(e, 0) - 2.0).abs() < 1e-9);
        assert!((frecency(e, 7 * DAY) - 1.0).abs() < 1e-9);
        assert!((frecency(e, 14 * DAY) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn often_used_beats_used_once_recently_until_it_ages() {
        let mut items = Vec::new();
        for _ in 0..4 {
            record(&mut items, &run(Kind::App, "Code"), 0).unwrap();
        }
        record(&mut items, &run(Kind::App, "Slack"), 10 * DAY).unwrap();
        sort_by_use(&mut items, 10 * DAY);
        assert_eq!(
            items[0].target, "Code",
            "4 uses 10 days ago ≈ 1.49 > 1 use today"
        );
        record(&mut items, &run(Kind::App, "Slack"), 20 * DAY).unwrap();
        record(&mut items, &run(Kind::App, "Slack"), 20 * DAY).unwrap();
        sort_by_use(&mut items, 20 * DAY);
        assert_eq!(
            items[0].target, "Slack",
            "3 uses today > 4 uses 20 days ago ≈ 0.55"
        );
    }

    #[test]
    fn same_target_of_another_kind_is_a_different_entry() {
        let mut items = Vec::new();
        record(&mut items, &run(Kind::File, r"C:\a"), 1).unwrap();
        record(&mut items, &run(Kind::Folder, r"C:\a"), 2).unwrap();
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn keeps_at_most_200_entries_dropping_the_least_useful() {
        let mut items = Vec::new();
        for _ in 0..3 {
            record(&mut items, &run(Kind::App, "favourite"), 0).unwrap();
        }
        for i in 0..250 {
            record(&mut items, &run(Kind::File, &format!(r"C:\f{i}")), i).unwrap();
        }
        assert_eq!(items.len(), MAX_ITEMS);
        assert!(items.iter().any(|e| e.target == "favourite"));
        assert!(!items.iter().any(|e| e.target == r"C:\f0"));
    }

    #[test]
    fn rejects_empty_targets_and_drops_control_characters() {
        let mut items = Vec::new();
        assert!(record(&mut items, &run(Kind::App, "  "), 0).is_err());
        let mut r = run(Kind::Action, "quit");
        r.title = "Thoát\u{0007} winbar".into();
        record(&mut items, &r, 0).unwrap();
        assert_eq!(items[0].title, "Thoát winbar");
    }

    #[test]
    fn saves_and_loads_and_survives_a_corrupt_file() {
        let path = std::env::temp_dir().join("winbar-history-test.json");
        let mut items = Vec::new();
        record(&mut items, &run(Kind::Action, "open-notch"), 5).unwrap();
        save(&path, &items).unwrap();
        assert_eq!(load(&path), items);
        let text = fs::read_to_string(&path).unwrap();
        assert!(!text.contains("query"), "typed text is never stored");

        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Vec::new());
        assert!(path.with_extension("json.bak").exists());
        let _ = fs::remove_file(path.with_extension("json.bak"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn missing_files_are_not_offered_again() {
        let missing = Entry {
            kind: Kind::File,
            target: r"C:\definitely\not\here-9f2c.txt".into(),
            title: "x".into(),
            subtitle: None,
            count: 1,
            last_used: 0,
        };
        assert!(!still_there(&missing, None));
        let existing = Entry {
            target: std::env::temp_dir().to_string_lossy().into_owned(),
            kind: Kind::Folder,
            ..missing.clone()
        };
        assert!(still_there(&existing, None));
        assert!(still_there(
            &Entry {
                kind: Kind::Action,
                ..missing
            },
            None
        ));
    }
}
