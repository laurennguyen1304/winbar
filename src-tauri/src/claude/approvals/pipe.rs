//! The named pipe between the hook relay and the running winbar (SPEC-claude-approvals §3).
//!
//! Named pipes share one machine-wide namespace, so anyone can create `\\.\pipe\winbar-claude-…` if they get there
//! first. Three things keep a tool call from reaching the wrong process:
//!
//! * the name carries the user's SID, so two accounts never meet on the same pipe by accident;
//! * the server's pipe is owned by that SID, admits that SID and nobody else, is closed to anything running below
//!   medium integrity, refuses remote clients, and refuses to start on top of a pipe somebody else already created
//!   under the name;
//! * the relay checks that the pipe it opened is **owned** by the same user before it writes a byte, and opens it
//!   at identification level so a stranger's server cannot act as the user either. The owner of a kernel object
//!   is something another account cannot forge. A process id is not: it names whoever created the pipe instance,
//!   that process may be long gone, and its number may by now belong to one of the user's own processes.
//!
//! Nothing here blocks without a limit: the server reads through `PeekNamedPipe` against a deadline, so a client
//! that connects and says nothing costs one thread for a moment, not forever, and an answer is written without
//! waiting for the client to pick it up.

use std::io::{self, Read, Write};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::time::{Duration, Instant};

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    CloseHandle, LocalFree, ERROR_NO_DATA, ERROR_PIPE_CONNECTED, ERROR_SUCCESS, HANDLE, HLOCAL,
};
use windows::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, GetSecurityInfo,
    SDDL_REVISION_1, SE_KERNEL_OBJECT,
};
use windows::Win32::Security::{
    GetTokenInformation, TokenUser, OWNER_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID,
    SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
};
use windows::Win32::Storage::FileSystem::{
    ReadFile, WriteFile, FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX,
};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, PeekNamedPipe, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

/// `ERROR_PIPE_BUSY`: every instance is serving someone else. The one error worth retrying.
const PIPE_BUSY: i32 = 231;
/// `SECURITY_IDENTIFICATION`: the server may learn who the client is, and may not act as them.
const IDENTIFICATION_ONLY: u32 = 0x0001_0000;
/// Kernel buffer for each direction. A larger message is simply read in several pieces.
const BUFFER: u32 = 64 * 1024;
/// How often a server thread looks again while a client has sent nothing yet.
const POLL: Duration = Duration::from_millis(2);

/// A handle that closes itself, so no error path can leak one.
struct Owned(HANDLE);

impl Drop for Owned {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            // SAFETY: the handle came from a Win32 call that returned ownership, and is closed exactly once.
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// The user SID behind a process handle, as `S-1-5-21-…`. `process` is borrowed, never closed.
fn token_sid(process: HANDLE) -> Option<String> {
    // SAFETY: every pointer handed to Win32 points at a live local; the buffer is sized by the first call and
    // only read as a TOKEN_USER after the second one filled it; the SID string is freed with LocalFree as the
    // API requires.
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(process, TOKEN_QUERY, &mut token).ok()?;
        let token = Owned(token);

        let mut needed = 0u32;
        let _ = GetTokenInformation(token.0, TokenUser, None, 0, &mut needed);
        if needed == 0 {
            return None;
        }
        // u64 storage keeps the buffer aligned for the TOKEN_USER read below.
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
        GetTokenInformation(
            token.0,
            TokenUser,
            Some(buffer.as_mut_ptr().cast()),
            needed,
            &mut needed,
        )
        .ok()?;

        let user = &*(buffer.as_ptr() as *const TOKEN_USER);
        sid_text(user.User.Sid)
    }
}

/// A SID as `S-1-5-21-…`.
///
/// # Safety
/// `sid` must point at a valid SID for the duration of the call.
unsafe fn sid_text(sid: PSID) -> Option<String> {
    let mut text = PWSTR::null();
    ConvertSidToStringSidW(sid, &mut text).ok()?;
    let out = text.to_string().ok();
    // The string was allocated by the API and is freed with LocalFree, as it requires.
    let _ = LocalFree(Some(HLOCAL(text.0.cast())));
    out
}

