//! Settings (SPEC-notch-shell.md §7): Rust is the source of truth. The file is validated field by field — a bad
//! field falls back to its default without discarding the rest — and every change is broadcast to all windows.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const SETTINGS_CHANGED: &str = "settings-changed";
const VERSION: u64 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PillSettings {
    pub size: String,
    pub always_size: String,
    pub panel_width: String,
    pub top_gap: u32,
    pub open_mode: String,
    pub priority_widget: Option<String>,
    /// `attached` (flush with the top edge, flared) or `float` (rounded pill below the edge). SPEC §15.
    pub layout: String,
    /// `liquid` (translucent glass) or `dense` (the original opaque fill).
    pub material: String,
    /// How much solid black sits behind the material, 0-100. 100 lets nothing through at all.
    pub opacity: u32,
    /// Logical px from the screen centre, set by dragging the notch along the top edge.
    pub offset_x: i32,
    /// Reserve the strip above maximised windows with a Windows AppBar (SPEC §15 V4).
    pub sticky: bool,
    /// `primary`: one notch on the main screen. `all`: a notch on every screen (SPEC §16).
    pub monitor: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WidgetSetting {
    pub id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotkeys {
    pub command_bar: String,
}

/// Top-left corner of the command bar in physical px on the whole desktop (SPEC-command-bar §5.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandBarSettings {
    /// `None` until the user drags the command bar.
    pub position: Option<Position>,
    pub file_search: String,
    pub web_search: String,
}

/// Claude layout (SPEC-claude §7).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSettings {
    /// Off means winbar reads nothing about Claude at all: no watcher, no network.
    pub enabled: bool,
    /// Seconds between status images; 0 holds the first one still.
    pub icon_rotate_seconds: u32,
    /// Warn on the pill when the 5-hour limit passes this; 0 turns the warning off.
    pub usage_warn_percent: u32,
    /// Ask an account-switcher CLI for every account's usage (SPEC-claude §3.3b).
    pub multi_account: bool,
    /// Absolute path to that CLI; empty uses the default one. Hand-edited only.
    pub account_switcher_path: String,
}

/// Update notice (SPEC-update §7). What the check itself remembers lives in `update.json`, not here.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettings {
    /// Ask GitHub for the latest version once a week. Off means no automatic request at all.
    pub check: bool,
}

/// A path is at most this long on Windows without the `\\?\` prefix, which is not accepted here anyway.
const MAX_PATH_SETTING: usize = 260;

/// Clipboard history (SPEC-clipboard §7).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSettings {
    /// How long an unpinned item is kept: 1 or 2 days.
    pub retention_days: u32,
    /// Apps whose copies are never kept, by executable name.
    pub ignored_apps: Vec<String>,
    /// Nothing is recorded while this is on.
    pub paused: bool,
}

/// Password managers whose copies never belong in a history (SPEC-clipboard §5.4 lớp 3).
pub const DEFAULT_IGNORED_APPS: [&str; 8] = [
    "keepass",
    "keepassxc",
    "1password",
    "bitwarden",
    "proton pass",
    "dashlane",
    "lastpass",
    "credentialuibroker",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub version: u64,
    pub pill: PillSettings,
    pub font_scale: u32,
    /// Stored order and enabled flags. The frontend merges this with the registered widgets.
    pub widgets: Vec<WidgetSetting>,
    pub hotkeys: Hotkeys,
    pub launch_at_startup: bool,
    pub command_bar: CommandBarSettings,
    pub clipboard: ClipboardSettings,
    pub claude: ClaudeSettings,
    pub update: UpdateSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: VERSION,
            pill: PillSettings {
                size: "m".into(),
                always_size: "m".into(),
                panel_width: "m".into(),
                top_gap: 8,
                open_mode: "hover".into(),
                priority_widget: Some("claude-sessions".into()),
                layout: "attached".into(),
                material: "liquid".into(),
                opacity: 0,
                offset_x: 0,
                sticky: false,
                monitor: "primary".into(),
            },
            font_scale: 100,
            widgets: Vec::new(),
            hotkeys: Hotkeys {
                command_bar: "Ctrl+Space".into(),
            },
            launch_at_startup: true,
            command_bar: CommandBarSettings {
                position: None,
                file_search: "auto".into(),
                web_search: "google".into(),
            },
            clipboard: ClipboardSettings {
                retention_days: 1,
                ignored_apps: DEFAULT_IGNORED_APPS.iter().map(|a| (*a).into()).collect(),
                paused: false,
            },
            claude: ClaudeSettings {
                enabled: true,
                icon_rotate_seconds: 6,
                usage_warn_percent: 90,
                multi_account: true,
                account_switcher_path: String::new(),
            },
            update: UpdateSettings { check: true },
        }
    }
}

