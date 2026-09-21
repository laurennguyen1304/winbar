import { describe, expect, it } from "vitest";
import { emptyMessage, filterClips, relativeTime } from "./filter";
import type { ClipItem } from "./native";

function clip(over: Partial<ClipItem> & Pick<ClipItem, "id">): ClipItem {
  return { kind: "text", preview: over.id, at: 0, pinned: false, ...over };
}

const ITEMS: ClipItem[] = [
  clip({ id: "note", preview: "Gửi lại bản brief cho freelancer trước thứ 6 nhé" }),
  clip({ id: "url", kind: "link", preview: "https://github.com/laurennguyen1304/yasb" }),
  clip({ id: "snippet", kind: "code", preview: "git worktree add ../firefish -b firefish" }),
  clip({
    id: "shot",
    kind: "image",
    preview: "Ảnh 1920×1080",
    image: { width: 1920, height: 1080, path: "C:/a.png", thumb: "C:/t.png" },
  }),
];

describe("filterClips", () => {
  it("shows everything when nothing is asked for", () => {
    expect(filterClips(ITEMS, "all", "")).toHaveLength(4);
  });

  it("keeps only the chosen kind", () => {
    expect(filterClips(ITEMS, "code", "").map((i) => i.id)).toEqual(["snippet"]);
    expect(filterClips(ITEMS, "image", "").map((i) => i.id)).toEqual(["shot"]);
  });

  it("searches without diacritics in either direction", () => {
    expect(filterClips(ITEMS, "all", "gui lai").map((i) => i.id)).toEqual(["note"]);
    expect(filterClips(ITEMS, "all", "THỨ 6").map((i) => i.id)).toEqual(["note"]);
  });

  it("finds a picture by word and by size", () => {
    expect(filterClips(ITEMS, "all", "screenshot").map((i) => i.id)).toEqual(["shot"]);
    expect(filterClips(ITEMS, "all", "anh").map((i) => i.id)).toEqual(["shot"]);
    expect(filterClips(ITEMS, "all", "1920x1080").map((i) => i.id)).toEqual(["shot"]);
  });

  it("matches the app that copied", () => {
    const withApp = [clip({ id: "a", preview: "xin chào", app: "chrome" })];
    expect(filterClips(withApp, "all", "chrome").map((i) => i.id)).toEqual(["a"]);
  });

  it("combines the chip and the query", () => {
    expect(filterClips(ITEMS, "link", "github").map((i) => i.id)).toEqual(["url"]);
    expect(filterClips(ITEMS, "code", "github")).toEqual([]);
  });

  it("puts pinned items first without reshuffling the rest", () => {
    const items = [clip({ id: "a" }), clip({ id: "b", pinned: true }), clip({ id: "c" })];
    expect(filterClips(items, "all", "").map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("finds nothing for a query that matches nothing", () => {
    expect(filterClips(ITEMS, "all", "khong co gi")).toEqual([]);
  });
});

describe("relativeTime", () => {
  const now = 1_000_000_000;
  const ago = (ms: number) => relativeTime(now - ms, now);

  it("reads as a short label", () => {
    expect(ago(0)).toBe("vừa xong");
    expect(ago(20_000)).toBe("vừa xong");
    expect(ago(5 * 60_000)).toBe("5 phút");
    expect(ago(2 * 3_600_000)).toBe("2 giờ");
    expect(ago(3 * 86_400_000)).toBe("3 ngày");
  });

  it("never shows a negative or zero-minute age", () => {
    expect(relativeTime(now + 5000, now)).toBe("vừa xong");
    expect(ago(50_000)).toBe("1 phút");
  });
});

describe("emptyMessage", () => {
  it("tells an empty history from an empty search", () => {
    expect(emptyMessage(0)).toBe("Chưa có gì trong clipboard");
    expect(emptyMessage(4)).toBe("Không có item khớp");
  });
});