/// The SID that owns the kernel object behind `handle`.
fn owner_sid(handle: HANDLE) -> Option<String> {
    let mut owner = PSID::default();
    let mut descriptor = PSECURITY_DESCRIPTOR::default();
    // SAFETY: both out-pointers are live locals. `owner` points into `descriptor`, which is freed below only
    // after the SID has been copied out as text.
    unsafe {
        let status = GetSecurityInfo(
            handle,
            SE_KERNEL_OBJECT,
            OWNER_SECURITY_INFORMATION,
            Some(&mut owner),
            None,
            None,
            None,
            Some(&mut descriptor),
        );
        let sid = if status == ERROR_SUCCESS && !owner.0.is_null() {
            sid_text(owner)
        } else {
            None
        };
        if !descriptor.0.is_null() {
            let _ = LocalFree(Some(HLOCAL(descriptor.0)));
        }
        sid
    }
}

/// The SID of the account this process runs as.
pub fn current_sid() -> Option<String> {
    // SAFETY: GetCurrentProcess returns a pseudo-handle that needs no closing.
    token_sid(unsafe { GetCurrentProcess() })
}

/// `\\.\pipe\winbar-claude-<sid>`. `None` when the SID cannot be read: there is no safe name to fall back to.
pub fn pipe_name() -> Option<String> {
    current_sid().map(|sid| format!(r"\\.\pipe\winbar-claude-{sid}"))
}

/// A security descriptor that admits one SID and nobody else.
struct OnlyMe(PSECURITY_DESCRIPTOR);

impl OnlyMe {
    fn new(sid: &str) -> io::Result<OnlyMe> {
        // O:      owned by the user, stated outright — an elevated process would otherwise hand ownership to the
        //         Administrators group, and the owner is what the relay checks.
        // D:P     a protected DACL, so nothing is inherited; one entry granting everything to this SID.
        // S:(ML)  medium integrity, no write-up and no read-up: a sandboxed or low-integrity process of the same
        //         user cannot open the pipe at all, not even to sit on its connections.
        let sddl = wide(&format!("O:{sid}D:P(A;;GA;;;{sid})S:(ML;;NWNR;;;ME)"));
        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        // SAFETY: `sddl` is NUL-terminated and outlives the call; the descriptor is freed in Drop.
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                PCWSTR(sddl.as_ptr()),
                SDDL_REVISION_1,
                &mut descriptor,
                None,
            )
        }
        .map_err(io::Error::from)?;
        Ok(OnlyMe(descriptor))
    }
}

impl Drop for OnlyMe {
    fn drop(&mut self) {
        // SAFETY: allocated by ConvertStringSecurityDescriptorToSecurityDescriptorW, freed exactly once.
        unsafe {
            let _ = LocalFree(Some(HLOCAL(self.0 .0)));
        }
    }
}

/// The server end: one instance always waiting for the next client.
pub struct Listener {
    name: Vec<u16>,
    access: OnlyMe,
    waiting: Owned,
}

// SAFETY: the pipe handle and the descriptor are plain kernel objects with no thread affinity.
unsafe impl Send for Listener {}

impl Listener {
    /// Creates the pipe. Fails when the name is already taken, rather than serving on top of someone else's pipe.
    pub fn bind(name: &str) -> io::Result<Listener> {
        let sid = current_sid().ok_or_else(|| io::Error::other("no user SID"))?;
        let access = OnlyMe::new(&sid)?;
        let name = wide(name);
        let waiting = Self::instance(&name, &access, true)?;
        Ok(Listener {
            name,
            access,
            waiting,
        })
    }

    fn instance(name: &[u16], access: &OnlyMe, first: bool) -> io::Result<Owned> {
        let attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: access.0 .0,
            bInheritHandle: false.into(),
        };
        let mut open = PIPE_ACCESS_DUPLEX;
        if first {
            open |= FILE_FLAG_FIRST_PIPE_INSTANCE;
        }
        // SAFETY: `name` is NUL-terminated and `attributes` lives across the call.
        let handle = unsafe {
            CreateNamedPipeW(
                PCWSTR(name.as_ptr()),
                open,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_UNLIMITED_INSTANCES,
                BUFFER,
                BUFFER,
                0,
                Some(&attributes),
            )
        };
        if handle.is_invalid() {
            return Err(io::Error::last_os_error());
        }
        Ok(Owned(handle))
    }

    /// Blocks until a client connects, and puts a fresh instance in its place for the next one.
    pub fn accept(&mut self) -> io::Result<Connection> {
        // SAFETY: the handle is a pipe instance this listener owns.
        if let Err(err) = unsafe { ConnectNamedPipe(self.waiting.0, None) } {
            // A client that connected between CreateNamedPipe and here is connected all the same — and so is one
            // that has already written its line and left (ERROR_NO_DATA): what it wrote is still in the pipe.
            let code = err.code();
            if code != ERROR_PIPE_CONNECTED.to_hresult() && code != ERROR_NO_DATA.to_hresult() {
                return Err(io::Error::from(err));
            }
        }
        let fresh = Self::instance(&self.name, &self.access, false)?;
        Ok(Connection {
            handle: std::mem::replace(&mut self.waiting, fresh),
        })
    }
}

