//! Layer 2 of the four that keep sensitive copies out of the history (SPEC-clipboard §5.4): text that looks like a
//! key, a token or a password.
//!
//! The rule you set is "bỏ qua hết" — when in doubt, skip it. A skipped item is a copy the history simply does not
//! remember; a kept secret is a secret written to disk. The tests therefore carry both real-looking keys and the
//! things that get mistaken for them: git hashes, Vietnamese prose, plain sentences.

/// Token prefixes that only ever start a credential.
const PREFIXES: [&str; 11] = [
    "sk-",
    "pk_",
    "ghp_",
    "gho_",
    "github_pat_",
    "AKIA",
    "ASIA",
    "AIza",
    "ya29.",
    "hf_",
    "glpat-",
];

/// `name=value` shapes that give a secret away whatever the value looks like. A `:` counts too, so JSON and YAML
/// (`"token": "abcd"`) are caught; prose that merely mentions the word has nothing right after it.
const ASSIGNMENTS: [&str; 5] = ["password", "secret", "token", "api_key", "apikey"];

/// Shortest token worth judging: below this the "prefix" is likely part of a word.
const MIN_TOKEN: usize = 12;

/// True when this text should not be remembered.
pub fn looks_secret(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.contains("-----BEGIN") && trimmed.contains("PRIVATE KEY-----") {
        return true;
    }
    if has_assignment(trimmed) {
        return true;
    }
    // Only the first stretch is judged: a long document is prose, not a token.
    let head: String = trimmed.chars().take(4096).collect();
    let mut after_bearer = false;
    for token in head.split_whitespace() {
        if after_bearer && token.len() >= MIN_TOKEN {
            return true;
        }
        after_bearer = token == "Bearer";
        if is_prefixed(token) || is_slack_token(token) || is_jwt(token) {
            return true;
        }
    }
    is_lone_high_entropy_string(trimmed)
}

fn is_prefixed(token: &str) -> bool {
    PREFIXES
        .iter()
        .any(|prefix| token.starts_with(prefix) && token.len() >= prefix.len() + 8)
}

/// Slack's `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`.
fn is_slack_token(token: &str) -> bool {
    let bytes = token.as_bytes();
    bytes.len() >= MIN_TOKEN
        && token.starts_with("xox")
        && matches!(bytes.get(3), Some(b'a' | b'b' | b'p' | b'r'))
        && bytes.get(4) == Some(&b'-')
}

fn is_jwt(token: &str) -> bool {
    let parts: Vec<&str> = token.split('.').collect();
    parts.len() == 3
        && parts[0].starts_with("eyJ")
        && parts.iter().all(|p| p.len() >= 8 && is_base64url(p))
}

fn has_assignment(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ASSIGNMENTS.iter().any(|name| {
        lower.match_indices(name).any(|(at, _)| {
            // A word boundary before the name, then `=` or `:` — past a closing quote — with a real value after it.
            let starts_word = at == 0 || !lower.as_bytes()[at - 1].is_ascii_alphanumeric();
            let rest = lower[at + name.len()..].trim_start_matches(['"', '\'', ' ', '\t']);
            let value = rest
                .strip_prefix(['=', ':'])
                .map(|v| v.trim_start_matches(['"', '\'', ' ', '\t']));
            starts_word && value.is_some_and(|v| v.chars().take_while(|c| *c != '\n').count() >= 4)
        })
    })
}

fn is_base64url(text: &str) -> bool {
    !text.is_empty()
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'='))
}

