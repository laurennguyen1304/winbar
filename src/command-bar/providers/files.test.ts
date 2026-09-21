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
    expect(native.search).toHaveBeenCalledWith("brief", expect.any(Number));
    expect(rows.map((r) => [r.title, r.subtitle, r.icon, r.verb])).toEqual([
      ["brief.docx", "Documents", "shell:file:C:/Users/me/Documents/brief.docx", "Mở"],
      ["Briefs", "Thư mục người dùng", "shell:folder:C:/Users/me/Briefs", "Mở"],
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

  it("numbers requests from the clock, always increasing, so a reloaded page is never taken for an old one", async () => {
    vi.setSystemTime(new Date("2026-09-17T07:00:00Z"));
    const native = fakeNative();
    const provider = createFilesProvider(native);
    for (const q of ["br", "bri", "brie"]) {
      const p = provider.search(q, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await p;
    }
    const numbers = native.search.mock.calls.map((c) => c[1]);
    expect(numbers[0]).toBeGreaterThanOrEqual(Date.parse("2026-09-17T07:00:00Z"));
    expect(numbers[1]).toBeGreaterThan(numbers[0]);
    expect(numbers[2]).toBeGreaterThan(numbers[1]);
  });

  it("shows one dimmed row when the index fails", async () => {
    const native = fakeNative((generation) => ({ generation, source: "windows", hits: [], error: "Windows Search không phản hồi" }));
    const pending = createFilesProvider(native).search("brief", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const rows = await pending;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Không tìm được file", subtitle: "Windows Search không phản hồi", icon: "warning", remember: false });
  });

  it("names the source that answered in the group heading", async () => {
    let source: FileSearch["source"] = "everything";
    const native = fakeNative((generation) => ({ ...hits(generation), source }));
    const provider = createFilesProvider(native);
    expect(provider.title).toBe("File");
    const ask = async () => {
      const p = provider.search("brief", new AbortController().signal);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await p;
    };
    await ask();
    expect(provider.title).toBe("File · Everything");
    source = "windows";
    await ask();
    expect(provider.title).toBe("File · Windows Search");
  });

  it("records opened files and folders, not Ctrl+Enter", async () => {
    const record = vi.fn();
    const provider = createFilesProvider(fakeNative(), { record });
    const pending = provider.search("brief", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const [file, folder] = await pending;
    await file.run();
    await folder.run();
    await file.runAlt?.();
    expect(record.mock.calls.map((c) => [c[0].kind, c[0].title, c[0].subtitle])).toEqual([
      ["file", "brief.docx", "Documents"],
      ["folder", "Briefs", "Thư mục người dùng"],
    ]);
  });
});
