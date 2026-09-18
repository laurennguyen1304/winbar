//! Real icons for command bar rows (SPEC-command-bar §3, Task 8). Windows draws the icon
//! (`IShellItemImageFactory`), WIC encodes it as PNG into `%LOCALAPPDATA%\winbar\icons`, and the page gets a
//! `data:` URL, so no asset protocol or CSP change is needed.
//!
//! The page asks with specs: `shell:app:<AppsFolder id>`, or `shell:file:<absolute path>` / `shell:folder:<path>`
//! (the kind only changes what the page shows while waiting). Ordinary files share one
//! icon per extension; folders share one; executables and shortcuts get their own, keyed by path and modified time.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};

use super::apps::AppsState;
use super::launch;

/// Drawn at 48 px and shown at 32 logical px, sharp up to 150% scaling.
pub const ICON_PX: i32 = 48;
const MAX_BATCH: usize = 32;
/// Extensions whose icon belongs to the file itself rather than to its type.
const OWN_ICON_EXTENSIONS: &[&str] = &["exe", "lnk", "ico", "url", "appref-ms", "msc", "cpl"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IconSpec {
    App(String),
    File(String),
}

pub fn parse_spec(spec: &str) -> Option<IconSpec> {
    if let Some(id) = spec.strip_prefix("shell:app:") {
        return (!id.is_empty()).then(|| IconSpec::App(id.to_string()));
    }
    if let Some(path) = spec
        .strip_prefix("shell:file:")
        .or_else(|| spec.strip_prefix("shell:folder:"))
    {
        return (!path.is_empty()).then(|| IconSpec::File(path.to_string()));
    }
    None
}

/// What the cached PNG is named after, and what Windows is asked to draw.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IconSource {
    pub cache_key: String,
    /// Parsing name for `SHCreateItemFromParsingName`.
    pub parsing_name: String,
}

/// FNV-1a: stable across builds, so cache file names survive app updates.
pub fn stable_hash(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

/// `modified` is the file's (or the app's executable's) modified time in seconds, when known.
pub fn app_source(id: &str, modified: Option<u64>) -> IconSource {
    IconSource {
        cache_key: format!("app|{id}|{}", modified.unwrap_or(0)),
        parsing_name: format!("shell:AppsFolder\\{id}"),
    }
}

pub fn file_source(path: &Path, is_dir: bool, modified: Option<u64>) -> IconSource {
    let parsing_name = path.to_string_lossy().into_owned();
    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let cache_key = if is_dir {
        "folder".to_string()
    } else if OWN_ICON_EXTENSIONS.contains(&extension.as_str()) {
        format!(
            "file|{}|{}",
            parsing_name.to_lowercase(),
            modified.unwrap_or(0)
        )
    } else {
        format!("ext|{extension}")
    };
    IconSource {
        cache_key,
        parsing_name,
    }
}

pub fn cache_file(dir: &Path, source: &IconSource) -> PathBuf {
    dir.join(format!("{:016x}.png", stable_hash(&source.cache_key)))
}

pub fn data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", base64_of(png))
}