/// One client, server side.
pub struct Connection {
    handle: Owned,
}

// SAFETY: a pipe handle may be used from any thread; each connection is owned by exactly one.
unsafe impl Send for Connection {}

// No `DisconnectNamedPipe` on the way out, on purpose: disconnecting throws away whatever the client has not read
// yet, which would be the answer. Closing the handle leaves those bytes for the client to collect.

impl Connection {
    /// Bytes waiting to be read, without blocking. An error means the client has gone.
    fn available(&self) -> io::Result<u32> {
        let mut available = 0u32;
        // SAFETY: only the "total bytes available" out-pointer is used, and it points at a live local.
        unsafe { PeekNamedPipe(self.handle.0, None, 0, None, Some(&mut available), None) }
            .map_err(io::Error::from)?;
        Ok(available)
    }

    /// Reads up to and without the first newline. `None` when the client says nothing before `deadline`, sends
    /// more than `max` bytes, or leaves without finishing a line.
    pub fn read_line(&self, deadline: Duration, max: usize) -> Option<Vec<u8>> {
        let until = Instant::now() + deadline;
        let mut line = Vec::new();
        loop {
            match self.available() {
                Ok(0) => {
                    if Instant::now() >= until {
                        return None;
                    }
                    std::thread::sleep(POLL);
                }
                Ok(available) => {
                    let mut chunk = vec![0u8; available.min(BUFFER) as usize];
                    let mut read = 0u32;
                    // SAFETY: `chunk` is a live buffer of the length passed, and the data is already there, so
                    // this read returns at once.
                    unsafe { ReadFile(self.handle.0, Some(&mut chunk), Some(&mut read), None) }
                        .ok()?;
                    line.extend_from_slice(&chunk[..read as usize]);
                    if let Some(end) = line.iter().position(|b| *b == b'\n') {
                        line.truncate(end);
                        return Some(line);
                    }
                    if line.len() > max {
                        return None;
                    }
                }
                Err(_) => return None,
            }
        }
    }

    /// Whether the client closed its end. A relay that Claude Code stopped shows up here.
    pub fn client_gone(&self) -> bool {
        self.available().is_err()
    }

    /// Writes the answer. It goes into the pipe's buffer and stays there for the client after this end closes;
    /// nothing here waits for the client, so a relay that has been suspended cannot hold a thread.
    pub fn reply(&self, bytes: &[u8]) -> bool {
        debug_assert!(bytes.len() < BUFFER as usize, "an answer is one word");
        let mut written = 0u32;
        // SAFETY: `bytes` is a live slice; the handle is this connection's own.
        unsafe {
            WriteFile(self.handle.0, Some(bytes), Some(&mut written), None).is_ok()
                && written as usize == bytes.len()
        }
    }
}

/// The relay's end of the pipe.
pub struct Client(std::fs::File);

/// Whether the pipe behind `file` was created by the same user as this process.
///
/// Judged by who owns the pipe object, which another account cannot set to someone else's SID. A failure to find
/// out counts as "no": refusing a pipe that cannot be vouched for costs one hook event, while trusting it could
/// hand another account the contents of a tool call — and let it answer `allow`.
fn server_is_me(file: &std::fs::File) -> bool {
    match (current_sid(), owner_sid(HANDLE(file.as_raw_handle()))) {
        (Some(mine), Some(owner)) => mine == owner,
        _ => false,
    }
}

