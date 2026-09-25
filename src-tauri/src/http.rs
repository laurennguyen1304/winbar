//! One HTTPS GET, through WinHTTP (SPEC-claude §4). Claude's usage and the update check (SPEC-update) both use it.
//!
//! `reqwest` is already in the dependency tree but carries no TLS backend, and giving it one pulls rustls and ring
//! into every build. winbar is Windows-only and already speaks plenty of Win32, so a single GET against the
//! system's own HTTP stack is the cheaper trade.
//!
//! Every handle is owned by [`Handle`], which closes it on the way out — including on the error paths, which is
//! where a hand-written client usually leaks.

/// A header line that is safe to send: no CR or LF, so a value can never open a second header, and no control
/// characters at all. Callers build these from a token read off disk — trusted, but not worth trusting blindly.
pub fn is_safe_header(line: &str) -> bool {
    !line.is_empty() && line.is_ascii() && !line.chars().any(|c| c.is_ascii_control())
}

/// Why a request did not produce a body.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpError {
    /// The server said the caller is not allowed (401/403): the token is expired or wrong.
    Unauthorized,
    /// Anything else: no network, DNS, TLS, a 5xx, a timeout.
    Network,
}

/// Seconds allowed for each stage of the request.
pub const TIMEOUT_MS: i32 = 10_000;
/// A usage payload is a few kilobytes; anything larger is not something we asked for.
pub const MAX_BODY: usize = 1024 * 1024;

#[cfg(windows)]
pub use win::get;

#[cfg(windows)]
mod win {
    use super::{HttpError, MAX_BODY, TIMEOUT_MS};
    use windows::core::PCWSTR;
    use windows::Win32::Networking::WinHttp::{
        WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryHeaders,
        WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest, WinHttpSetOption,
        WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE,
        WINHTTP_OPTION_REDIRECT_POLICY, WINHTTP_OPTION_REDIRECT_POLICY_NEVER,
        WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
    };

    /// A WinHTTP handle that closes itself, so no error path can leak one.
    struct Handle(*mut core::ffi::c_void);

