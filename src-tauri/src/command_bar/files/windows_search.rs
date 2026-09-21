//! File search through the Windows Search index (SPEC-command-bar §5.4). The SQL is built only by
//! [`build_sql`], which escapes everything the user typed; the OLE DB plumbing lives in [`query`].

/// Folder words whose contents are noise in a file launcher (build output, package caches, app data).
/// Matched with full-text `CONTAINS` on the folder path: `NOT LIKE` on the path made queries 3-5x slower
/// (330-630 ms vs 70-200 ms on the development machine). A folder whose name contains one of these words is
/// left out too, which is accepted. `.git` is not listed: its word "git" would hide ordinary folders named git,
/// and hidden folders are not indexed by default.
const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "AppData",
    ".cargo",
    ".rustup",
    ".venv",
    "__pycache__",
];
const MAX_TERMS: usize = 6;
const MAX_TERM_CHARS: usize = 64;

/// Escapes text for a single-quoted `LIKE` pattern: `'` doubles, and the wildcards `%`, `_`, `[` become literals.
pub fn escape_like(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '\'' => out.push_str("''"),
            '%' => out.push_str("[%]"),
            '_' => out.push_str("[_]"),
            '[' => out.push_str("[[]"),
            _ => out.push(c),
        }
    }
    out
}

/// `LIKE` pattern for one word. As in yasb Quick Launch, `*` and `?` are wildcards (any text / one character) and
/// then the word must match the whole name; without them the word may appear anywhere in the name.
pub fn like_pattern(term: &str) -> String {
    let escaped = escape_like(term);
    if term.contains(['*', '?']) {
        escaped.replace('*', "%").replace('?', "_")
    } else {
        format!("%{escaped}%")
    }
}

/// Every whitespace-separated word must appear in the file name. Control characters are dropped.
pub fn terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(|t| {
            t.chars()
                .filter(|c| !c.is_control())
                .take(MAX_TERM_CHARS)
                .collect::<String>()
        })
        .filter(|t| !t.is_empty())
        .take(MAX_TERMS)
        .collect()
}

/// `None` when there is nothing to search for.
pub fn build_sql(query: &str, scope: &str, limit: u32) -> Option<String> {
    let terms = terms(query);
    if terms.is_empty() {
        return None;
    }
    // SCOPE is a plain string, not a LIKE pattern: only quotes need escaping.
    let scope = scope.replace('\\', "/").replace('\'', "''");
    let mut sql = format!(
        "SELECT TOP {limit} System.ItemPathDisplay, System.ItemType FROM SystemIndex WHERE SCOPE='file:{scope}'"
    );
    for term in &terms {
        sql.push_str(&format!(
            " AND System.FileName LIKE '{}'",
            like_pattern(term)
        ));
    }
    for dir in EXCLUDED_DIRS {
        sql.push_str(&format!(
            " AND NOT CONTAINS(System.ItemFolderPathDisplay, '\"{dir}\"')"
        ));
    }
    sql.push_str(" ORDER BY System.DateModified DESC");
    Some(sql)
}

#[cfg(windows)]
pub use imp::query;

#[cfg(windows)]
mod imp {
    use windows::core::{w, Interface, GUID, HSTRING};
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Search::*;

    const DBGUID_DEFAULT: GUID = GUID::from_u128(0xc8b521fb_5cf3_11ce_ade5_00aa0044773d);
    const CLSID_MSDAINITIALIZE: GUID = GUID::from_u128(0x2206cdb0_19c1_11d1_89e0_00c04fd7a829);
    const CHARS: usize = 1024;

    /// Columns bound as client-owned wide strings.
    #[repr(C)]
    struct Row {
        path_len: usize,
        path_status: u32,
        path: [u16; CHARS],
        type_len: usize,
        type_status: u32,
        kind: [u16; CHARS],
    }

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    fn binding(ordinal: usize, value: usize, length: usize, status: usize) -> DBBINDING {
        DBBINDING {
            iOrdinal: ordinal,
            obValue: value,
            obLength: length,
            obStatus: status,
            dwPart: (DBPART_VALUE.0 | DBPART_LENGTH.0 | DBPART_STATUS.0) as u32,
            dwMemOwner: DBMEMOWNER_CLIENTOWNED.0 as u32,
            eParamIO: DBPARAMIO_NOTPARAM.0 as u32,
            cbMaxLen: CHARS * 2,
            wType: DBTYPE_WSTR.0 as u16,
            ..Default::default()
        }
    }

    fn text(buf: &[u16; CHARS], len: usize) -> String {
        String::from_utf16_lossy(&buf[..(len / 2).min(CHARS)])
    }