fn is_widget_id(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

struct Reader<'a> {
    warnings: &'a mut Vec<String>,
}

impl Reader<'_> {
    fn choice(
        &mut self,
        obj: Option<&Map<String, Value>>,
        key: &str,
        allowed: &[&str],
        default: &str,
    ) -> String {
        match obj.and_then(|o| o.get(key)) {
            None => default.into(),
            Some(Value::String(s)) if allowed.contains(&s.as_str()) => s.clone(),
            Some(v) => {
                self.warnings
                    .push(format!("{key}: invalid value {v}, using \"{default}\""));
                default.into()
            }
        }
    }

    fn int(
        &mut self,
        obj: Option<&Map<String, Value>>,
        key: &str,
        min: u64,
        max: u64,
        step: u64,
        default: u32,
    ) -> u32 {
        match obj.and_then(|o| o.get(key)) {
            None => default,
            Some(v) => match v.as_u64() {
                Some(n) if (min..=max).contains(&n) && (n - min).is_multiple_of(step) => n as u32,
                _ => {
                    self.warnings
                        .push(format!("{key}: invalid value {v}, using {default}"));
                    default
                }
            },
        }
    }

    fn signed(
        &mut self,
        obj: Option<&Map<String, Value>>,
        key: &str,
        min: i64,
        max: i64,
        default: i32,
    ) -> i32 {
        match obj.and_then(|o| o.get(key)) {
            None => default,
            Some(v) => match v.as_i64() {
                Some(n) if (min..=max).contains(&n) => n as i32,
                _ => {
                    self.warnings
                        .push(format!("{key}: invalid value {v}, using {default}"));
                    default
                }
            },
        }
    }

    fn boolean(&mut self, obj: Option<&Map<String, Value>>, key: &str, default: bool) -> bool {
        match obj.and_then(|o| o.get(key)) {
            None => default,
            Some(Value::Bool(b)) => *b,
            Some(v) => {
                self.warnings
                    .push(format!("{key}: invalid value {v}, using {default}"));
                default
            }
        }
    }
}

