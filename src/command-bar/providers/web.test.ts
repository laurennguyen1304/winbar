import { describe, expect, it, vi } from "vitest";
import { createEngineProvider, createWebProvider, ENGINES, orderedEngines, searchUrl } from "./web";

const signal = () => new AbortController().signal;
const engine = (id: string) => ENGINES.find((e) => e.id === id) as (typeof ENGINES)[number];

describe("web search", () => {
  it("is limited to Google, YouTube, Reddit and X with commands g y r x", () => {
    expect(ENGINES.map((e) => [e.name, e.command])).toEqual([
      ["Google", "g"],
      ["YouTube", "y"],
      ["Reddit", "r"],
      ["X", "x"],
    ]);
  });

  it("? lists every engine with the preferred one first", async () => {
    const provider = createWebProvider(() => "reddit", vi.fn());
    const rows = await provider.search("tauri window", signal());
    expect(rows.map((r) => r.title)).toEqual([
      'Tìm "tauri window" trên Reddit',
      'Tìm "tauri window" trên Google',
      'Tìm "tauri window" trên YouTube',
      'Tìm "tauri window" trên X',
    ]);
    expect(rows[0]).toMatchObject({ subtitle: "reddit.com", verb: "Mở", remember: false });
    expect(provider.prefix).toBe("?");
  });

  it("follows the setting each time it searches", async () => {
    let preferred: "google" | "x" = "google";
    const provider = createWebProvider(() => preferred, vi.fn());
    expect((await provider.search("q", signal()))[0].id).toBe("google");
    preferred = "x";
    expect((await provider.search("q", signal()))[0].id).toBe("x");
  });

  it("a slash command searches only its site and stays out of ordinary results", async () => {
    const open = vi.fn(() => Promise.resolve());
    const youtube = createEngineProvider(engine("youtube"), open);
    expect(youtube).toMatchObject({ id: "web-youtube", title: "YouTube", prefix: "/y", inDefaultResults: false });
    const rows = await youtube.search("lofi hip hop", signal());
    expect(rows.map((r) => r.title)).toEqual(['Tìm "lofi hip hop" trên YouTube']);
    await rows[0].run();
    expect(open).toHaveBeenCalledWith("https://www.youtube.com/results?search_query=lofi%20hip%20hop");
  });

  it("shows a hint when only the command is typed", async () => {
    expect(await createEngineProvider(engine("reddit"), vi.fn()).search(" ", signal())).toEqual([
      expect.objectContaining({ title: "Tìm trên Reddit…", subtitle: "Gõ từ khóa sau /r", verb: "" }),
    ]);
    expect((await createWebProvider(() => "google", vi.fn()).search("", signal()))[0].title).toBe("Tìm trên web…");
  });

  it("encodes the query for every engine", () => {
    const open = orderedEngines("google").map((e) => searchUrl(e, "c# & rust?"));
    expect(open).toEqual([
      "https://www.google.com/search?q=c%23%20%26%20rust%3F",
      "https://www.youtube.com/results?search_query=c%23%20%26%20rust%3F",
      "https://www.reddit.com/search/?q=c%23%20%26%20rust%3F",
      "https://x.com/search?q=c%23%20%26%20rust%3F",
    ]);
  });
});