    /// Runs `sql` against the index on the calling thread; returns (path, item type) pairs. Blocking.
    pub fn query(sql: &str) -> windows::core::Result<Vec<(String, String)>> {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            // A thread already in another apartment can still use these in-process objects.
            let _com = if hr.is_ok() {
                Some(ComGuard)
            } else if hr == RPC_E_CHANGED_MODE {
                None
            } else {
                return Err(hr.into());
            };
            let init: IDataInitialize =
                CoCreateInstance(&CLSID_MSDAINITIALIZE, None, CLSCTX_INPROC_SERVER)?;
            let mut source = None;
            init.GetDataSource(
                None,
                CLSCTX_INPROC_SERVER.0,
                w!("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';"),
                &IDBInitialize::IID,
                &mut source,
            )?;
            let db: IDBInitialize = source.ok_or_else(windows::core::Error::empty)?.cast()?;
            db.Initialize()?;
            let session: IDBCreateCommand = db
                .cast::<IDBCreateSession>()?
                .CreateSession(None, &IDBCreateCommand::IID)?
                .cast()?;
            let command: ICommandText = session.CreateCommand(None, &ICommandText::IID)?.cast()?;
            command.SetCommandText(&DBGUID_DEFAULT, &HSTRING::from(sql))?;
            let mut unknown = None;
            command.Execute(None, &IRowset::IID, None, None, Some(&mut unknown))?;
            let rowset: IRowset = unknown.ok_or_else(windows::core::Error::empty)?.cast()?;
            let accessor: IAccessor = rowset.cast()?;
            let bindings = [
                binding(
                    1,
                    std::mem::offset_of!(Row, path),
                    std::mem::offset_of!(Row, path_len),
                    std::mem::offset_of!(Row, path_status),
                ),
                binding(
                    2,
                    std::mem::offset_of!(Row, kind),
                    std::mem::offset_of!(Row, type_len),
                    std::mem::offset_of!(Row, type_status),
                ),
            ];
            let mut handle = HACCESSOR::default();
            accessor.CreateAccessor(
                DBACCESSOR_ROWDATA.0 as u32,
                bindings.len(),
                bindings.as_ptr(),
                0,
                &mut handle,
                None,
            )?;

            let mut out = Vec::new();
            let mut row = Box::new(Row {
                path_len: 0,
                path_status: 0,
                path: [0; CHARS],
                type_len: 0,
                type_status: 0,
                kind: [0; CHARS],
            });
            loop {
                let mut hrows = [0usize; 32];
                let mut hrows_ptr = hrows.as_mut_ptr();
                let mut fetched = 0usize;
                // The generated `GetNextRows` wrapper passes the row-handle array wrongly; call the vtable directly.
                let hr = (Interface::vtable(&rowset).GetNextRows)(
                    Interface::as_raw(&rowset),
                    0,
                    0,
                    hrows.len() as isize,
                    &mut fetched,
                    &mut hrows_ptr as *mut _ as _,
                );
                if hr.is_err() || fetched == 0 {
                    break;
                }
                for h in &hrows[..fetched] {
                    row.path_len = 0;
                    row.type_len = 0;
                    if rowset
                        .GetData(*h, handle, &mut *row as *mut Row as _)
                        .is_ok()
                    {
                        out.push((text(&row.path, row.path_len), text(&row.kind, row.type_len)));
                    }
                }
                let _ = rowset.ReleaseRows(
                    fetched,
                    hrows.as_ptr(),
                    std::ptr::null(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
            }
            let _ = accessor.ReleaseAccessor(handle, None);
            Ok(out)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_quotes_and_like_wildcards() {
        assert_eq!(escape_like("it's"), "it''s");
        assert_eq!(escape_like("100%_[x]"), "100[%][_][[]x]");
        assert_eq!(escape_like("tiếng việt"), "tiếng việt");
    }

    #[test]
    fn star_and_question_mark_are_wildcards_over_the_whole_name() {
        assert_eq!(like_pattern("brief"), "%brief%");
        assert_eq!(like_pattern("*.pdf"), "%.pdf");
        assert_eq!(like_pattern("invoice-2026-0?.pdf"), "invoice-2026-0_.pdf");
        assert_eq!(like_pattern("50%*"), "50[%]%");
        let sql = build_sql("brief *.md", r"C:\Users\x", 20).unwrap();
        assert!(
            sql.contains("System.FileName LIKE '%brief%' AND System.FileName LIKE '%.md'"),
            "{sql}"
        );
    }

    #[test]
    fn user_text_cannot_break_out_of_the_string() {
        let sql = build_sql("x' OR 1=1 --", "C:\\Users\\me", 20).unwrap();
        assert!(sql.contains("LIKE '%x''%'"), "{sql}");
        assert!(sql.contains("LIKE '%OR%'"));
        // Every quote in the statement is balanced.
        assert_eq!(sql.matches('\'').count() % 2, 0, "{sql}");
    }

    #[test]
    fn every_word_must_match_and_noise_folders_are_excluded() {
        let sql = build_sql("  brief   acme ", "C:\\Users\\me", 20).unwrap();
        assert!(sql.starts_with("SELECT TOP 20 System.ItemPathDisplay, System.ItemType FROM SystemIndex WHERE SCOPE='file:C:/Users/me'"));
        assert!(sql.contains("System.FileName LIKE '%brief%' AND System.FileName LIKE '%acme%'"));
        assert!(sql.contains(" AND NOT CONTAINS(System.ItemFolderPathDisplay, '\"node_modules\"')"));
        assert!(
            !sql.contains("NOT LIKE"),
            "path LIKE exclusions are too slow: {sql}"
        );
        assert!(sql.ends_with("ORDER BY System.DateModified DESC"));
    }

    #[test]
    fn scope_quotes_are_escaped_too() {
        let sql = build_sql("a", "C:\\Users\\O'Brien_[1]", 5).unwrap();
        assert!(sql.contains("SCOPE='file:C:/Users/O''Brien_[1]'"), "{sql}");
    }

    #[test]
    fn nothing_to_search_gives_no_sql() {
        assert_eq!(build_sql("   ", "C:\\Users\\x", 20), None);
        assert_eq!(build_sql("\u{0007}", "C:\\Users\\x", 20), None);
        assert_eq!(terms("a b c d e f g h").len(), 6);
        assert_eq!(terms(&"x".repeat(500))[0].len(), 64);
    }
}
