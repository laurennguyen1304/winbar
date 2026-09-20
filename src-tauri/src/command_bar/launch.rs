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

/// Opens a target already checked by the caller, e.g. `shell:AppsFolder\<id>` for a listed app.
pub fn open_shell_target(target: &str) -> Result<(), String> {
    #[cfg(windows)]
    return shell_open(Path::new(target));
    #[cfg(not(windows))]
    return Err(format!("unsupported platform for {target}"));
}

/// A web address the command bar may hand to the browser: `http`/`https` only, no spaces or control characters.
pub fn web_url(url: &str) -> Result<&str, String> {
    let lower = url.to_ascii_lowercase();
    let has_host = ["https://", "http://"]
        .iter()
        .any(|scheme| lower.starts_with(scheme) && url.len() > scheme.len());
    if !has_host || url.len() > 2048 || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(format!("not an http(s) address: {url:?}"));
    }
    Ok(url)
}

/// Opens an http(s) address in the default browser (web search rows).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let url = web_url(&url)?;
    #[cfg(windows)]
    return shell_open(Path::new(url));
    #[cfg(not(windows))]
    return Err(format!("unsupported platform for {url}"));
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

/// A folder that exists right now. A terminal needs somewhere to stand, so a file is not good enough.
pub fn existing_dir(path: &str) -> Result<PathBuf, String> {
    let p = existing_path(path)?;
    if !p.is_dir() {
        return Err(format!("not a folder: {path}"));
    }
    Ok(p)
}

/// Opens a terminal standing in a folder: Windows Terminal when it is installed, otherwise PowerShell in a new
/// console window.
///
/// The arguments go as an array, never through a shell. The folder reaches us from a file someone else's hook
/// writes, so a path holding `&` or a quote must stay a path and not become a second command.
#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    let dir = existing_dir(&path)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Without this a console process spawned from a windowed app has no window to draw in.
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

        if std::process::Command::new("wt.exe")
            .arg("-d")
            .arg(&dir)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        std::process::Command::new("powershell.exe")
            .current_dir(&dir)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    Err(format!("unsupported platform for {}", dir.display()))
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
    fn a_terminal_only_opens_in_a_folder() {
        let dir = std::env::temp_dir();
        let file = dir.join("winbar-terminal-test.txt");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(existing_dir(dir.to_str().unwrap()), Ok(dir.clone()));
        // A session's `cwd` is meant to be a folder; a file, a missing path or a relative one is not one.
        assert!(existing_dir(file.to_str().unwrap()).is_err());
        assert!(existing_dir(r"..\somewhere").is_err());
        assert!(existing_dir("").is_err());
        std::fs::remove_file(file).unwrap();
    }

    #[test]
    fn only_http_and_https_addresses_reach_the_browser() {
        assert!(web_url("https://www.google.com/search?q=tauri%20window").is_ok());
        assert!(web_url("HTTP://example.com").is_ok());
        for bad in [
            "",
            "https://",
            "file:///C:/Windows/System32/cmd.exe",
            "javascript:alert(1)",
            "ms-settings:display",
            r"C:\Windows\notepad.exe",
            "https://example.com/a b",
            "https://example.com/\n",
            "httpsx://example.com",
        ] {
            assert!(web_url(bad).is_err(), "{bad:?}");
        }
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
