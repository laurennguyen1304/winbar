//! What a clipboard item is, and the rules for shaping and pruning the list (SPEC-clipboard §5, §6).
//!
//! Nothing here touches Windows or the disk, so all of it is tested directly.

use serde::{Deserialize, Serialize};

/// How many unpinned items the history keeps (SPEC §3). Fixed in v1.
pub const MAX_ITEMS: usize = 50;
/// Longest preview line the card shows.
pub const PREVIEW_CHARS: usize = 200;
/// Longest text kept in full. Anything longer is cut and marked `truncated`.
pub const MAX_TEXT_CHARS: usize = 100_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClipKind {
    #[default]
    Text,
    Link,
    Code,
    Image,
}

/// Where an image lives on disk.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRef {
    pub width: u32,
    pub height: u32,
    /// The picture as copied, the file that gets dragged out.
    pub path: String,
    /// Small copy for the list.
    pub thumb: String,
}

/// One row of the list, as the card sees it. Never carries the full text.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: String,
    pub kind: ClipKind,
    /// One line, at most [`PREVIEW_CHARS`] characters.
    pub preview: String,
    /// When it was copied, epoch ms.
    pub at: u64,
    pub pinned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<ImageRef>,
    /// The stored text was cut because it was very long.
    #[serde(default, skip_serializing_if = "is_false")]
    pub truncated: bool,
}

fn is_false(value: &bool) -> bool {
    !*value
}

/// A row plus the text behind it. This is what `index.json` holds; the text never leaves Rust unasked.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredItem {
    #[serde(flatten)]
    pub item: ClipItem,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// Text or a link or code? Boring rules on purpose: the card only uses this for an icon and a filter chip.
pub fn classify(text: &str) -> ClipKind {
    let trimmed = text.trim();
    if is_link(trimmed) {
        ClipKind::Link
    } else if looks_like_code(trimmed) {
        ClipKind::Code
    } else {
        ClipKind::Text
    }
}

