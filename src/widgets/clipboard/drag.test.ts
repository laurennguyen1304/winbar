import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillTextDrag, prefetchText, resetTextsForTests, startRowDrag } from "./drag";
import type { ClipItem } from "./native";

const { plugin, native } = vi.hoisted(() => ({
  plugin: { calls: [] as Array<{ item: string[]; icon: string }> },
  native: { texts: {} as Record<string, string>, reads: [] as string[] },
}));

vi.mock("@crabnebula/tauri-plugin-drag", () => ({
  startDrag: (options: { item: string[]; icon: string }) => {
    plugin.calls.push(options);
    return Promise.resolve();
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("./native", () => ({
  clipText: (id: string) => {
    native.reads.push(id);
    return Promise.resolve(native.texts[id] ?? "");
  },
}));

function clip(over: Partial<ClipItem> & Pick<ClipItem, "id">): ClipItem {
  return { kind: "text", preview: over.id, at: 0, pinned: false, ...over };
}

/** A DragEvent stand-in: jsdom has no DataTransfer. */
function dragEvent() {
  const data: Record<string, string> = {};
  let defaultPrevented = false;
  return {
    event: {
      dataTransfer: {
        setData: (type: string, value: string) => (data[type] = value),
        effectAllowed: "none",
      },
      preventDefault: () => (defaultPrevented = true),
    } as unknown as DragEvent,
    data,
    wasPrevented: () => defaultPrevented,
  };
}

const TEXT = clip({ id: "note", preview: "Gửi lại bản brief cho freelancer, và…" });
const PICTURE = clip({
  id: "shot",
  kind: "image",
  preview: "Ảnh 1920×1080",
  image: { width: 1920, height: 1080, path: "C:/shot.png", thumb: "C:/thumb.png" },
});

describe("dragging an item out", () => {
  beforeEach(() => {
    plugin.calls = [];
    native.reads = [];
    native.texts = { note: "Gửi lại bản brief cho freelancer, và cả bản dài hơn preview rất nhiều" };
    resetTextsForTests();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("carries the full text, not just the preview, once it has been read", async () => {
    prefetchText(TEXT);
    await vi.waitFor(() => expect(native.reads).toEqual(["note"]));

    const drag = dragEvent();
    startRowDrag(drag.event, TEXT);
    expect(drag.data["text/plain"]).toBe(native.texts.note);
    expect(drag.wasPrevented()).toBe(false);
  });

  it("still starts a drag when the full text has not arrived, using the preview", () => {
    const drag = dragEvent();
    startRowDrag(drag.event, TEXT);
    expect(drag.data["text/plain"]).toBe(TEXT.preview);
  });

  it("reads one row's text once, and never a picture's", async () => {
    prefetchText(TEXT);
    prefetchText(TEXT);
    prefetchText(PICTURE);
    await vi.waitFor(() => expect(native.reads).toEqual(["note"]));
  });

  it("hands a picture to Windows as a file, with its thumbnail as the preview", () => {
    const drag = dragEvent();
    startRowDrag(drag.event, PICTURE);
    // The browser's own drag would carry nothing useful.
    expect(drag.wasPrevented()).toBe(true);
    expect(drag.data["text/plain"]).toBeUndefined();
    expect(plugin.calls).toEqual([{ item: ["C:/shot.png"], icon: "C:/thumb.png" }]);
  });

  it("does nothing when there is no DataTransfer to fill", () => {
    const event = { dataTransfer: null, preventDefault: () => {} } as unknown as DragEvent;
    expect(fillTextDrag(event, TEXT)).toBe(false);
  });
});
