import { beforeEach, describe, expect, it, vi } from "vitest";
import { startRowDrag } from "./drag";
import type { ClipItem } from "./native";

const { plugin, native } = vi.hoisted(() => ({
  plugin: { calls: [] as Array<{ item: string[]; icon: string }> },
  native: { reads: [] as string[] },
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
    return Promise.resolve("");
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
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("leaves a text row alone: no drag, and nothing read from disk", () => {
    const drag = dragEvent();
    startRowDrag(drag.event, TEXT);
    // WebView2 never handed such a drag to Windows, so the row does not offer one. Nothing is put on the
    // DataTransfer, and no text is read out of the store just in case.
    expect(drag.data["text/plain"]).toBeUndefined();
    expect(drag.wasPrevented()).toBe(false);
    expect(plugin.calls).toEqual([]);
    expect(native.reads).toEqual([]);
  });

  it("hands a picture to Windows as a file, with its thumbnail as the preview", () => {
    const drag = dragEvent();
    startRowDrag(drag.event, PICTURE);
    // The browser's own drag would carry nothing useful.
    expect(drag.wasPrevented()).toBe(true);
    expect(drag.data["text/plain"]).toBeUndefined();
    expect(plugin.calls).toEqual([{ item: ["C:/shot.png"], icon: "C:/thumb.png" }]);
  });
});