/// One long line of nothing but base64/hex, mixing cases and digits — the shape of a raw key.
/// All-lowercase hex (a git hash) and all-uppercase text never qualify.
fn is_lone_high_entropy_string(text: &str) -> bool {
    if text.lines().count() != 1 || text.chars().count() < 32 {
        return false;
    }
    let alphabet = text
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=' | b'-' | b'_'));
    alphabet
        && text.bytes().any(|b| b.is_ascii_uppercase())
        && text.bytes().any(|b| b.is_ascii_lowercase())
        && text.bytes().any(|b| b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fake token, put together at run time. Written out whole, these have exactly the shape a secret scanner
    /// hunts for, and a public repo holding them would trip GitHub's push protection or raise a false alert.
    /// None of them is real; the prefix and the body are simply kept apart in the source.
    fn fake(prefix: &str, body: &str) -> String {
        format!("{prefix}{body}")
    }

    #[test]
    fn known_token_prefixes_are_secret() {
        assert!(looks_secret(&fake("sk-proj-", "QmVhcjEyMzQ1Njc4OTBhYmNk")));
        assert!(looks_secret(&fake("ghp_", "16C7e42F292c6912E7710c838347Ae")));
        assert!(looks_secret(&fake("github_pat_", "11ABCDEFG0aBcDeFgHiJkL")));
        assert!(looks_secret(&fake("AKIA", "IOSFODNN7EXAMPLE")));
        assert!(looks_secret(&fake("AIza", "SyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY")));
        assert!(looks_secret(&fake("xoxb-", "123456789012-abcdefghijkl")));
        assert!(looks_secret(&fake("glpat-", "ABCdef123456789012")));
    }

    #[test]
    fn a_bearer_header_is_secret() {
        assert!(looks_secret("Authorization: Bearer abcdefghijklmnop"));
    }

    #[test]
    fn a_jwt_is_secret() {
        // The jwt.io sample ({"alg":"HS256"} / {"sub":"1234567890"}), kept in three parts for the reason above.
        let jwt = [
            "eyJhbGciOiJIUzI1NiJ9",
            "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
            "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g",
        ]
        .join(".");
        assert!(looks_secret(&jwt));
    }

    #[test]
    fn a_private_key_is_secret() {
        assert!(looks_secret(
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNza\n-----END OPENSSH PRIVATE KEY-----"
        ));
    }

    #[test]
    fn assignments_are_secret_whatever_the_value() {
        assert!(looks_secret("password=hunter22"));
        assert!(looks_secret("API_KEY = abcd1234"));
        assert!(looks_secret("db_password= matkhau123"));
        assert!(looks_secret("{ \"token\": \"abcd1234\" }"));
        assert!(looks_secret("api_key: sk_live_placeholder"));
    }

    #[test]
    fn the_word_alone_in_a_sentence_is_not_an_assignment() {
        assert!(!looks_secret("Ghi chú: token của dự án đã hết hạn"));
        assert!(!looks_secret("Mật khẩu / password đâu rồi?"));
    }

    #[test]
    fn a_long_mixed_string_on_its_own_is_secret() {
        assert!(looks_secret("Zm9vYmFyMTIzNDU2Nzg5MFF3ZXJ0eVVpb3A="));
    }

    #[test]
    fn a_git_hash_is_not_secret() {
        assert!(!looks_secret("6416d58f4c2b9a7e1d3f08c5b2a94e7d01f6c3ab"));
    }

    #[test]
    fn ordinary_copies_are_not_secret() {
        assert!(!looks_secret("Chiều nay đi ăn phở nhé, khoảng 6 giờ"));
        assert!(!looks_secret("https://tauri.app/v2/guides/windowing/"));
        assert!(!looks_secret("C:\\Users\\me\\orca\\workspaces\\winbar"));
        assert!(!looks_secret("fn main() {\n    println!(\"hi\");\n}"));
        assert!(!looks_secret(""));
    }

    #[test]
    fn a_word_that_merely_starts_like_a_prefix_is_not_secret() {
        assert!(!looks_secret("sk-i"));
        assert!(!looks_secret("hf_"));
        // "password" in a sentence, with no value after it.
        assert!(!looks_secret("Tôi quên password rồi"));
        assert!(!looks_secret("Đổi password = ?"));
    }

    #[test]
    fn a_long_sentence_is_never_one_token() {
        let prose = "Đây là một đoạn văn dài ".repeat(50);
        assert!(!looks_secret(&prose));
    }

    #[test]
    fn a_long_uppercase_id_is_not_secret() {
        assert!(!looks_secret("ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGH"));
    }
}
