//! Opening what the command bar found (SPEC-command-bar §9). Every target is checked here, never trusted as sent by
//! the page: files and folders must be absolute paths that exist.

use std::path::{Path, PathBuf};

/// An absolute path to a file or folder that exists right now.
pub fn existing_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if path.trim().is_empty() || !p.is_absolute() {
        return Err(format!("not an absolute path: {path:?}"));
    }
    if !p.exists() {
        return Err(format!("path does not exist: {path}"));
    }
    Ok(p.to_path_buf())
}

#[cfg(windows)]
fn shell_open(target: &Path) -> Result<(), String> {
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let target = HSTRING::from(target.as_os_str());
    let code = unsafe { ShellExecuteW(None, w!("open"), &target, None, None, SW_SHOWNORMAL) };
    // ShellExecute reports success as a value above 32.
    if code.0 as isize > 32 {
        Ok(())
    } else {
        Err(format!("ShellExecute failed ({})", code.0 as isize))
    }
}

/// Opens a file with its default app, or a folder in Explorer.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let path = existing_path(&path)?;
    #[cfg(windows)]
    return shell_open(&path);
    #[cfg(not(windows))]
    return Err(format!("unsupported platform for {}", path.display()));
}

/// Opens Explorer on the containing folder with the item selected (Ctrl+Enter).
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let path = existing_path(&path)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Windows file names cannot contain a double quote, so quoting the path is enough.
        std::process::Command::new("explorer.exe")
            .raw_arg(format!("/select,\"{}\"", path.display()))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    Err(format!("unsupported platform for {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_existing_absolute_files_and_folders() {
        let dir = std::env::temp_dir();
        let file = dir.join("winbar-launch-test.txt");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(existing_path(file.to_str().unwrap()), Ok(file.clone()));
        assert_eq!(existing_path(dir.to_str().unwrap()), Ok(dir.clone()));
        std::fs::remove_file(file).unwrap();
    }

    #[test]
    fn rejects_everything_else() {
        let missing = std::env::temp_dir().join("winbar-launch-missing-9f2c.txt");
        for bad in [
            "",
            "   ",
            "notes.txt",
            "..\\secret.txt",
            "https://example.com",
            "ms-settings:display",
            missing.to_str().unwrap(),
        ] {
            assert!(existing_path(bad).is_err(), "{bad:?}");
        }
    }
}