/// Builds valid settings from arbitrary JSON; returns human-readable warnings for every field that was replaced.
pub fn from_value(value: &Value) -> (Settings, Vec<String>) {
    let d = Settings::default();
    let mut warnings = Vec::new();
    let root = match value.as_object() {
        Some(o) => Some(o),
        None => {
            warnings.push("settings root is not an object, using defaults".into());
            None
        }
    };
    let pill = root.and_then(|r| r.get("pill")).and_then(Value::as_object);
    let hotkeys = root
        .and_then(|r| r.get("hotkeys"))
        .and_then(Value::as_object);
    let command_bar = root
        .and_then(|r| r.get("commandBar"))
        .and_then(Value::as_object);
    let clipboard = root
        .and_then(|r| r.get("clipboard"))
        .and_then(Value::as_object);
    let claude = root
        .and_then(|r| r.get("claude"))
        .and_then(Value::as_object);
    let update = root
        .and_then(|r| r.get("update"))
        .and_then(Value::as_object);
    let mut r = Reader {
        warnings: &mut warnings,
    };

    let priority_widget = match pill.and_then(|p| p.get("priorityWidget")) {
        None => d.pill.priority_widget.clone(),
        Some(Value::Null) => None,
        Some(Value::String(s)) if is_widget_id(s) => Some(s.clone()),
        Some(v) => {
            r.warnings
                .push(format!("priorityWidget: invalid value {v}, using default"));
            d.pill.priority_widget.clone()
        }
    };

    let settings = Settings {
        version: VERSION,
        pill: PillSettings {
            size: r.choice(pill, "size", &["s", "m", "l"], &d.pill.size),
            always_size: r.choice(pill, "alwaysSize", &["m", "l"], &d.pill.always_size),
            panel_width: r.choice(pill, "panelWidth", &["s", "m", "l"], &d.pill.panel_width),
            top_gap: r.int(pill, "topGap", 0, 48, 1, d.pill.top_gap),
            open_mode: r.choice(
                pill,
                "openMode",
                &["hover", "click", "always"],
                &d.pill.open_mode,
            ),
            priority_widget,
            layout: r.choice(pill, "layout", &["attached", "float"], &d.pill.layout),
            material: r.choice(pill, "material", &["liquid", "dense"], &d.pill.material),
            opacity: r.int(pill, "opacity", 0, 100, 5, d.pill.opacity),
            offset_x: r.signed(pill, "offsetX", -4000, 4000, d.pill.offset_x),
            sticky: r.boolean(pill, "sticky", d.pill.sticky),
            monitor: r.choice(pill, "monitor", &["primary", "all"], &d.pill.monitor),
        },
        font_scale: r.int(root, "fontScale", 85, 130, 5, d.font_scale),
        widgets: read_widgets(root.and_then(|o| o.get("widgets")), r.warnings),
        hotkeys: Hotkeys {
            command_bar: match hotkeys.and_then(|h| h.get("commandBar")) {
                Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
                None => d.hotkeys.command_bar.clone(),
                Some(v) => {
                    r.warnings
                        .push(format!("commandBar: invalid value {v}, using default"));
                    d.hotkeys.command_bar.clone()
                }
            },
        },
        launch_at_startup: r.boolean(root, "launchAtStartup", d.launch_at_startup),
        command_bar: CommandBarSettings {
            position: read_position(command_bar.and_then(|c| c.get("position")), r.warnings),
            file_search: r.choice(
                command_bar,
                "fileSearch",
                &["auto", "everything", "windows", "off"],
                &d.command_bar.file_search,
            ),
            web_search: r.choice(
                command_bar,
                "webSearch",
                &["google", "youtube", "reddit", "x"],
                &d.command_bar.web_search,
            ),
        },
        clipboard: ClipboardSettings {
            retention_days: r.int(
                clipboard,
                "retentionDays",
                1,
                2,
                1,
                d.clipboard.retention_days,
            ),
            ignored_apps: read_app_list(
                clipboard.and_then(|c| c.get("ignoredApps")),
                &d.clipboard.ignored_apps,
                r.warnings,
            ),
            paused: r.boolean(clipboard, "paused", d.clipboard.paused),
        },
        claude: ClaudeSettings {
            enabled: r.boolean(claude, "enabled", d.claude.enabled),
            // Settings offers 0, 4, 6 and 10; anything in range is accepted, because a hand-edited file saying 5
            // is a reasonable wish, not a mistake. 0 holds the first image still.
            icon_rotate_seconds: r.int(
                claude,
                "iconRotateSeconds",
                0,
                60,
                1,
                d.claude.icon_rotate_seconds,
            ),
            usage_warn_percent: r.int(
                claude,
                "usageWarnPercent",
                0,
                100,
                1,
                d.claude.usage_warn_percent,
            ),
            multi_account: r.boolean(claude, "multiAccount", d.claude.multi_account),
            account_switcher_path: match claude.and_then(|c| c.get("accountSwitcherPath")) {
                None => d.claude.account_switcher_path.clone(),
                Some(Value::String(s))
                    if s.len() <= MAX_PATH_SETTING && !s.chars().any(char::is_control) =>
                {
                    s.trim().to_string()
                }
                Some(_) => {
                    // The value is a path on this machine: say which field, not what was in it.
                    r.warnings
                        .push("accountSwitcherPath: invalid value, using default".into());
                    d.claude.account_switcher_path.clone()
                }
            },
        },
        update: UpdateSettings {
            check: r.boolean(update, "check", d.update.check),
        },
    };
    (settings, warnings)
}