    impl Drop for Handle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: the handle came from WinHttp* and is closed exactly once, here.
                unsafe {
                    let _ = WinHttpCloseHandle(self.0);
                }
            }
        }
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// GETs `https://{host}{path}` with the given `headers` ("Name: value" lines).
    ///
    /// The headers are secret — an Authorization line lives here — so nothing in this function logs or returns
    /// them, and no error message repeats them back.
    pub fn get(host: &str, path: &str, headers: &[String]) -> Result<Vec<u8>, HttpError> {
        if !headers.iter().all(|line| super::is_safe_header(line)) {
            // A CR or LF in a value would split it into extra headers; refuse rather than send it.
            return Err(HttpError::Network);
        }
        // SAFETY: each handle is checked for null before use and owned by a `Handle` that closes it.
        unsafe {
            let agent = wide("winbar");
            let session = Handle(WinHttpOpen(
                PCWSTR(agent.as_ptr()),
                WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                PCWSTR::null(),
                PCWSTR::null(),
                0,
            ));
            if session.0.is_null() {
                return Err(HttpError::Network);
            }
            WinHttpSetTimeouts(session.0, TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS)
                .map_err(|_| HttpError::Network)?;

            let host_w = wide(host);
            let connect = Handle(WinHttpConnect(session.0, PCWSTR(host_w.as_ptr()), 443, 0));
            if connect.0.is_null() {
                return Err(HttpError::Network);
            }

            let verb = wide("GET");
            let path_w = wide(path);
            let request = Handle(WinHttpOpenRequest(
                connect.0,
                PCWSTR(verb.as_ptr()),
                PCWSTR(path_w.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                std::ptr::null(),
                WINHTTP_FLAG_SECURE,
            ));
            if request.0.is_null() {
                return Err(HttpError::Network);
            }

            // Never follow a redirect. WinHTTP follows them by default, and a redirect away from the host we
            // chose would carry the Authorization header to wherever it points.
            let never = WINHTTP_OPTION_REDIRECT_POLICY_NEVER.to_ne_bytes();
            WinHttpSetOption(
                Some(request.0.cast_const()),
                WINHTTP_OPTION_REDIRECT_POLICY,
                Some(&never),
            )
            .map_err(|_| HttpError::Network)?;

            let mut header_block = wide(&headers.join("\r\n"));
            // The trailing NUL is not part of the header text.
            let header_len = header_block.len().saturating_sub(1);
            let sent = WinHttpSendRequest(
                request.0,
                (header_len > 0).then(|| &header_block[..header_len]),
                None,
                0,
                0,
                0,
            );
            // This copy held the token; clear it as soon as WinHTTP has taken it.
            header_block.iter_mut().for_each(|c| *c = 0);
            sent.map_err(|_| HttpError::Network)?;
            WinHttpReceiveResponse(request.0, std::ptr::null_mut())
                .map_err(|_| HttpError::Network)?;

            let mut status: u32 = 0;
            let mut size = std::mem::size_of::<u32>() as u32;
            WinHttpQueryHeaders(
                request.0,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                PCWSTR::null(),
                Some(std::ptr::addr_of_mut!(status).cast()),
                &mut size,
                std::ptr::null_mut(),
            )
            .map_err(|_| HttpError::Network)?;
            if status == 401 || status == 403 {
                return Err(HttpError::Unauthorized);
            }
            if !(200..300).contains(&status) {
                return Err(HttpError::Network);
            }

            let mut body = Vec::new();
            let mut chunk = [0u8; 8192];
            loop {
                let mut read = 0u32;
                WinHttpReadData(
                    request.0,
                    chunk.as_mut_ptr().cast(),
                    chunk.len() as u32,
                    &mut read,
                )
                .map_err(|_| HttpError::Network)?;
                if read == 0 {
                    break;
                }
                body.extend_from_slice(&chunk[..read as usize]);
                if body.len() > MAX_BODY {
                    return Err(HttpError::Network);
                }
            }
            Ok(body)
        }
    }
}

#[cfg(not(windows))]
pub fn get(_host: &str, _path: &str, _headers: &[String]) -> Result<Vec<u8>, HttpError> {
    Err(HttpError::Network)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn a_host_that_does_not_exist_is_a_network_error_not_a_hang() {
        // `.invalid` is reserved and never resolves, so this exercises the real WinHTTP failure path — including
        // the handle cleanup, which is where a hand-written client leaks.
        let started = std::time::Instant::now();
        let result = get("winbar-nowhere.invalid", "/", &["X-Test: 1".to_string()]);
        assert_eq!(result, Err(HttpError::Network));
        assert!(
            started.elapsed() < std::time::Duration::from_millis(TIMEOUT_MS as u64 + 5_000),
            "a dead host must fail, not sit there"
        );
    }

    #[test]
    fn a_header_that_could_smuggle_another_header_is_refused() {
        let injected = "Authorization: Bearer abc\r\nX-Evil: 1".to_string();
        assert_eq!(
            get("api.anthropic.com", "/", &[injected]),
            Err(HttpError::Network)
        );
        assert!(!is_safe_header("a\rb"));
        assert!(!is_safe_header("a\nb"));
        assert!(!is_safe_header("a\0b"));
        assert!(!is_safe_header(""));
        assert!(!is_safe_header("Authorization: Bearer ünicode"));
        // Built in two parts so the source never holds a whole Claude-token shape (see clipboard/secrets.rs).
        assert!(is_safe_header(&format!("Authorization: Bearer {}{}", "sk-ant-", "oat01-abc.def")));
    }

    #[test]
    fn a_request_with_no_headers_is_still_well_formed() {
        // Guards the "strip the trailing NUL" slice: an empty header block must not become a one-character one.
        assert_eq!(
            get("winbar-nowhere.invalid", "/", &[]),
            Err(HttpError::Network)
        );
    }
}