/// Standard base64 with padding. Shared with the Claude icons, which need their own media type.
pub fn base64_of(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(TABLE[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn modified_secs(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

#[derive(Default)]
pub struct IconsState {
    /// Data URLs already read this session, by cache key.
    memory: Mutex<HashMap<String, String>>,
    /// One drawing at a time: the shell image factory is not meant to be hammered from many threads.
    drawing: Mutex<()>,
}

pub fn cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .local_data_dir()
        .map_err(|e| e.to_string())?
        .join("winbar")
        .join("icons"))
}

/// Resolves a spec to something Windows can draw, refusing ids and paths the command bar did not produce.
fn source_for<R: Runtime>(app: &AppHandle<R>, spec: &IconSpec) -> Option<IconSource> {
    match spec {
        IconSpec::App(id) => {
            let entry = app.state::<AppsState>().find(id)?;
            let modified = entry.path.as_deref().map(Path::new).and_then(modified_secs);
            Some(app_source(&entry.id, modified))
        }
        IconSpec::File(path) => {
            let path = launch::existing_path(path).ok()?;
            Some(file_source(&path, path.is_dir(), modified_secs(&path)))
        }
    }
}

/// Data URL for one source: memory, then the PNG cache, then drawing it. Blocking.
fn load(state: &IconsState, dir: &Path, source: &IconSource) -> Option<String> {
    if let Some(url) = state.memory.lock().ok()?.get(&source.cache_key) {
        return Some(url.clone());
    }
    let file = cache_file(dir, source);
    if !file.exists() {
        let _one = state.drawing.lock().unwrap_or_else(|e| e.into_inner());
        if !file.exists() {
            std::fs::create_dir_all(dir).ok()?;
            if let Err(e) = draw_png(&source.parsing_name, &file) {
                eprintln!("winbar icons: {}: {e}", source.parsing_name);
                return None;
            }
        }
    }
    let url = data_url(&std::fs::read(&file).ok()?);
    if let Ok(mut memory) = state.memory.lock() {
        memory.insert(source.cache_key.clone(), url.clone());
    }
    Some(url)
}

/// Icons for up to 32 specs, in order; `None` where there is no icon (unknown id, missing file, drawing failed).
#[tauri::command]
pub async fn shell_icons<R: Runtime>(
    app: AppHandle<R>,
    specs: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    if specs.len() > MAX_BATCH {
        return Err(format!("at most {MAX_BATCH} icons per call"));
    }
    let dir = cache_dir(&app)?;
    let sources: Vec<Option<IconSource>> = specs
        .iter()
        .map(|s| parse_spec(s).and_then(|spec| source_for(&app, &spec)))
        .collect();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<IconsState>();
        sources
            .iter()
            .map(|s| s.as_ref().and_then(|s| load(&state, &dir, s)))
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Draws every listed app's icon into the cache in the background, so rows show real icons from the first search.
pub fn warm_app_icons<R: Runtime>(app: &AppHandle<R>, apps: Vec<super::apps::AppEntry>) {
    let Ok(dir) = cache_dir(app) else { return };
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<IconsState>();
        for entry in apps {
            let modified = entry.path.as_deref().map(Path::new).and_then(modified_secs);
            let source = app_source(&entry.id, modified);
            if !cache_file(&dir, &source).exists() {
                let _ = load(&state, &dir, &source);
            }
        }
    });
}

#[cfg(windows)]
fn draw_png(parsing_name: &str, out: &Path) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Foundation::{GENERIC_WRITE, RPC_E_CHANGED_MODE, SIZE};
    use windows::Win32::Graphics::Gdi::{DeleteObject, HPALETTE};
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_ContainerFormatPng, IWICImagingFactory,
        WICBitmapEncoderNoCache, WICBitmapUseAlpha,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IShellItem, IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK,
        SIIGBF_ICONONLY,
    };

    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if hr.is_err() && hr != RPC_E_CHANGED_MODE {
            return Err(hr.to_string());
        }
        let tmp = out.with_extension("png.tmp");
        let result = (|| -> windows::core::Result<()> {
            let item: IShellItem = SHCreateItemFromParsingName(&HSTRING::from(parsing_name), None)?;
            let factory: IShellItemImageFactory = item.cast()?;
            let bitmap = factory.GetImage(
                SIZE {
                    cx: ICON_PX,
                    cy: ICON_PX,
                },
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
            )?;
            let encoded = (|| {
                let wic: IWICImagingFactory =
                    CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
                let source =
                    wic.CreateBitmapFromHBITMAP(bitmap, HPALETTE::default(), WICBitmapUseAlpha)?;
                let stream = wic.CreateStream()?;
                stream.InitializeFromFilename(&HSTRING::from(tmp.as_os_str()), GENERIC_WRITE.0)?;
                let encoder = wic.CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())?;
                encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
                let mut frame = None;
                encoder.CreateNewFrame(&mut frame, std::ptr::null_mut())?;
                let frame = frame.ok_or_else(windows::core::Error::empty)?;
                frame.Initialize(None)?;
                frame.WriteSource(&source, std::ptr::null())?;
                frame.Commit()?;
                encoder.Commit()
            })();
            let _ = DeleteObject(bitmap.into());
            encoded
        })();
        if hr.is_ok() {
            CoUninitialize();
        }
        match result {
            Ok(()) => std::fs::rename(&tmp, out).map_err(|e| e.to_string()),
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                Err(e.to_string())
            }
        }
    }
}

