//! Windows side of the clipboard watcher: a message-only window that receives `WM_CLIPBOARDUPDATE`.
//!
//! Two threads, on purpose. The window thread only notes that something changed; a reader thread waits a moment and
//! then opens the clipboard. Opening it inside the message handler makes the app that is copying fail — Windows lets
//! one process hold the clipboard at a time, and apps copying in a burst do not retry. The pause also collapses a
//! burst into one read.
//!
//! Everything here reads the *shape* of the clipboard. The one place that touches real bytes is [`imp::text_len`],
//! which only measures them.

#[cfg(windows)]
mod imp {
    use crate::clipboard::{is_private, kind_for, Sighting};
    use std::sync::{Condvar, Mutex};
    use std::time::Duration;
    use windows::core::{w, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HGLOBAL, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::DataExchange::{
        AddClipboardFormatListener, CloseClipboard, EnumClipboardFormats, GetClipboardData,
        GetClipboardFormatNameW, GetClipboardOwner, GetClipboardSequenceNumber, OpenClipboard,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Memory::GlobalSize;
    use windows::Win32::System::Ole::{
        CF_BITMAP, CF_DIB, CF_DIBV5, CF_HDROP, CF_LOCALE, CF_OEMTEXT, CF_TEXT, CF_UNICODETEXT,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetWindowThreadProcessId,
        RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE,
        WM_CLIPBOARDUPDATE, WNDCLASSW,
    };

    type Handler = Box<dyn Fn(Sighting) + Send>;

    /// One watcher per process, so the window procedure can reach it without capturing.
    static HANDLER: Mutex<Option<Handler>> = Mutex::new(None);

    /// Raised by the window thread, lowered by the reader thread.
    static CHANGED: Mutex<bool> = Mutex::new(false);
    static WAKE: Condvar = Condvar::new();

    /// How long to leave the clipboard to the app that is copying before reading it.
    const SETTLE: Duration = Duration::from_millis(60);

    /// Formats whose DWORD value decides whether the copy may be kept.
    const DWORD_FLAGS: [&str; 2] = ["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard"];

    pub fn watch<F: Fn(Sighting) + Send + 'static>(on_change: F) {
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

    /// Waits for changes, lets them settle, then reports one sighting per distinct clipboard state.
    fn read_loop() {
        let mut last_seq = 0u32;
        loop {
            {
                let mut changed = flag();
                while !*changed {
                    changed = WAKE
                        .wait(changed)
                        .unwrap_or_else(|e| e.into_inner());
                }
            }
            std::thread::sleep(SETTLE);
            // Anything that arrived during the pause belongs to this read.
            *flag() = false;

            // SAFETY: plain clipboard reads on this thread; every open is closed inside `read`.
            let sighting = unsafe {
                let seq = GetClipboardSequenceNumber();
                if seq == last_seq {
                    continue;
                }
                last_seq = seq;
                read()
            };
            if let Ok(handler) = HANDLER.lock() {
                if let Some(handler) = handler.as_ref() {
                    handler(sighting);
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

    /// Reads what is on the clipboard now, without keeping any of it.
    unsafe fn read() -> Sighting {
        // SAFETY: the clipboard is opened and closed on this thread, and every handle stays owned by its source.
        unsafe {
            let mut out = Sighting {
                seq: GetClipboardSequenceNumber(),
                owner: owner_exe(),
                ..Default::default()
            };
            // The app that copied may still hold the clipboard, or another listener may be reading it.
            let mut opened = false;
            for _ in 0..10 {
                if OpenClipboard(None).is_ok() {
                    opened = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            if !opened {
                out.formats.push("<locked>".into());
                return out;
            }

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
                out.formats.push(name);
            }

            out.kind = kind_for(&out.formats);
            out.private = is_private(&out.formats, &zero_valued);
            out.size = match out.kind {
                crate::clipboard::Kind::Text => text_len(),
                crate::clipboard::Kind::Image => byte_len(CF_DIBV5.0 as u32)
                    .or_else(|| byte_len(CF_DIB.0 as u32))
                    .unwrap_or(0),
                _ => byte_len(CF_HDROP.0 as u32).unwrap_or(0),
            };
            let _ = CloseClipboard();
            out
        }
    }

    /// Number of characters of the text on the clipboard (the trailing NUL does not count).
    unsafe fn text_len() -> usize {
        // SAFETY: the clipboard is open; the handle belongs to its source and is only measured.
        unsafe { byte_len(CF_UNICODETEXT.0 as u32).map_or(0, |b| b.saturating_sub(2) / 2) }
    }

    /// Size in bytes of one format's data, or `None` when it is not on offer.
    unsafe fn byte_len(format: u32) -> Option<usize> {
        // SAFETY: as above. GlobalSize does not lock or copy the data.
        unsafe {
            let handle = GetClipboardData(format).ok()?;
            let size = GlobalSize(HGLOBAL(handle.0));
            (size > 0).then_some(size)
        }
    }

    /// Value of a DWORD-shaped format such as `CanIncludeInClipboardHistory`.
    unsafe fn dword(format: u32) -> Option<u32> {
        // SAFETY: as above; the four bytes are read through a raw pointer that stays valid while the clipboard is open.
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

    /// File stem of the app that owns the clipboard, e.g. `chrome`.
    unsafe fn owner_exe() -> Option<String> {
        // SAFETY: the process handle is closed on every path; the buffer outlives the query.
        unsafe {
            let owner = GetClipboardOwner().ok()?;
            let mut pid = 0u32;
            GetWindowThreadProcessId(owner, Some(&mut pid));
            if pid == 0 {
                return None;
            }
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
            let path = path?;
            std::path::Path::new(&path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
        }
    }
}

#[cfg(windows)]
pub use imp::watch;

#[cfg(not(windows))]
pub fn watch<F: Fn(super::Sighting) + Send + 'static>(_on_change: F) {}
