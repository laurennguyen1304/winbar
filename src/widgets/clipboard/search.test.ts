import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipItem } from "./native";
import { createClipboardProvider } from "./search";

const { native } = vi.hoisted(() => ({ native: { copied: [] as string[], opened: [] as string[] } }));
vi.mock("./native", () => ({
  copyClip: (id: string) => {
    native.copied.push(id);
    return Promise.resolve();
  },
  listClips: () => Promise.resolve([]),
}));
vi.mock("../../command-bar/native", () => ({
  openPath: (path: string) => {
    native.opened.push(path);
    return Promise.resolve();
  },
}));

function clip(over: Partial<ClipItem> & Pick<ClipItem, "id">): ClipItem {
  return { kind: "text", preview: over.id, at: 0, pinned: false, ...over };
}

const ITEMS: ClipItem[] = [
  clip({ id: "newest", preview: "Gửi lại bản brief cho freelancer", app: "chrome" }),
  clip({ id: "middle", kind: "code", preview: "git worktree add ../firefish" }),
  clip({
    id: "oldest",
    kind: "image",
    preview: "Ảnh 1920×1080",
    app: "Monosnap",
    image: { width: 1920, height: 1080, path: "C:/shot.png", thumb: "C:/t.png" },
  }),
];

const provider = createClipboardProvider(() => Promise.resolve(ITEMS));
const search = (query: string) => provider.search(query, new AbortController().signal);

describe("clipboard command bar rows", () => {
  beforeEach(() => {
    native.copied = [];
    native.opened = [];
  });

  it("is the Clipboard group behind the cb prefix", () => {
    expect(provider.id).toBe("clipboard");
    expect(provider.title).toBe("Clipboard");
    expect(provider.prefix).toBe("cb");
  });

  it("shows the newest items when the prefix is typed alone", async () => {
    const rows = await search("");
    expect(rows.map((r) => r.id)).toEqual(["clip-newest", "clip-middle", "clip-oldest"]);
    expect(rows[0].score).toBeGreaterThan(rows[1].score ?? 0);
  });

  it("stays quiet for a single letter, so it does not crowd other groups", async () => {
    expect(await search("g")).toEqual([]);
  });

  it("finds items without diacritics and by the app that copied", async () => {
    expect((await search("gui lai")).map((r) => r.id)).toEqual(["clip-newest"]);
    expect((await search("monosnap")).map((r) => r.id)).toEqual(["clip-oldest"]);
    expect((await search("screenshot")).map((r) => r.id)).toEqual(["clip-oldest"]);
  });

  it("copies on Enter and never records the row", async () => {
    const [row] = await search("worktree");
    expect(row.verb).toBe("Copy");
    expect(row.remember).toBe(false);
    await row.run();
    expect(native.copied).toEqual(["middle"]);
  });

  it("opens the file on Ctrl+Enter, but only for a picture", async () => {
    const [picture] = await search("Monosnap");
    await picture.runAlt?.();
    expect(native.opened).toEqual(["C:/shot.png"]);

    const [text] = await search("gui lai");
    expect(text.runAlt).toBeUndefined();
  });

  it("gives each row the icon of its kind", async () => {
    const rows = await search("");
    expect(rows.map((r) => r.icon)).toEqual(["text", "code", "image"]);
  });

  it("returns nothing once the search is abandoned", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await provider.search("gui", controller.signal)).toEqual([]);
  });
});
