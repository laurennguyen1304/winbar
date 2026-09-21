//! Where the history lives: `%APPDATA%\winbar\clipboard\` with `index.json` next to `images/` and `thumbs/`
//! (SPEC-clipboard §8). Written the same way as the other files: to a temporary name, then renamed.
//!
//! The index holds the text of each item, so this directory is as private as the copies in it. Nothing here is
//! logged beyond ids and sizes.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::model::{ClipItem, StoredItem};

#[derive(Debug, Default, Serialize, Deserialize)]
struct FileFormat {
    version: u32,
    items: Vec<StoredItem>,
}

/// The files of one history, newest item first.
pub struct Store {
    dir: PathBuf,
    items: Vec<StoredItem>,
}

impl Store {
    /// Opens the history at `dir`, reading `index.json` if it is there.
    pub fn open(dir: PathBuf) -> Self {
        let index = dir.join("index.json");
        let readable = index.exists();
        let items = load(&index);
        let store = Store { dir, items };
        // Pictures nothing points at can never be shown again, and nothing else would ever delete them.
        // Only when the index was read: after a corrupt one, the pictures are all there is left.
        if readable && !store.items.is_empty() {
            store.drop_orphan_images();
        }
        store
    }

    /// Deletes picture files no item refers to.
    fn drop_orphan_images(&self) {
        let kept: std::collections::HashSet<PathBuf> = self
            .items
            .iter()
            .filter_map(|s| s.item.image.as_ref())
            .flat_map(|i| [PathBuf::from(&i.path), PathBuf::from(&i.thumb)])
            .collect();
        for dir in [self.images_dir(), self.thumbs_dir()] {
            let Ok(entries) = fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && !kept.contains(&path) {
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }

    /// The rows the card shows.
    pub fn list(&self) -> Vec<ClipItem> {
        self.items.iter().map(|s| s.item.clone()).collect()
    }

    pub fn find(&self, id: &str) -> Option<&StoredItem> {
        self.items.iter().find(|s| s.item.id == id)
    }

    pub fn images_dir(&self) -> PathBuf {
        self.dir.join("images")
    }

    pub fn thumbs_dir(&self) -> PathBuf {
        self.dir.join("thumbs")
    }

    /// Puts an item at the top, replacing an older copy of the same thing (and deleting anything it left on disk).
    pub fn insert(&mut self, item: StoredItem) {
        let stale: Vec<String> = self
            .items
            .iter()
            .filter(|s| !s.item.pinned && super::model::same_content(s, &item))
            .map(|s| s.item.id.clone())
            .collect();
        self.remove(&stale);
        self.items.insert(0, item);
    }

    pub fn set_pinned(&mut self, id: &str, pinned: bool) -> bool {
        match self.items.iter_mut().find(|s| s.item.id == id) {
            Some(stored) => {
                stored.item.pinned = pinned;
                true
            }
            None => false,
        }
    }

    /// Removes these items and the image files behind them.
    pub fn remove(&mut self, ids: &[String]) -> usize {
        let mut gone = 0;
        self.items.retain(|stored| {
            if !ids.contains(&stored.item.id) {
                return true;
            }
            gone += 1;
            if let Some(image) = &stored.item.image {
                let _ = fs::remove_file(&image.path);
                let _ = fs::remove_file(&image.thumb);
            }
            false
        });
        gone
    }

    /// Everything except pinned items.
    pub fn clear(&mut self) -> usize {
        let ids: Vec<String> = self
            .items
            .iter()
            .filter(|s| !s.item.pinned)
            .map(|s| s.item.id.clone())
            .collect();
        self.remove(&ids)
    }

    /// Drops what the retention rules say to drop; returns how many went.
    pub fn prune(&mut self, now: u64, retention_ms: u64) -> usize {
        let ids = super::model::prune(&self.items, now, retention_ms);
        if ids.is_empty() {
            return 0;
        }
        self.remove(&ids)
    }

    pub fn save(&self) -> Result<(), String> {
        save(&self.dir.join("index.json"), &self.items)
    }
}

/// Reads the index; a corrupt file is kept as `.bak` and treated as empty, as elsewhere in winbar.
pub fn load(path: &Path) -> Vec<StoredItem> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    match serde_json::from_str::<FileFormat>(text.trim_start_matches('\u{feff}')) {
        Ok(file) => file.items,
        Err(e) => {
            eprintln!("winbar clipboard: corrupt {}: {e}", path.display());
            let _ = fs::copy(path, path.with_extension("json.bak"));
            Vec::new()
        }
    }
}

pub fn save(path: &Path, items: &[StoredItem]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(&FileFormat {
        version: 1,
        items: items.to_vec(),
    })
    .map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Writes `bytes` to `path`, creating the folder, through a temporary file.
pub fn write_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::model::{ClipKind, ImageRef};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("winbar-clip-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn stored(id: &str, text: &str, pinned: bool) -> StoredItem {
        StoredItem {
            item: ClipItem {
                id: id.into(),
                kind: ClipKind::Text,
                preview: text.into(),
                at: 1000,
                pinned,
                app: None,
                image: None,
                truncated: false,
            },
            text: Some(text.into()),
        }
    }

    #[test]
    fn saves_and_reopens() {
        let dir = temp_dir("roundtrip");
        let mut store = Store::open(dir.clone());
        store.insert(stored("a", "xin chào", false));
        store.save().expect("saves");

        let again = Store::open(dir.clone());
        assert_eq!(again.list().len(), 1);
        assert_eq!(
            again.find("a").and_then(|s| s.text.clone()).as_deref(),
            Some("xin chào")
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn recopying_moves_the_item_back_to_the_top() {
        let mut store = Store::open(temp_dir("dupe"));
        store.insert(stored("a", "một", false));
        store.insert(stored("b", "hai", false));
        store.insert(stored("c", "một", false));
        assert_eq!(store.list().len(), 2);
        assert_eq!(store.list()[0].id, "c");
    }

    #[test]
    fn replacing_a_duplicate_takes_its_files_with_it() {
        let dir = temp_dir("dupe-files");
        let png = dir.join("images").join("old.png");
        write_file(&png, b"left over").expect("writes");
        let mut store = Store::open(dir.clone());
        let mut first = stored("old", "cùng một câu", false);
        first.item.image = Some(ImageRef {
            width: 4,
            height: 2,
            path: png.to_string_lossy().into_owned(),
            thumb: png.to_string_lossy().into_owned(),
        });
        store.insert(first);
        store.insert(stored("new", "cùng một câu", false));
        assert_eq!(store.list().len(), 1);
        assert!(
            !png.exists(),
            "the replaced item does not leave its file behind"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_pinned_item_is_not_replaced_by_a_recopy() {
        let mut store = Store::open(temp_dir("dupe-pinned"));
        store.insert(stored("a", "một", true));
        store.insert(stored("c", "một", false));
        assert_eq!(store.list().len(), 2);
    }

    #[test]
    fn removing_an_item_deletes_its_picture() {
        let dir = temp_dir("image");
        let png = dir.join("images").join("a.png");
        let thumb = dir.join("thumbs").join("a.png");
        write_file(&png, b"not really a png").expect("writes");
        write_file(&thumb, b"nor this").expect("writes");

        let mut store = Store::open(dir.clone());
        let mut item = stored("a", "ảnh", false);
        item.item.kind = ClipKind::Image;
        item.item.image = Some(ImageRef {
            width: 4,
            height: 2,
            path: png.to_string_lossy().into_owned(),
            thumb: thumb.to_string_lossy().into_owned(),
        });
        store.insert(item);
        assert_eq!(store.remove(&["a".to_string()]), 1);
        assert!(!png.exists(), "the picture goes with the row");
        assert!(!thumb.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reopening_sweeps_up_pictures_no_row_points_at() {
        let dir = temp_dir("orphans");
        let mut store = Store::open(dir.clone());
        let png = dir.join("images").join("keep.png");
        let thumb = dir.join("thumbs").join("keep.png");
        write_file(&png, b"kept").expect("writes");
        write_file(&thumb, b"kept").expect("writes");
        let mut item = stored("keep", "ảnh", false);
        item.item.kind = ClipKind::Image;
        item.item.image = Some(ImageRef {
            width: 4,
            height: 2,
            path: png.to_string_lossy().into_owned(),
            thumb: thumb.to_string_lossy().into_owned(),
        });
        store.insert(item);
        store.insert(stored("text", "chữ", false));
        store.save().expect("saves");

        // Left behind by an older run, or by an index that was put back from a copy.
        let stray = dir.join("images").join("stray.png");
        write_file(&stray, b"nobody points at this").expect("writes");

        let again = Store::open(dir.clone());
        assert_eq!(again.list().len(), 2);
        assert!(png.exists(), "a picture a row still points at stays");
        assert!(!stray.exists(), "the stray one goes");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_corrupt_index_keeps_the_pictures() {
        let dir = temp_dir("corrupt-images");
        let png = dir.join("images").join("only-copy.png");
        write_file(&png, b"the only copy left").expect("writes");
        write_file(&dir.join("index.json"), b"{ not json").expect("writes");
        assert_eq!(Store::open(dir.clone()).list().len(), 0);
        assert!(
            png.exists(),
            "after a corrupt index the pictures are all there is"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clearing_keeps_pinned_items() {
        let mut store = Store::open(temp_dir("clear"));
        store.insert(stored("a", "một", false));
        store.insert(stored("b", "hai", true));
        assert_eq!(store.clear(), 1);
        assert_eq!(store.list().len(), 1);
        assert!(store.list()[0].pinned);
    }

    #[test]
    fn a_corrupt_index_is_kept_aside_and_the_history_starts_empty() {
        let dir = temp_dir("corrupt");
        let path = dir.join("index.json");
        write_file(&path, b"{ not json").expect("writes");
        assert_eq!(Store::open(dir.clone()).list().len(), 0);
        assert!(path.with_extension("json.bak").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pruning_drops_old_rows() {
        let mut store = Store::open(temp_dir("prune"));
        let mut old = stored("old", "cũ", false);
        old.item.at = 0;
        store.insert(old);
        let mut new = stored("new", "mới", false);
        new.item.at = 95_000;
        store.insert(new);
        assert_eq!(store.prune(100_000, 10_000), 1);
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.list()[0].id, "new");
    }
}