#[cfg(not(windows))]
fn draw_png(parsing_name: &str, _out: &Path) -> Result<(), String> {
    Err(format!("no shell icons for {parsing_name}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_the_two_spec_kinds() {
        assert_eq!(
            parse_spec("shell:app:Chrome"),
            Some(IconSpec::App("Chrome".into()))
        );
        assert_eq!(
            parse_spec(r"shell:file:C:\Users\me\a.pdf"),
            Some(IconSpec::File(r"C:\Users\me\a.pdf".into()))
        );
        assert_eq!(
            parse_spec(r"shell:folder:C:\Users\me"),
            Some(IconSpec::File(r"C:\Users\me".into()))
        );
        for bad in [
            "",
            "shell:app:",
            "shell:file:",
            "shell:folder:",
            "app:Chrome",
            "https://x",
            "shell:AppsFolder\\Chrome",
        ] {
            assert_eq!(parse_spec(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn ordinary_files_share_an_icon_per_extension() {
        let a = file_source(Path::new(r"C:\a\report.PDF"), false, Some(1));
        let b = file_source(Path::new(r"D:\b\other.pdf"), false, Some(2));
        assert_eq!(a.cache_key, "ext|pdf");
        assert_eq!(a.cache_key, b.cache_key);
        assert_eq!(a.parsing_name, r"C:\a\report.PDF");
    }

    #[test]
    fn executables_shortcuts_and_folders_are_keyed_differently() {
        let exe1 = file_source(Path::new(r"C:\Apps\Code.exe"), false, Some(10));
        let exe2 = file_source(Path::new(r"C:\Apps\Code.exe"), false, Some(11));
        let lnk = file_source(Path::new(r"C:\Start\Figma.lnk"), false, None);
        assert_ne!(
            exe1.cache_key, exe2.cache_key,
            "a rebuilt exe gets a fresh icon"
        );
        assert!(lnk.cache_key.starts_with("file|"));
        assert_eq!(
            file_source(Path::new(r"C:\Users\me\Downloads"), true, Some(5)).cache_key,
            "folder"
        );
    }

    #[test]
    fn app_icons_follow_the_executable_modified_time() {
        let a = app_source("Microsoft.VisualStudioCode", Some(100));
        assert_eq!(
            a.parsing_name,
            "shell:AppsFolder\\Microsoft.VisualStudioCode"
        );
        assert_ne!(
            a.cache_key,
            app_source("Microsoft.VisualStudioCode", Some(200)).cache_key
        );
    }

    #[test]
    fn cache_file_names_are_stable_hex() {
        assert_eq!(stable_hash(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(stable_hash("a"), 0xaf63_dc4c_8601_ec8c);
        let file = cache_file(Path::new(r"C:\cache"), &app_source("Chrome", None));
        let name = file.file_name().unwrap().to_string_lossy().into_owned();
        assert_eq!(name.len(), "0123456789abcdef.png".len());
        assert!(name.ends_with(".png"));
    }

    #[test]
    fn base64_matches_the_standard_alphabet_with_padding() {
        assert_eq!(base64_of(b""), "");
        assert_eq!(base64_of(b"f"), "Zg==");
        assert_eq!(base64_of(b"fo"), "Zm8=");
        assert_eq!(base64_of(b"foo"), "Zm9v");
        assert_eq!(base64_of(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64_of(&[0xff, 0xfe]), "//4=");
        assert!(data_url(b"x").starts_with("data:image/png;base64,"));
    }

    #[cfg(windows)]
    #[test]
    fn draws_a_folder_icon_as_png() {
        let out = std::env::temp_dir().join("winbar-icon-test.png");
        let _ = std::fs::remove_file(&out);
        draw_png(&std::env::temp_dir().to_string_lossy(), &out).expect("draw");
        let png = std::fs::read(&out).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        std::fs::remove_file(out).unwrap();
    }
}