fn is_link(text: &str) -> bool {
    if text.is_empty() || text.split_whitespace().count() != 1 {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    ["http://", "https://", "ftp://"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
        || (lower.starts_with("www.") && lower[4..].contains('.'))
}

/// Marks that show up in code far more often than in prose.
const CODE_MARKS: [&str; 20] = [
    "{", "}", ";", "=>", "->", "()", "</", "/>", "::", "&&", "||", "def ", "fn ", "func ",
    "class ", "import ", "const ", "return ", "#include", "SELECT ",
];

fn looks_like_code(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    let marks = CODE_MARKS
        .iter()
        .filter(|mark| text.contains(**mark))
        .count();
    let mut lines = text.lines();
    let multiline = lines.clone().count() > 1;
    let indented = lines.any(|line| line.starts_with("  ") || line.starts_with('\t'));
    if multiline {
        (indented && marks >= 1) || marks >= 2
    } else {
        marks >= 2
    }
}

/// One line of at most [`PREVIEW_CHARS`] characters: newlines and runs of spaces collapse to single spaces.
pub fn preview(text: &str) -> String {
    let mut out = String::new();
    let mut space = false;
    for ch in text.trim().chars() {
        if ch.is_whitespace() {
            space = !out.is_empty();
            continue;
        }
        if space {
            out.push(' ');
            space = false;
        }
        if out.chars().count() >= PREVIEW_CHARS {
            return out;
        }
        out.push(ch);
    }
    out
}

/// The text to keep, and whether it had to be cut.
pub fn store_text(text: &str) -> (String, bool) {
    if text.chars().count() <= MAX_TEXT_CHARS {
        return (text.to_string(), false);
    }
    (text.chars().take(MAX_TEXT_CHARS).collect(), true)
}

/// Whether two copies are the same thing, so re-copying a line does not fill the list with duplicates.
///
/// Only text is ever judged the same. A picture's preview is just its size, and two different screenshots are very
/// often the same size — comparing those would quietly throw one of them away.
pub fn same_content(a: &StoredItem, b: &StoredItem) -> bool {
    match (&a.text, &b.text) {
        (Some(x), Some(y)) => a.item.kind == b.item.kind && x == y,
        _ => false,
    }
}

/// Ids to drop: unpinned items past `retention_ms`, then the oldest unpinned above [`MAX_ITEMS`].
/// `items` is newest first; pinned items are never dropped (SPEC §3).
pub fn prune(items: &[StoredItem], now: u64, retention_ms: u64) -> Vec<String> {
    let mut drop = Vec::new();
    let mut kept = 0usize;
    for stored in items {
        if stored.item.pinned {
            continue;
        }
        let too_old = now.saturating_sub(stored.item.at) > retention_ms;
        if too_old || kept >= MAX_ITEMS {
            drop.push(stored.item.id.clone());
        } else {
            kept += 1;
        }
    }
    drop
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, at: u64, pinned: bool) -> StoredItem {
        StoredItem {
            item: ClipItem {
                id: id.into(),
                kind: ClipKind::Text,
                preview: id.into(),
                at,
                pinned,
                app: None,
                image: None,
                truncated: false,
            },
            text: Some(id.into()),
        }
    }

    const DAY: u64 = 24 * 60 * 60 * 1000;

    #[test]
    fn a_sentence_is_plain_text() {
        assert_eq!(classify("Chiều nay đi ăn phở nhé"), ClipKind::Text);
        assert_eq!(classify("winbar"), ClipKind::Text);
        assert_eq!(classify("C:\\Users\\me\\orca"), ClipKind::Text);
    }

    #[test]
    fn a_bare_url_is_a_link() {
        assert_eq!(classify("https://tauri.app/v2/"), ClipKind::Link);
        assert_eq!(classify("  www.google.com  "), ClipKind::Link);
        // A sentence that merely mentions a link is still text.
        assert_eq!(classify("xem ở https://tauri.app nhé"), ClipKind::Text);
    }

    #[test]
    fn a_snippet_is_code() {
        assert_eq!(
            classify("fn main() {\n    println!(\"hi\");\n}"),
            ClipKind::Code
        );
        assert_eq!(classify("const x = items.map(i => i.id);"), ClipKind::Code);
        assert_eq!(classify("SELECT id FROM users;"), ClipKind::Code);
    }

    #[test]
    fn prose_with_one_bracket_is_not_code() {
        assert_eq!(
            classify("Anh ấy nói (rất nhỏ) là sẽ đến muộn"),
            ClipKind::Text
        );
    }

    #[test]
    fn preview_is_one_tidy_line() {
        assert_eq!(preview("  hai   dòng\nthành một  "), "hai dòng thành một");
        assert_eq!(preview("\n\n"), "");
    }

    #[test]
    fn preview_stops_at_two_hundred_characters() {
        let long = "á".repeat(500);
        assert_eq!(preview(&long).chars().count(), PREVIEW_CHARS);
    }

    #[test]
    fn very_long_text_is_cut_and_marked() {
        let (kept, truncated) = store_text(&"a".repeat(MAX_TEXT_CHARS + 10));
        assert_eq!(kept.chars().count(), MAX_TEXT_CHARS);
        assert!(truncated);
        assert_eq!(store_text("ngắn"), ("ngắn".to_string(), false));
    }

    #[test]
    fn keeps_fifty_and_drops_the_oldest() {
        let items: Vec<_> = (0..60)
            .map(|i| item(&format!("i{i}"), 1_000_000 - i as u64, false))
            .collect();
        let dropped = prune(&items, 1_000_000, DAY);
        assert_eq!(dropped.len(), 10);
        assert_eq!(dropped[0], "i50");
        assert_eq!(dropped[9], "i59");
    }

    #[test]
    fn drops_items_past_the_retention() {
        let items = vec![
            item("new", 2 * DAY, false),
            item("old", DAY - 1, false),
            item("kept-pin", 0, true),
        ];
        let dropped = prune(&items, 2 * DAY, DAY);
        assert_eq!(dropped, vec!["old".to_string()]);
    }

    #[test]
    fn pinned_items_survive_both_rules() {
        let mut items: Vec<_> = (0..60)
            .map(|i| item(&format!("i{i}"), 1_000_000 - i as u64, false))
            .collect();
        items.push(item("pinned-and-ancient", 0, true));
        let dropped = prune(&items, 1_000_000, DAY);
        assert!(!dropped.contains(&"pinned-and-ancient".to_string()));
        // Pinned items do not use up the fifty slots either.
        assert_eq!(dropped.len(), 10);
    }

    #[test]
    fn recopying_the_same_thing_is_the_same_item() {
        assert!(same_content(&item("a", 1, false), &item("a", 2, false)));
        assert!(!same_content(&item("a", 1, false), &item("b", 1, false)));
    }

    #[test]
    fn two_pictures_of_one_size_are_still_two_pictures() {
        // Screenshots of the same window share a preview ("Ảnh 1920×1080"); treating them as one loses a real copy.
        let picture = |id: &str| StoredItem {
            item: ClipItem {
                kind: ClipKind::Image,
                preview: "Ảnh 1920×1080".into(),
                image: Some(ImageRef {
                    width: 1920,
                    height: 1080,
                    path: format!("C:/{id}.png"),
                    thumb: format!("C:/t-{id}.png"),
                }),
                ..item(id, 1, false).item
            },
            text: None,
        };
        assert!(!same_content(&picture("one"), &picture("two")));
    }

    #[test]
    fn an_item_serialises_without_its_text() {
        let json = serde_json::to_value(&item("a", 5, false).item).expect("serialises");
        let fields = json.as_object().expect("an object");
        assert_eq!(fields["preview"], "a");
        // Absent fields stay out of the payload the card receives, and the text never rides along.
        assert!(!fields.contains_key("text"));
        assert!(!fields.contains_key("truncated"));
        assert!(!fields.contains_key("image"));
    }

    #[test]
    fn the_index_round_trips() {
        let items = vec![item("a", 1, true), item("b", 2, false)];
        let json = serde_json::to_string(&items).expect("serialises");
        let back: Vec<StoredItem> = serde_json::from_str(&json).expect("parses");
        assert_eq!(back, items);
    }
}
