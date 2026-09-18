//! Windows side of the clipboard watcher: a message-only window that receives `WM_CLIPBOARDUPDATE`.
//!
//! Two threads, on purpose. The window thread only notes that something changed; a reader thread waits a moment and
//! then opens the clipboard. Opening it inside the message handler makes the app that is copying fail — Windows lets
//! one process hold the clipboard at a time, and apps copying in a burst do not retry. The pause also collapses a
//! burst into one read.
//!
//! Content read here goes straight to the store and nowhere else: [`Capture`] deliberately cannot be serialised,
//! while [`super::Sighting`], which can, carries only the shape of a copy.

use super::Sighting;

/// One clipboard change, with whatever content belongs in the history.
#[derive(Default)]
pub struct Capture {
    pub sighting: Sighting,
    pub text: Option<String>,
    /// The picture as Windows holds it: a bitmap with no file header.
    pub dib: Option<Vec<u8>>,
}

#[cfg(windows)]
mod imp {
    use super::Capture;
    use crate::clipboard::{is_private, kind_for, Kind};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Condvar, Mutex};
    use std::time::Duration;
    use windows::core::{w, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HGLOBAL, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    use windows::Win32::System::DataExchange::{
        AddClipboardFormatListener, CloseClipboard, EmptyClipboard, EnumClipboardFormats,
        GetClipboardData, GetClipboardFormatNameW, GetClipboardOwner, GetClipboardSequenceNumber,
        OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows::Win32::System::Ole::{
        CF_BITMAP, CF_DIB, CF_DIBV5, CF_HDROP, CF_LOCALE, CF_OEMTEXT, CF_TEXT, CF_UNICODETEXT,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow, GetMessageW,
        GetWindowThreadProcessId, RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG,
        WINDOW_EX_STYLE, WINDOW_STYLE, WM_CLIPBOARDUPDATE, WNDCLASSW,
    };

    type Handler = Box<dyn Fn(Capture) + Send>;

    /// One watcher per process, so the window procedure can reach it without capturing.
    static HANDLER: Mutex<Option<Handler>> = Mutex::new(None);

    /// Raised by the window thread, lowered by the reader thread.
    static CHANGED: Mutex<bool> = Mutex::new(false);
    static WAKE: Condvar = Condvar::new();

    /// The sequence number of a copy winbar made itself, so putting an item back does not record it again.
    static OWN_COPY: AtomicU32 = AtomicU32::new(0);

    /// How long to leave the clipboard to the app that is copying before reading it.
    const SETTLE: Duration = Duration::from_millis(60);

    /// Formats whose DWORD value decides whether the copy may be kept.
    const DWORD_FLAGS: [&str; 2] = ["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard"];

    pub fn watch<F: Fn(Capture) + Send + 'static>(on_change: F) {
        match HANDLER.lock() {
            Ok(mut handler) => *handler = Some(Box::new(on_change)),
            Err(_) => return,
        }
        let _ = std::thread::Builder::new()
            .name("clipboard-reader".into())
            .spawn(read_loop);
        let _ = std::thread::Builder::new()
            .name("clipboard".into())
            // SAFETY: the thread owns the window it creates and pumps its own messages.
            .spawn(|| unsafe { pump() });
    }

    fn flag() -> std::sync::MutexGuard<'static, bool> {
        CHANGED.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Waits for changes, lets them settle, then reports one capture per distinct clipboard state.
    fn read_loop() {
        // A copied picture is turned into a PNG with WIC, which is COM; this thread needs its own apartment.
        // SAFETY: called once, before anything on this thread uses COM.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let mut last_seq = 0u32;
        loop {
            {
                let mut changed = flag();
                while !*changed {
                    changed = WAKE.wait(changed).unwrap_or_else(|e| e.into_inner());
                }
            }
            std::thread::sleep(SETTLE);
            // Anything that arrived during the pause belongs to this read.
            *flag() = false;

            // SAFETY: plain clipboard reads on this thread; every open is closed inside `read`.
            let capture = unsafe {
                let seq = GetClipboardSequenceNumber();
                if seq == last_seq || seq == OWN_COPY.load(Ordering::Relaxed) {
                    continue;
                }
                last_seq = seq;
                read()
            };
            if let Ok(handler) = HANDLER.lock() {
                if let Some(handler) = handler.as_ref() {
                    handler(capture);
                }
            }
        }
    }

    unsafe fn pump() {
        // SAFETY: plain Win32 window setup; every handle is used only while it is alive.
        unsafe {
            let class = w!("winbar_clipboard_listener");
            let Ok(module) = GetModuleHandleW(None) else {
                return;
            };
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: module.into(),
                lpszClassName: class,
                ..Default::default()
            };
            if RegisterClassW(&wc) == 0 {
                return;
            }
            let Ok(hwnd) = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class,
                w!("winbar clipboard"),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(module.into()),
                None,
            ) else {
                return;
            };
            if AddClipboardFormatListener(hwnd).is_err() {
                return;
            }
            let mut msg = MSG::default();
            loop {
                let got = GetMessageW(&mut msg, None, 0, 0);
                if got.0 <= 0 {
                    return;
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_CLIPBOARDUPDATE {
            // Only a nudge: the reader thread opens the clipboard, once the copying app is done with it.
            *flag() = true;
            WAKE.notify_one();
            return LRESULT(0);
        }
        // SAFETY: forwards untouched messages.
        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }

    /// Opens the clipboard, waiting for whoever holds it. `None` when it stays busy.
    unsafe fn open() -> Option<Guard> {
        // SAFETY: the matching close happens in `Guard::drop`.
        unsafe {
            for _ in 0..10 {
                if OpenClipboard(None).is_ok() {
                    return Some(Guard);
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            None
        }
    }

    /// Closes the clipboard however the caller leaves.
    struct Guard;

    impl Drop for Guard {
        fn drop(&mut self) {
            // SAFETY: only ever created by a successful `OpenClipboard` on this thread.
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }

    /// Reads what is on the clipboard now.
    unsafe fn read() -> Capture {
        // SAFETY: the clipboard is open for the whole body; handles stay owned by their source.
        unsafe {
            let mut out = Capture::default();
            out.sighting.seq = GetClipboardSequenceNumber();
            out.sighting.owner = copying_app();
            let Some(_open) = open() else {
                out.sighting.formats.push("<locked>".into());
                return out;
            };

            let mut zero_valued = Vec::new();
            let mut format = 0u32;
            loop {
                format = EnumClipboardFormats(format);
                if format == 0 {
                    break;
                }
                let name = format_name(format);
                if DWORD_FLAGS.contains(&name.as_str()) && dword(format) == Some(0) {
                    zero_valued.push(name.clone());
                }
                out.sighting.formats.push(name);
            }

            out.sighting.kind = kind_for(&out.sighting.formats);
            out.sighting.private = is_private(&out.sighting.formats, &zero_valued);
            // A copy the source asked us to forget is measured but never read.
            if out.sighting.private {
                return out;
            }
            match out.sighting.kind {
                Kind::Text => {
                    out.text = text();
                    out.sighting.size = out.text.as_ref().map_or(0, |t| t.chars().count());
                }
                Kind::Image => {
                    out.dib = bytes(CF_DIBV5.0 as u32).or_else(|| bytes(CF_DIB.0 as u32));
                    out.sighting.size = out.dib.as_ref().map_or(0, |d| d.len());
                }
                _ => out.sighting.size = byte_len(CF_HDROP.0 as u32).unwrap_or(0),
            }
            out
        }
    }

    /// The text on the clipboard.
    unsafe fn text() -> Option<String> {
        // SAFETY: the clipboard is open; the block stays valid between lock and unlock.
        unsafe {
            let handle = GetClipboardData(CF_UNICODETEXT.0 as u32).ok()?;
            let global = HGLOBAL(handle.0);
            let len = GlobalSize(global) / 2;
            let ptr = GlobalLock(global) as *const u16;
            if ptr.is_null() || len == 0 {
                return None;
            }
            let wide = std::slice::from_raw_parts(ptr, len);
            let end = wide.iter().position(|c| *c == 0).unwrap_or(wide.len());
            let text = String::from_utf16_lossy(&wide[..end]);
            let _ = GlobalUnlock(global);
            Some(text)
        }
    }

    /// A whole format's data as bytes.
    unsafe fn bytes(format: u32) -> Option<Vec<u8>> {
        // SAFETY: as above.
        unsafe {
            let handle = GetClipboardData(format).ok()?;
            let global = HGLOBAL(handle.0);
            let size = GlobalSize(global);
            if size == 0 || size > super::super::image::MAX_DIB_BYTES {
                return None;
            }
            let ptr = GlobalLock(global) as *const u8;
            if ptr.is_null() {
                return None;
            }
            let copy = std::slice::from_raw_parts(ptr, size).to_vec();
            let _ = GlobalUnlock(global);
            Some(copy)
        }
    }

    /// Size in bytes of one format's data, or `None` when it is not on offer.
    unsafe fn byte_len(format: u32) -> Option<usize> {
        // SAFETY: as above. GlobalSize neither locks nor copies.
        unsafe {
            let handle = GetClipboardData(format).ok()?;
            let size = GlobalSize(HGLOBAL(handle.0));
            (size > 0).then_some(size)
        }
    }

    /// Value of a DWORD-shaped format such as `CanIncludeInClipboardHistory`.
    unsafe fn dword(format: u32) -> Option<u32> {
        // SAFETY: as above; the four bytes are read while the clipboard is open.
        unsafe {
            let handle = GetClipboardData(format).ok()?;
            let global = HGLOBAL(handle.0);
            if GlobalSize(global) < 4 {
                return None;
            }
            Some(std::ptr::read_unaligned(handle.0 as *const u32))
        }
    }

    fn format_name(format: u32) -> String {
        let standard = match format as u16 {
            f if f == CF_TEXT.0 => Some("CF_TEXT"),
            f if f == CF_BITMAP.0 => Some("CF_BITMAP"),
            f if f == CF_OEMTEXT.0 => Some("CF_OEMTEXT"),
            f if f == CF_DIB.0 => Some("CF_DIB"),
            f if f == CF_UNICODETEXT.0 => Some("CF_UNICODETEXT"),
            f if f == CF_HDROP.0 => Some("CF_HDROP"),
            f if f == CF_LOCALE.0 => Some("CF_LOCALE"),
            f if f == CF_DIBV5.0 => Some("CF_DIBV5"),
            _ => None,
        };
        if let Some(name) = standard {
            return name.into();
        }
        let mut buf = [0u16; 128];
        // SAFETY: the buffer outlives the call and its length is passed with it.
        let len = unsafe { GetClipboardFormatNameW(format, &mut buf) };
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            format!("#{format}")
        }
    }

    /// File stem of the app behind the copy: the clipboard's owner, or whatever is in front if it has none.
    unsafe fn copying_app() -> Option<String> {
        // SAFETY: both calls return window handles that are only used to ask for their process id.
        unsafe {
            let window = GetClipboardOwner()
                .ok()
                .filter(|w| !w.is_invalid())
                .unwrap_or_else(|| GetForegroundWindow());
            if window.is_invalid() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(window, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            exe_stem(pid)
        }
    }

    unsafe fn exe_stem(pid: u32) -> Option<String> {
        // SAFETY: the process handle is closed on every path; the buffer outlives the query.
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 260];
            let mut len = buf.len() as u32;
            let path = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .ok()
            .map(|()| String::from_utf16_lossy(&buf[..len as usize]));
            let _ = CloseHandle(process);
            std::path::Path::new(&path?)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
        }
    }

    /// Puts text back on the clipboard, and remembers the copy as winbar's own.
    pub fn set_text(text: &str) -> Result<(), String> {
        let mut wide: Vec<u16> = text.encode_utf16().collect();
        wide.push(0);
        let bytes = unsafe {
            std::slice::from_raw_parts(wide.as_ptr().cast::<u8>(), std::mem::size_of_val(&wide[..]))
        };
        // SAFETY: `bytes` is a read-only view of `wide`, alive for the whole call.
        unsafe { put(CF_UNICODETEXT.0 as u32, bytes) }
    }

    /// Puts a picture back on the clipboard as a plain DIB.
    pub fn set_image(dib: &[u8]) -> Result<(), String> {
        // SAFETY: `dib` outlives the call.
        unsafe { put(CF_DIB.0 as u32, dib) }
    }

    unsafe fn put(format: u32, bytes: &[u8]) -> Result<(), String> {
        // SAFETY: the block is handed to the clipboard, which then owns it; it is only freed on failure paths
        // where the clipboard never took it.
        unsafe {
            let Some(_open) = open() else {
                return Err("clipboard is busy".into());
            };
            EmptyClipboard().map_err(|e| e.to_string())?;
            let global = GlobalAlloc(GMEM_MOVEABLE, bytes.len()).map_err(|e| e.to_string())?;
            let ptr = GlobalLock(global) as *mut u8;
            if ptr.is_null() {
                return Err("cannot lock clipboard memory".into());
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
            let _ = GlobalUnlock(global);
            SetClipboardData(format, Some(HANDLE(global.0))).map_err(|e| e.to_string())?;
            drop(_open);
            OWN_COPY.store(GetClipboardSequenceNumber(), Ordering::Relaxed);
            Ok(())
        }
    }
}

#[cfg(windows)]
pub use imp::{set_image, set_text, watch};

#[cfg(not(windows))]
pub fn watch<F: Fn(Capture) + Send + 'static>(_on_change: F) {}

#[cfg(not(windows))]
pub fn set_text(_text: &str) -> Result<(), String> {
    Err("the clipboard needs Windows".into())
}

#[cfg(not(windows))]
pub fn set_image(_dib: &[u8]) -> Result<(), String> {
    Err("the clipboard needs Windows".into())
}
