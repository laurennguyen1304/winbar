//! Status images the owner drops in herself (SPEC-claude §5.4).
//!
//! The three that ship with the app are bundled by Vite and imported in TypeScript. This module only handles the
//! extra folder, `%APPDATA%\winbar\claude-icons\<phase>\`, so images can be added without a rebuild — which is
//! also why they come back as data URLs rather than paths: the page cannot read arbitrary files.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Phase folders scanned, which are also the keys the page gets back.
pub const PHASES: [&str; 4] = ["idle", "thinking", "tool", "permission"];
/// Per file. A status icon is small; anything larger is a mistake, not an icon.
pub const MAX_BYTES: u64 = 2 * 1024 * 1024;
/// Per folder, so a folder full of holiday photos cannot fill the panel or memory.
pub const MAX_PER_PHASE: usize = 12;

pub fn icons_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("winbar").join("claude-icons")
}

/// Media type for an extension we are willing to show, or `None` for anything else.
pub fn media_type(extension: &str) -> Option<&'static str> {
    match extension.to_ascii_lowercase().as_str() {
        "png" | "apng" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Extra images per phase, as data URLs. Missing folders simply mean no extra images.
pub fn read(config_dir: &Path) -> BTreeMap<String, Vec<String>> {
    let root = icons_dir(config_dir);
    PHASES
        .iter()
        .map(|phase| ((*phase).to_string(), read_phase(&root.join(phase))))
        .collect()
}

fn read_phase(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    // Sorted by name so the rotation order is predictable and stable between runs.
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    files.sort();

    let mut out = Vec::new();
    for path in files {
        if out.len() >= MAX_PER_PHASE {
            break;
        }
        let Some(kind) = path
            .extension()
            .and_then(|e| e.to_str())
            .and_then(media_type)
        else {
            continue;
        };
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES || m.len() == 0) {
            continue;
        }
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        out.push(format!(
            "data:{kind};base64,{}",
            crate::command_bar::icons::base64_of(&bytes)
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("winbar-claude-icons-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    /// The smallest valid PNG, so the reader sees a real file rather than an empty one.
    const PNG: &[u8] = &[
        0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, b'I', b'H', b'D', b'R',
    ];

    #[test]
    fn only_image_extensions_are_offered() {
        for good in ["png", "PNG", "apng", "jpg", "jpeg", "gif", "webp"] {
            assert!(media_type(good).is_some(), "{good}");
        }
        for bad in ["exe", "svg", "txt", "", "png.exe"] {
            assert_eq!(media_type(bad), None, "{bad}");
        }
    }

    #[test]
    fn reads_a_phase_folder_in_name_order() {
        let dir = temp_dir("order");
        let phase = icons_dir(&dir).join("thinking");
        std::fs::create_dir_all(&phase).expect("creates");
        for name in ["b.png", "a.gif", "c.webp"] {
            std::fs::write(phase.join(name), PNG).expect("writes");
        }
        let icons = read(&dir);
        let thinking = &icons["thinking"];
        assert_eq!(thinking.len(), 3);
        assert!(
            thinking[0].starts_with("data:image/gif;base64,"),
            "a.gif sorts first"
        );
        assert!(thinking[1].starts_with("data:image/png;base64,"));
        assert!(
            icons["idle"].is_empty(),
            "a folder that is not there is simply empty"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_folder_that_does_not_exist_is_not_an_error() {
        let icons = read(Path::new("C:\\definitely\\not\\here-9f2c"));
        assert_eq!(icons.len(), PHASES.len());
        assert!(icons.values().all(Vec::is_empty));
    }

    #[test]
    fn oversized_empty_and_foreign_files_are_left_out() {
        let dir = temp_dir("filter");
        let phase = icons_dir(&dir).join("tool");
        std::fs::create_dir_all(&phase).expect("creates");
        std::fs::write(phase.join("good.png"), PNG).expect("writes");
        std::fs::write(phase.join("empty.png"), b"").expect("writes");
        std::fs::write(phase.join("huge.png"), vec![0u8; (MAX_BYTES + 1) as usize])
            .expect("writes");
        std::fs::write(phase.join("notes.txt"), PNG).expect("writes");
        std::fs::write(phase.join("program.exe"), PNG).expect("writes");
        assert_eq!(read(&dir)["tool"].len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_folder_full_of_files_is_capped() {
        let dir = temp_dir("cap");
        let phase = icons_dir(&dir).join("idle");
        std::fs::create_dir_all(&phase).expect("creates");
        for i in 0..(MAX_PER_PHASE + 5) {
            std::fs::write(phase.join(format!("{i:02}.png")), PNG).expect("writes");
        }
        assert_eq!(read(&dir)["idle"].len(), MAX_PER_PHASE);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
