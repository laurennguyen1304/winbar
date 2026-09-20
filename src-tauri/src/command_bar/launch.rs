//! Opening what the command bar found (SPEC-command-bar §9). Every target is checked here, never trusted as sent by
//! the page: files and folders must be absolute paths that exist.

use std::path::{Component, Path, PathBuf, Prefix};

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

/// Whether a path names a place on another machine.
///
/// Asked of the parsed path rather than its text. Windows takes both separators, so `//server/share`,
/// `/\server\share` and `\/server/share` are every bit as much a network path as `\\server\share` — a check for two
/// leading backslashes waves the first three straight through. Verified against `std::path` on this machine.
pub fn is_network_path(path: &str) -> bool {
    matches!(
        Path::new(path.trim_start()).components().next(),
        Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::UNC(..) | Prefix::VerbatimUNC(..))
    )
}

/// A folder on this machine that exists right now. A terminal needs somewhere to stand, so a file is not good
/// enough, and a network path is refused before anything touches it — see `open_terminal`.
pub fn existing_dir(path: &str) -> Result<PathBuf, String> {
    if is_network_path(path) {
        return Err(format!("not a local folder: {path}"));
    }
    let p = existing_path(path)?;
    if !p.is_dir() {
        return Err(format!("not a folder: {path}"));
    }
    Ok(p)
}

/// Whether Windows Terminal can be trusted with this folder on its command line.
///
/// `wt.exe` parses its own command line a second time and splits it on `;`, so a folder named `proj;calc.exe`
/// arrives as a starting directory **and** a subcommand that runs a program. Passing the folder as its own
/// argument does not help: the operating system keeps it whole, and wt takes it apart again afterwards.
///
/// Measured, not guessed: a folder named `probe;zzznotacommand` opened a Windows Terminal window whose title was
/// `zzznotacommand` — wt had tried to run it. A semicolon in a folder name is legal on Windows, so the folder
/// goes to PowerShell instead, which is handed its directory through the process, never through a command line.
fn safe_for_windows_terminal(dir: &Path) -> bool {
    !dir.as_os_str().to_string_lossy().contains(';')
}

/// Full paths of the terminals worth trying, best first.
///
/// Full paths on purpose. `Command::new("wt.exe")` would let Windows look the name up, and what that search
/// covers — the working directory, every entry on `PATH` — depends on the platform and on the standard library's
/// version. A writable directory on `PATH` is a common enough mistake that it is not worth relying on; naming the
/// file outright means a planted `wt.exe` is never the one that runs.
#[cfg(windows)]
fn terminal_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        out.push(PathBuf::from(local).join(r"Microsoft\WindowsApps\wt.exe"));
    }
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    out.push(PathBuf::from(root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe"));
    out
}

/// Opens a terminal standing in a folder: Windows Terminal when it is installed, otherwise PowerShell in a new
/// console window.
///
/// The folder goes to the process as an argument, never through a shell, and a folder wt would re-parse goes to
/// PowerShell instead (see `safe_for_windows_terminal`). It reaches us from a file someone else's hook writes, so
/// a path holding `&` or a quote has to stay a path rather than become a second command. A UNC
/// path is refused outright: `\\somewhere\share` would have Windows open an SMB connection, and on a server that
/// asks for it that hands over the machine's credentials for nothing.
#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    let dir = existing_dir(&path)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Without this a console process spawned from a windowed app has no window to draw in.
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

        let mut last = String::from("no terminal found");
        for exe in terminal_candidates() {
            if !exe.is_file() {
                continue;
            }
            let is_wt = exe.file_name().is_some_and(|n| n == "wt.exe");
            if is_wt && !safe_for_windows_terminal(&dir) {
                // Not a failure worth reporting: the next candidate takes this folder safely.
                continue;
            }
            let mut command = std::process::Command::new(&exe);
            if is_wt {
                // Windows Terminal draws its own window and takes the folder as an argument.
                command.arg("-d").arg(&dir);
            } else {
                command.current_dir(&dir).creation_flags(CREATE_NEW_CONSOLE);
            }
            match command.spawn() {
                Ok(_) => return Ok(()),
                Err(e) => last = e.to_string(),
            }
        }
        Err(last)
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
        // A UNC path must be turned away by the UNC rule itself, before the filesystem is touched: reaching out
        // to a server that asks for credentials is an attack on its own. The error text tells the rules apart.
        for unc in [
            r"\\attacker\share",
            r"  \\attacker\share",
            // Windows takes both separators, so these three are network paths too.
            "//attacker/share",
            r"/\attacker\share",
            r"\/attacker/share",
            r"\\?\UNC\attacker\share",
        ] {
            assert_eq!(
                existing_dir(unc),
                Err(format!("not a local folder: {unc}")),
                "{unc:?}"
            );
        }
        std::fs::remove_file(file).unwrap();
    }

    #[test]
    #[cfg(windows)]
    fn a_folder_windows_terminal_would_re_parse_goes_to_powershell() {
        // Proven on this machine: a folder named `probe;zzznotacommand` made wt open a window titled
        // `zzznotacommand`, i.e. it ran the second half. `;` is legal in a Windows folder name.
        assert!(!safe_for_windows_terminal(Path::new(r"C:\work\proj;calc.exe")));
        assert!(!safe_for_windows_terminal(Path::new(r"C:\a;b")));
        assert!(safe_for_windows_terminal(Path::new(r"C:\work\my proj (2)")));
        assert!(safe_for_windows_terminal(Path::new(r"C:\work\a&b")));
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
