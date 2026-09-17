import { describe, expect, it, vi } from "vitest";
import { createWebProvider, ENGINES, orderedEngines, searchUrl } from "./web";

describe("web provider", () => {
  it("lists every engine with the preferred one first", async () => {
    const provider = createWebProvider(() => "bing", vi.fn());
    const rows = await provider.search("tauri window", new AbortController().signal);
    expect(rows).toHaveLength(ENGINES.length);
    expect(rows.slice(0, 3).map((r) => r.title)).toEqual([
      'Tìm "tauri window" trên Bing',
      'Tìm "tauri window" trên Google',
      'Tìm "tauri window" trên DuckDuckGo',
    ]);
    expect(rows[0]).toMatchObject({ subtitle: "bing.com", verb: "Mở", remember: false });
  });

  it("follows the setting each time it searches", async () => {
    let preferred: "google" | "duckduckgo" = "google";
    const provider = createWebProvider(() => preferred, vi.fn());
    expect((await provider.search("x", new AbortController().signal))[0].id).toBe("google");
    preferred = "duckduckgo";
    expect((await provider.search("x", new AbortController().signal))[0].id).toBe("duckduckgo");
  });

  it("opens an encoded search address", async () => {
    const open = vi.fn(() => Promise.resolve());
    const provider = createWebProvider(() => "google", open);
    const [first] = await provider.search("c# & rust?", new AbortController().signal);
    await first.run();
    expect(open).toHaveBeenCalledWith("https://www.google.com/search?q=c%23%20%26%20rust%3F");
  });

  it("shows a hint when only the prefix is typed", async () => {
    const provider = createWebProvider(() => "google", vi.fn());
    const rows = await provider.search("  ", new AbortController().signal);
    expect(rows).toEqual([expect.objectContaining({ title: "Tìm trên Google…", verb: "" })]);
  });

  it("builds addresses for every engine", () => {
    for (const engine of orderedEngines("google")) {
      expect(searchUrl(engine, "a b")).toMatch(/^https:\/\/[^ ]+a%20b/);
    }
  });
});