/// Executable names to skip. A broken list falls back to the defaults; broken entries are dropped one by one.
fn read_app_list(
    value: Option<&Value>,
    default: &[String],
    warnings: &mut Vec<String>,
) -> Vec<String> {
    let Some(value) = value else {
        return default.to_vec();
    };
    let Some(list) = value.as_array() else {
        warnings.push(format!(
            "ignoredApps: invalid value {value}, using defaults"
        ));
        return default.to_vec();
    };
    let mut apps = Vec::new();
    for entry in list.iter().take(200) {
        match entry.as_str().map(str::trim) {
            Some(name) if !name.is_empty() && name.chars().count() <= 100 => {
                let name = name.to_lowercase();
                if !apps.contains(&name) {
                    apps.push(name);
                }
            }
            _ => warnings.push(format!("ignoredApps: dropping invalid entry {entry}")),
        }
    }
    apps
}

/// Desktops never reach this far; anything bigger is a corrupt value, not a real screen coordinate.
const MAX_COORDINATE: i64 = 100_000;

fn read_position(value: Option<&Value>, warnings: &mut Vec<String>) -> Option<Position> {
    let value = value?;
    if value.is_null() {
        return None;
    }
    let coord = |key: &str| {
        value
            .get(key)
            .and_then(Value::as_i64)
            .filter(|n| n.abs() <= MAX_COORDINATE)
            .map(|n| n as i32)
    };
    match (coord("x"), coord("y")) {
        (Some(x), Some(y)) => Some(Position { x, y }),
        _ => {
            warnings.push(format!(
                "commandBar.position: invalid value {value}, using default"
            ));
            None
        }
    }
}

fn read_widgets(value: Option<&Value>, warnings: &mut Vec<String>) -> Vec<WidgetSetting> {
    let Some(value) = value else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        warnings.push("widgets: not a list, using defaults".into());
        return Vec::new();
    };
    let mut out: Vec<WidgetSetting> = Vec::new();
    for item in items {
        let id = item.get("id").and_then(Value::as_str);
        let enabled = item.get("enabled").and_then(Value::as_bool);
        match (id, enabled) {
            (Some(id), Some(enabled)) if is_widget_id(id) && !out.iter().any(|w| w.id == id) => out
                .push(WidgetSetting {
                    id: id.into(),
                    enabled,
                }),
            _ => warnings.push(format!(
                "widgets: skipped invalid or duplicate entry {item}"
            )),
        }
    }
    out
}

/// Reads settings from `path`. A missing file gives defaults. An unreadable or corrupt file gives defaults plus a
/// warning, and a corrupt file is copied to `settings.json.bak` so a later save cannot destroy the user's edits.
pub fn load(path: &Path) -> (Settings, Vec<String>) {
    match fs::read_to_string(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (Settings::default(), Vec::new()),
        Err(e) => (
            Settings::default(),
            vec![format!("cannot read {}: {e}", path.display())],
        ),
        // Notepad and PowerShell write UTF-8 with a BOM, which serde_json rejects.
        Ok(text) => match serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) {
            Ok(value) => from_value(&value),
            Err(e) => {
                let mut warnings = vec![format!("corrupt settings file {}: {e}", path.display())];
                let backup = path.with_extension("json.bak");
                match fs::copy(path, &backup) {
                    Ok(_) => warnings.push(format!("kept a copy at {}", backup.display())),
                    Err(e) => warnings.push(format!("could not back up the corrupt file: {e}")),
                }
                (Settings::default(), warnings)
            }
        },
    }
}

