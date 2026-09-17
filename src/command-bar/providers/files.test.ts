import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileSearch } from "../native";
import { createFilesProvider, DEBOUNCE_MS, type FilesNative } from "./files";

const hits = (generation: number): FileSearch => ({
  generation,
  source: "windows",
  error: null,
  hits: [
    { path: "C:/Users/me/Documents/brief.docx", name: "brief.docx", location: "Documents", folder: false },
    { path: "C:/Users/me/Briefs", name: "Briefs", location: "Thư mục người dùng", folder: true },
  ],
});

function fakeNative(response: (generation: number) => FileSearch = hits) {
  return {
    search: vi.fn((_q: string, generation: number) => Promise.resolve(response(generation))),
    open: vi.fn(() => Promise.resolve()),
    reveal: vi.fn(() => Promise.resolve()),
  } satisfies FilesNative;
}

describe("files provider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for typing to pause, then maps hits to rows that open and reveal", async () => {
    const native = fakeNative();
    const provider = createFilesProvider(native);
    const pending = provider.search("brief", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(native.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const rows = await pending;
    expect(native.search).toHaveBeenCalledWith("brief", 1);
    expect(rows.map((r) => [r.title, r.subtitle, r.icon, r.verb])).toEqual([
      ["brief.docx", "Documents", "file", "Mở"],
      ["Briefs", "Thư mục người dùng", "folder", "Mở"],
    ]);
    await rows[0].run();
    await rows[0].runAlt?.();
    expect(native.open).toHaveBeenCalledWith("C:/Users/me/Documents/brief.docx");
    expect(native.reveal).toHaveBeenCalledWith("C:/Users/me/Documents/brief.docx");
  });

  it("does not ask the index for fewer than 2 characters", async () => {
    const native = fakeNative();
    expect(await createFilesProvider(native).search(" a ", new AbortController().signal)).toEqual([]);
    expect(native.search).not.toHaveBeenCalled();
  });

  it("never asks the index when typing continues within the pause", async () => {
    const native = fakeNative();
    const provider = createFilesProvider(native);
    const controller = new AbortController();
    const pending = provider.search("bri", controller.signal).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(50);
    controller.abort();
    await pending;
    await vi.advanceTimersByTimeAsync(500);
    expect(native.search).not.toHaveBeenCalled();
  });

  it("numbers each request so Rust can drop older ones", async () => {
    const native = fakeNative();
    const provider = createFilesProvider(native);
    for (const q of ["br", "bri"]) {
      const p = provider.search(q, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await p;
    }
    expect(native.search.mock.calls.map((c) => c[1])).toEqual([1, 2]);
  });

  it("shows one dimmed row when the index fails", async () => {
    const native = fakeNative((generation) => ({ generation, source: "windows", hits: [], error: "Windows Search không phản hồi" }));
    const pending = createFilesProvider(native).search("brief", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const rows = await pending;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Không tìm được file", subtitle: "Windows Search không phản hồi", icon: "warning", remember: false });
  });
});
