//! File search through a running Everything (voidtools), via the SDK DLL shipped in `resources/everything`
//! (MIT, see LICENSE.txt there). The DLL only talks to Everything over IPC; when Everything is not running every
//! query fails at once with `EVERYTHING_ERROR_IPC`, which lets `auto` fall back to Windows Search.

/// Noise folders, same list as Windows Search, in Everything's syntax (`!` = must not match the path).
const EXCLUDED: &[&str] = &[
    "\\node_modules\\",
    "\\target\\",
    "\\.git\\",
    "\\.cargo\\",
    "\\.rustup\\",
    "\\AppData\\",
    "\\.venv\\",
    "\\__pycache__\\",
    "$Recycle.Bin",
];

/// DLL file name for the CPU this app was built for.
pub const DLL_NAME: &str = if cfg!(target_arch = "aarch64") {
    "EverythingARM64.dll"
} else {
    "Everything64.dll"
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EverythingError {
    /// The DLL loaded but Everything itself is not running.
    NotRunning,
    /// The DLL is missing or failed in some other way.
    Unavailable(String),
}

/// The user's words (Everything treats spaces as AND) plus the exclusions. Quotes are removed so the text
/// cannot swallow the exclusion terms; everything else keeps Everything's own search syntax.
pub fn search_text(query: &str) -> Option<String> {
    let words: Vec<String> = query
        .split_whitespace()
        .map(|w| {
            w.chars()
                .filter(|c| *c != '"' && !c.is_control())
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .take(6)
        .collect();
    if words.is_empty() {
        return None;
    }
    let mut text = words.join(" ");
    for dir in EXCLUDED {
        text.push_str(&format!(" !\"{dir}\""));
    }
    Some(text)
}

#[cfg(windows)]
pub use imp::search;

#[cfg(windows)]
mod imp {
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};

    use windows::core::{s, HSTRING, PCWSTR, PWSTR};
    use windows::Win32::Foundation::HMODULE;
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    use super::EverythingError;

    const EVERYTHING_ERROR_IPC: u32 = 2;
    const REQUEST_FULL_PATH_AND_FILE_NAME: u32 = 0x4;
    const SORT_DATE_MODIFIED_DESCENDING: u32 = 14;
    const PATH_CHARS: usize = 1024;

    type Farproc = unsafe extern "system" fn() -> isize;
    type SetText = unsafe extern "system" fn(PCWSTR);
    type SetU32 = unsafe extern "system" fn(u32);
    type Query = unsafe extern "system" fn(i32) -> i32;
    type GetU32 = unsafe extern "system" fn() -> u32;
    type FullPath = unsafe extern "system" fn(u32, PWSTR, u32) -> u32;
    type IsFolder = unsafe extern "system" fn(u32) -> i32;

    struct Api {
        set_search: SetText,
        set_request_flags: SetU32,
        set_sort: SetU32,
        set_max: SetU32,
        query: Query,
        last_error: GetU32,
        num_results: GetU32,
        full_path: FullPath,
        is_folder: IsFolder,
    }

    /// The SDK keeps its query in globals, so calls are serialised.
    static API: OnceLock<Result<Mutex<Api>, String>> = OnceLock::new();

    unsafe fn load(dll: &Path) -> Result<Api, String> {
        let module: HMODULE = LoadLibraryW(&HSTRING::from(dll.as_os_str()))
            .map_err(|e| format!("cannot load {}: {e}", dll.display()))?;
        macro_rules! func {
            ($name:literal, $ty:ty) => {
                std::mem::transmute::<Farproc, $ty>(
                    GetProcAddress(module, s!($name))
                        .ok_or_else(|| format!("{} missing {}", dll.display(), $name))?,
                )
            };
        }
        Ok(Api {
            set_search: func!("Everything_SetSearchW", SetText),
            set_request_flags: func!("Everything_SetRequestFlags", SetU32),
            set_sort: func!("Everything_SetSort", SetU32),
            set_max: func!("Everything_SetMax", SetU32),
            query: func!("Everything_QueryW", Query),
            last_error: func!("Everything_GetLastError", GetU32),
            num_results: func!("Everything_GetNumResults", GetU32),
            full_path: func!("Everything_GetResultFullPathNameW", FullPath),
            is_folder: func!("Everything_IsFolderResult", IsFolder),
        })
    }

    /// Blocking. Returns (full path, is folder), newest first.
    pub fn search(
        dll: &Path,
        text: &str,
        limit: u32,
    ) -> Result<Vec<(String, bool)>, EverythingError> {
        let api = API
            .get_or_init(|| unsafe { load(dll) }.map(Mutex::new))
            .as_ref()
            .map_err(|e| EverythingError::Unavailable(e.clone()))?;
        let api = api
            .lock()
            .map_err(|e| EverythingError::Unavailable(e.to_string()))?;
        let search = HSTRING::from(text);
        unsafe {
            (api.set_search)(PCWSTR(search.as_ptr()));
            (api.set_request_flags)(REQUEST_FULL_PATH_AND_FILE_NAME);
            (api.set_sort)(SORT_DATE_MODIFIED_DESCENDING);
            (api.set_max)(limit);
            if (api.query)(1) == 0 {
                let code = (api.last_error)();
                return Err(if code == EVERYTHING_ERROR_IPC {
                    EverythingError::NotRunning
                } else {
                    EverythingError::Unavailable(format!("Everything query failed ({code})"))
                });
            }
            let mut out = Vec::new();
            let mut buf = [0u16; PATH_CHARS];
            for i in 0..(api.num_results)() {
                let len = (api.full_path)(i, PWSTR(buf.as_mut_ptr()), PATH_CHARS as u32) as usize;
                if len == 0 || len >= PATH_CHARS {
                    continue;
                }
                out.push((
                    String::from_utf16_lossy(&buf[..len]),
                    (api.is_folder)(i) != 0,
                ));
            }
            Ok(out)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_words_and_appends_exclusions() {
        let text = search_text("  brief   acme ").unwrap();
        assert!(
            text.starts_with("brief acme !\"\\node_modules\\\""),
            "{text}"
        );
        assert!(text.ends_with(" !\"$Recycle.Bin\""));
        assert_eq!(text.matches(" !\"").count(), EXCLUDED.len());
    }

    #[test]
    fn quotes_cannot_swallow_the_exclusions() {
        let text = search_text("say \"hi").unwrap();
        assert!(text.starts_with("say hi !"), "{text}");
        assert_eq!(text.matches('"').count(), EXCLUDED.len() * 2);
    }

    #[test]
    fn nothing_to_search_gives_nothing() {
        assert_eq!(search_text("   "), None);
        assert_eq!(search_text("\"\""), None);
    }

    #[test]
    fn picks_the_dll_for_this_cpu() {
        #[cfg(target_arch = "aarch64")]
        assert_eq!(DLL_NAME, "EverythingARM64.dll");
        #[cfg(target_arch = "x86_64")]
        assert_eq!(DLL_NAME, "Everything64.dll");
    }

    /// Everything is not installed on the development machine: the shipped DLL must load and report "not running".
    #[cfg(windows)]
    #[test]
    fn shipped_dll_loads_and_reports_when_everything_is_not_running() {
        let dll = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("everything")
            .join(DLL_NAME);
        let running = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq Everything.exe"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains("Everything.exe"))
            .unwrap_or(false);
        let result = search(&dll, &search_text("winbar").unwrap(), 5);
        if running {
            assert!(result.is_ok(), "{result:?}");
        } else {
            assert_eq!(result, Err(EverythingError::NotRunning));
        }
    }
}