/// Writes atomically (temp file + rename) so a crash never leaves a half-written file.
pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub struct SettingsState {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsState {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        let path = app
            .path()
            .config_dir()?
            .join("winbar")
            .join("settings.json");
        let (current, warnings) = load(&path);
        for w in &warnings {
            eprintln!("winbar settings: {w}");
        }
        Ok(SettingsState {
            path,
            current: Mutex::new(current),
        })
    }

    pub fn get(&self) -> Settings {
        self.current.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, SettingsState>) -> Settings {
    state.get()
}

/// Validates, saves and broadcasts new settings; returns what was actually stored.
#[tauri::command]
pub fn update_settings<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, SettingsState>,
    settings: Value,
) -> Result<Settings, String> {
    apply(&app, &state, &settings)
}

/// Shared by the command and native callers (tray): validate, save, update state, broadcast, sync the tray.
pub fn apply<R: Runtime>(
    app: &AppHandle<R>,
    state: &SettingsState,
    settings: &Value,
) -> Result<Settings, String> {
    let (next, warnings) = from_value(settings);
    for w in &warnings {
        eprintln!("winbar settings: {w}");
    }
    let previous = state.get();
    save(&state.path, &next)?;
    *state.current.lock().map_err(|e| e.to_string())? = next.clone();
    crate::tray::sync_settings(app, &next);
    if previous.hotkeys.command_bar != next.hotkeys.command_bar {
        crate::hotkeys::apply(app, &next.hotkeys.command_bar);
    }
    if previous.launch_at_startup != next.launch_at_startup {
        crate::startup::sync_autostart(app, next.launch_at_startup);
    }
    if previous.pill.monitor != next.pill.monitor {
        // One notch on the main screen, or one per screen (SPEC §16). Opening and closing windows waits for the event
        // loop, so it must not run on the main thread — this command does.
        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(e) = crate::window::sync_windows(&handle) {
                eprintln!("winbar notch: could not update the notch windows: {e}");
            }
        });
    }
    app.emit(SETTINGS_CHANGED, &next)
        .map_err(|e| e.to_string())?;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "winbar-settings-test-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir.join("settings.json")
    }

    #[test]
    fn missing_file_gives_defaults_without_warnings() {
        let (s, w) = load(&temp_file("missing"));
        assert_eq!(s, Settings::default());
        assert!(w.is_empty());
    }

    #[test]
    fn corrupt_file_gives_defaults_with_a_warning() {
        let path = temp_file("corrupt");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{ not json").unwrap();
        let (s, w) = load(&path);
        assert_eq!(s, Settings::default());
        assert!(w[0].contains("corrupt"));
        assert_eq!(
            fs::read_to_string(path.with_extension("json.bak")).unwrap(),
            "{ not json"
        );
    }

    #[test]
    fn reads_files_saved_with_a_utf8_bom() {
        let path = temp_file("bom");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            "\u{feff}{ \"fontScale\": 120, \"pill\": { \"openMode\": \"always\" } }",
        )
        .unwrap();
        let (s, w) = load(&path);
        assert_eq!(s.font_scale, 120);
        assert_eq!(s.pill.open_mode, "always");
        assert!(w.is_empty(), "{w:?}");
    }

    #[test]
    fn the_opacity_dial_keeps_to_whole_steps_inside_its_range() {
        let (s, w) = from_value(&json!({ "pill": { "opacity": 100 } }));
        assert_eq!(s.pill.opacity, 100, "a black notch is a valid choice");
        assert!(w.is_empty(), "{w:?}");

        // Out of range, off the step, or not a number at all: back to the default rather than a silly notch.
        for bad in [json!(120), json!(7), json!(-10), json!("80"), json!(null)] {
            let (s, w) = from_value(&json!({ "pill": { "opacity": bad } }));
            assert_eq!(s.pill.opacity, Settings::default().pill.opacity, "{bad:?}");
            assert!(!w.is_empty(), "{bad:?} should warn");
        }
    }

    #[test]
    fn keeps_valid_fields_and_resets_only_invalid_ones() {
        let (s, w) = from_value(&json!({
            "pill": { "size": "l", "alwaysSize": "xl", "panelWidth": "s", "topGap": 60, "openMode": "click", "priorityWidget": "media" },
            "fontScale": 112,
            "launchAtStartup": false
        }));
        assert_eq!(s.pill.size, "l");
        assert_eq!(s.pill.always_size, "m");
        assert_eq!(s.pill.panel_width, "s");
        assert_eq!(s.pill.top_gap, 8);
        assert_eq!(s.pill.open_mode, "click");
        assert_eq!(s.pill.priority_widget.as_deref(), Some("media"));
        assert_eq!(s.font_scale, 100, "112 is not a 5% step");
        assert!(!s.launch_at_startup);
        assert_eq!(w.len(), 3);
    }

    #[test]
    fn reads_layout_and_material() {
        let (s, w) = from_value(&json!({ "pill": { "layout": "float", "material": "dense" } }));
        assert_eq!(
            (s.pill.layout.as_str(), s.pill.material.as_str()),
            ("float", "dense")
        );
        assert!(w.is_empty());
        let (s, w) = from_value(&json!({ "pill": { "layout": "drop", "material": 3 } }));
        assert_eq!(
            (s.pill.layout.as_str(), s.pill.material.as_str()),
            ("attached", "liquid")
        );
        assert_eq!(w.len(), 2);
    }

    #[test]
    fn reads_the_monitor_choice() {
        let (s, w) = from_value(&json!({ "pill": { "monitor": "all" } }));
        assert_eq!(s.pill.monitor, "all");
        assert!(w.is_empty());
        let (s, w) = from_value(&json!({ "pill": { "monitor": "second" } }));
        assert_eq!(s.pill.monitor, "primary");
        assert_eq!(w.len(), 1);
    }

    #[test]
    fn reads_sticky() {
        let (s, w) = from_value(&json!({ "pill": { "sticky": true } }));
        assert!(s.pill.sticky);
        assert!(w.is_empty());
        let (s, w) = from_value(&json!({ "pill": { "sticky": "yes" } }));
        assert!(!s.pill.sticky);
        assert_eq!(w.len(), 1);
    }

    #[test]
    fn reads_offset_x() {
        let (s, w) = from_value(&json!({ "pill": { "offsetX": -640 } }));
        assert_eq!(s.pill.offset_x, -640);
        assert!(w.is_empty());
        for bad in [json!(4001), json!(-4001), json!(1.5), json!("12")] {
            let (s, w) = from_value(&json!({ "pill": { "offsetX": bad } }));
            assert_eq!(s.pill.offset_x, 0);
            assert_eq!(w.len(), 1);
        }
    }

    #[test]
    fn missing_fields_use_defaults() {
        let (s, w) = from_value(&json!({ "fontScale": 125 }));
        assert_eq!(s.font_scale, 125);
        assert_eq!(s.pill, Settings::default().pill);
        assert!(w.is_empty());
    }

    #[test]
    fn a_file_from_before_the_update_check_has_it_on() {
        let (s, w) = from_value(&json!({ "claude": { "enabled": true } }));
        assert!(s.update.check);
        assert!(w.is_empty());
        let (s, _) = from_value(&json!({ "update": { "check": false } }));
        assert!(!s.update.check);
    }

    #[test]
    fn accepts_the_range_edges() {
        let (s, w) = from_value(&json!({ "pill": { "topGap": 0 }, "fontScale": 85 }));
        assert_eq!((s.pill.top_gap, s.font_scale), (0, 85));
        let (s, _) = from_value(&json!({ "pill": { "topGap": 48 }, "fontScale": 130 }));
        assert_eq!((s.pill.top_gap, s.font_scale), (48, 130));
        assert!(w.is_empty());
    }

    #[test]
    fn filters_invalid_and_duplicate_widgets_but_keeps_order() {
        let (s, w) = from_value(&json!({ "widgets": [
            { "id": "clipboard", "enabled": true },
            { "id": "Media Player", "enabled": true },
            { "id": "media", "enabled": false },
            { "id": "clipboard", "enabled": false },
            { "id": "system" }
        ]}));
        let ids: Vec<_> = s
            .widgets
            .iter()
            .map(|w| (w.id.as_str(), w.enabled))
            .collect();
        assert_eq!(ids, [("clipboard", true), ("media", false)]);
        assert_eq!(w.len(), 3);
    }

    #[test]
    fn reads_the_command_bar_section_field_by_field() {
        let (s, w) = from_value(&json!({
            "commandBar": { "position": { "x": -1500, "y": 320 }, "fileSearch": "windows", "webSearch": "reddit" }
        }));
        assert_eq!(s.command_bar.position, Some(Position { x: -1500, y: 320 }));
        assert_eq!(
            (
                s.command_bar.file_search.as_str(),
                s.command_bar.web_search.as_str()
            ),
            ("windows", "reddit")
        );
        assert!(w.is_empty());

        let (s, w) = from_value(&json!({ "commandBar": { "position": null } }));
        assert_eq!(s.command_bar, Settings::default().command_bar);
        assert!(
            w.is_empty(),
            "null position is the normal \"never dragged\" value"
        );
    }

    #[test]
    fn resets_only_the_broken_command_bar_fields() {
        for bad in [
            json!({ "x": 10 }),
            json!({ "x": "10", "y": 5 }),
            json!({ "x": 1.5, "y": 5 }),
            json!({ "x": 9_000_000, "y": 5 }),
            json!([1, 2]),
        ] {
            let (s, w) =
                from_value(&json!({ "commandBar": { "position": bad, "webSearch": "youtube" } }));
            assert_eq!(s.command_bar.position, None, "{bad}");
            assert_eq!(s.command_bar.web_search, "youtube");
            assert_eq!(w.len(), 1, "{bad}");
        }
        let (s, w) =
            from_value(&json!({ "commandBar": { "fileSearch": "spotlight", "webSearch": 3 } }));
        assert_eq!(
            (
                s.command_bar.file_search.as_str(),
                s.command_bar.web_search.as_str()
            ),
            ("auto", "google")
        );
        assert_eq!(w.len(), 2);
    }

    #[test]
    fn null_priority_widget_means_none() {
        let (s, _) = from_value(&json!({ "pill": { "priorityWidget": null } }));
        assert_eq!(s.pill.priority_widget, None);
    }

    #[test]
    fn the_account_switcher_settings_are_read_and_a_bad_path_never_echoed() {
        let (s, w) = from_value(&json!({ "claude": {
            "multiAccount": false, "accountSwitcherPath": "  D:\\tools\\switch.exe  " } }));
        assert!(!s.claude.multi_account);
        assert_eq!(s.claude.account_switcher_path, r"D:\tools\switch.exe");
        assert!(w.is_empty());

        let (d, _) = from_value(&json!({}));
        assert!(
            d.claude.multi_account,
            "on by default; without the CLI it does nothing"
        );
        assert_eq!(d.claude.account_switcher_path, "");

        for bad in [json!(42), json!("C:\\a\nb.exe"), json!("x".repeat(300))] {
            let (s, w) = from_value(&json!({ "claude": { "accountSwitcherPath": bad } }));
            assert_eq!(s.claude.account_switcher_path, "");
            assert_eq!(w.len(), 1);
            assert!(
                !w[0].contains("C:\\a"),
                "the warning names the field, not the path"
            );
        }
    }

    #[test]
    fn save_then_load_round_trips() {
        let path = temp_file("roundtrip");
        let mut s = Settings::default();
        s.pill.open_mode = "always".into();
        s.widgets = vec![WidgetSetting {
            id: "media".into(),
            enabled: false,
        }];
        save(&path, &s).unwrap();
        let (loaded, w) = load(&path);
        assert_eq!(loaded, s);
        assert!(w.is_empty());
        assert!(!path.with_extension("json.tmp").exists());
    }
}