/// Opens the pipe. Retries only while the server is busy: any other error means there is nobody to talk to, and
/// waiting would only hold Claude Code up.
pub fn connect(name: &str, timeout: Duration) -> Option<Client> {
    let until = Instant::now() + timeout;
    loop {
        match std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .security_qos_flags(IDENTIFICATION_ONLY)
            .open(name)
        {
            Ok(file) => return server_is_me(&file).then_some(Client(file)),
            Err(err) if err.raw_os_error() == Some(PIPE_BUSY) && Instant::now() < until => {
                std::thread::sleep(Duration::from_millis(15));
            }
            Err(_) => return None,
        }
    }
}

impl Client {
    pub fn send(&mut self, line: &[u8]) -> bool {
        self.0.write_all(line).is_ok()
    }

    /// Blocks until the server answers with one short line, or closes the pipe without one.
    pub fn read_answer(&mut self) -> Option<String> {
        let mut answer = Vec::new();
        let mut chunk = [0u8; 64];
        // An answer is one word; anything longer is not from winbar.
        while answer.len() < 64 {
            match self.0.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    answer.extend_from_slice(&chunk[..n]);
                    if answer.contains(&b'\n') {
                        break;
                    }
                }
            }
        }
        let text = String::from_utf8_lossy(&answer).trim().to_string();
        (!text.is_empty()).then_some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A pipe name no other test and no running winbar uses.
    fn test_name(tag: &str) -> String {
        format!(
            r"\\.\pipe\winbar-test-{}-{tag}-{}",
            std::process::id(),
            current_sid().expect("the test process has a SID")
        )
    }

    const SOON: Duration = Duration::from_secs(2);

    #[test]
    fn the_pipe_name_carries_this_users_sid() {
        let sid = current_sid().expect("a SID");
        assert!(sid.starts_with("S-1-"), "{sid}");
        assert_eq!(
            pipe_name().expect("a name"),
            format!(r"\\.\pipe\winbar-claude-{sid}")
        );
    }

    #[test]
    fn nobody_listening_is_found_out_at_once() {
        let started = Instant::now();
        assert!(connect(&test_name("nobody"), Duration::from_millis(300)).is_none());
        assert!(
            started.elapsed() < Duration::from_millis(200),
            "a closed winbar must not cost Claude Code the connect timeout: {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn a_line_goes_in_and_an_answer_comes_back() {
        let name = test_name("roundtrip");
        let mut listener = Listener::bind(&name).expect("binds");
        let server = std::thread::spawn(move || {
            let connection = listener.accept().expect("accepts");
            let line = connection.read_line(SOON, 1024).expect("reads the line");
            assert!(!connection.client_gone());
            assert!(connection.reply(b"allow\n"));
            line
        });
        let mut client = connect(&name, SOON).expect("connects to a server run by the same user");
        assert!(client.send(b"{\"hello\":1}\n"));
        assert_eq!(client.read_answer().as_deref(), Some("allow"));
        assert_eq!(server.join().expect("server thread"), b"{\"hello\":1}");
    }

    #[test]
    fn an_answer_outlives_the_server_end_that_wrote_it() {
        // The server writes and closes at once, without waiting for the relay. The relay, reading later, must
        // still find the answer: this is what dropping the flush and the disconnect relies on.
        let name = test_name("outlives");
        let mut listener = Listener::bind(&name).expect("binds");
        let mut client = connect(&name, SOON).expect("connects");
        assert!(client.send(b"ask\n"));
        {
            let connection = listener.accept().expect("accepts");
            assert!(connection.read_line(SOON, 64).is_some());
            assert!(connection.reply(b"deny\n"));
        }
        std::thread::sleep(Duration::from_millis(50));
        assert_eq!(client.read_answer().as_deref(), Some("deny"));
    }

    #[test]
    fn the_pipe_is_owned_by_this_user_and_that_is_what_the_relay_checks() {
        let name = test_name("owner");
        let _listener = Listener::bind(&name).expect("binds");
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .security_qos_flags(IDENTIFICATION_ONLY)
            .open(&name)
            .expect("opens");
        assert_eq!(
            owner_sid(HANDLE(file.as_raw_handle())),
            current_sid(),
            "the relay must be able to read the owner off its end of the pipe"
        );
        assert!(server_is_me(&file));
    }

    #[test]
    fn a_handle_whose_owner_cannot_be_read_is_not_trusted() {
        // An ordinary file opened without the right to read its security: stands in for "could not find out".
        let path = std::env::temp_dir().join(format!("winbar-owner-{}.txt", std::process::id()));
        std::fs::write(&path, b"x").expect("writes");
        let file = std::fs::OpenOptions::new()
            .access_mode(0x0002) // FILE_WRITE_DATA only: no READ_CONTROL
            .open(&path)
            .expect("opens");
        assert_eq!(owner_sid(HANDLE(file.as_raw_handle())), None);
        assert!(!server_is_me(&file));
        drop(file);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_message_sent_by_a_client_that_already_left_is_still_read() {
        // The four fire-and-forget events: the relay writes and exits without waiting for anything.
        let name = test_name("left");
        let mut listener = Listener::bind(&name).expect("binds");
        {
            let mut client = connect(&name, SOON).expect("connects");
            assert!(client.send(b"gone before you looked\n"));
        }
        let connection = listener.accept().expect("accepts");
        assert_eq!(
            connection
                .read_line(SOON, 1024)
                .expect("the bytes are still in the pipe"),
            b"gone before you looked"
        );
        assert!(connection.client_gone());
    }

    #[test]
    fn a_larger_message_arrives_whole() {
        let name = test_name("large");
        let mut listener = Listener::bind(&name).expect("binds");
        let body = vec![b'x'; 200 * 1024];
        let expected = body.clone();
        let server = std::thread::spawn(move || {
            let connection = listener.accept().expect("accepts");
            connection.read_line(SOON, 256 * 1024)
        });
        let mut client = connect(&name, SOON).expect("connects");
        let mut line = body;
        line.push(b'\n');
        assert!(client.send(&line));
        assert_eq!(
            server.join().expect("server thread").expect("read"),
            expected
        );
    }

    #[test]
    fn a_client_that_says_nothing_or_too_much_is_dropped() {
        let name = test_name("silent");
        let mut listener = Listener::bind(&name).expect("binds");
        let server = std::thread::spawn(move || {
            let quiet = listener.accept().expect("accepts");
            let started = Instant::now();
            let nothing = quiet.read_line(Duration::from_millis(150), 1024);
            let waited = started.elapsed();
            drop(quiet);
            let loud = listener.accept().expect("accepts");
            (nothing, waited, loud.read_line(SOON, 16))
        });
        let quiet = connect(&name, SOON).expect("connects");
        // Hold the first connection open until the server has given up on it.
        std::thread::sleep(Duration::from_millis(300));
        drop(quiet);
        let mut loud = connect(&name, SOON).expect("connects");
        // No newline within the limit: the server must stop reading rather than buffer without end.
        let _ = loud.send(&[b'y'; 64]);
        let (nothing, waited, too_much) = server.join().expect("server thread");
        assert!(nothing.is_none());
        assert!(waited < Duration::from_secs(1), "{waited:?}");
        assert!(too_much.is_none());
    }

    #[test]
    fn a_client_that_leaves_while_waiting_is_noticed_and_gets_no_answer() {
        let name = test_name("leaves");
        let mut listener = Listener::bind(&name).expect("binds");
        let mut client = connect(&name, SOON).expect("connects");
        assert!(client.send(b"ask\n"));
        let connection = listener.accept().expect("accepts");
        assert!(connection.read_line(SOON, 64).is_some());
        assert!(!connection.client_gone());
        drop(client);
        assert!(connection.client_gone());
        assert!(!connection.reply(b"allow\n"));
    }

    #[test]
    fn a_server_that_closes_without_a_word_reads_as_no_answer() {
        let name = test_name("closes");
        let mut listener = Listener::bind(&name).expect("binds");
        let server = std::thread::spawn(move || {
            let connection = listener.accept().expect("accepts");
            let _ = connection.read_line(SOON, 64);
        });
        let mut client = connect(&name, SOON).expect("connects");
        assert!(client.send(b"ask\n"));
        assert_eq!(client.read_answer(), None);
        server.join().expect("server thread");
    }

    #[test]
    fn a_second_winbar_cannot_serve_the_same_name() {
        let name = test_name("twice");
        let _first = Listener::bind(&name).expect("binds");
        assert!(
            Listener::bind(&name).is_err(),
            "the name is taken: refuse, do not join"
        );
    }
}
