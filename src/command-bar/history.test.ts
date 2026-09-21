import { describe, expect, it, vi } from "vitest";
import { createHistory, RECENT_LIMIT, recentResults } from "./history";
import type { HistoryEntry } from "./native";

const entry = (kind: HistoryEntry["kind"], target: string, title = target): HistoryEntry => ({
  kind,
  target,
  title,
  subtitle: null,
  count: 1,
  lastUsed: 0,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("history store", () => {
  it("records a run, then reloads the list and notifies", async () => {
    let list: Array<[HistoryEntry, number]> = [];
    const native = {
      record: vi.fn(() => {
        list = [[entry("app", "Chrome", "Google Chrome"), 1]];
        return Promise.resolve();
      }),
      list: vi.fn(() => Promise.resolve(list)),
    };
    const store = createHistory(native);
    const listener = vi.fn();
    store.subscribe(listener);
    store.record({ kind: "app", target: "Chrome", title: "Google Chrome", subtitle: "Ứng dụng" });
    await flush();
    expect(native.record).toHaveBeenCalledWith({ kind: "app", target: "Chrome", title: "Google Chrome", subtitle: "Ứng dụng" });
    expect(listener).toHaveBeenCalled();
    expect(store.entries()).toEqual(list);
  });

  it("turns frecency into a capped ranking bonus", async () => {
    const store = createHistory({
      record: () => Promise.resolve(),
      list: () =>
        Promise.resolve([
          [entry("app", "Code"), 2.5],
          [entry("app", "Slack"), 900],
        ]),
    });
    await store.refresh();
    expect(store.bonus("app", "Code")).toBe(250);
    expect(store.bonus("app", "Slack")).toBe(5000);
    expect(store.bonus("app", "Never")).toBe(0);
    expect(store.bonus("file", "Code")).toBe(0);
  });

  it("keeps working when Rust cannot answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = createHistory({ record: () => Promise.reject(new Error("disk")), list: () => Promise.reject(new Error("x")) });
    store.record({ kind: "action", target: "open-notch", title: "Mở notch", subtitle: null });
    await store.refresh();
    await flush();
    expect(store.entries()).toEqual([]);
    warn.mockRestore();
  });
});

describe("recentResults", () => {
  const runners = () => ({
    launchApp: vi.fn(() => Promise.resolve()),
    openPath: vi.fn(() => Promise.resolve()),
    revealPath: vi.fn(() => Promise.resolve()),
    runAction: vi.fn(() => Promise.resolve()),
  });

  it("rebuilds runnable rows for each kind and records them again", async () => {
    const run = runners();
    const record = vi.fn();
    const rows = recentResults(
      [
        [entry("app", "Chrome", "Google Chrome"), 3],
        [entry("file", "C:/a.pdf", "a.pdf"), 2],
        [entry("folder", "C:/Downloads", "Downloads"), 1.5],
        [entry("action", "open-notch-claude", "Mở notch · tab Claude"), 1],
      ],
      run,
      { record },
    );
    expect(rows.map((r) => [r.title, r.icon, r.verb])).toEqual([
      ["Google Chrome", "shell:app:Chrome", "Mở"],
      ["a.pdf", "shell:file:C:/a.pdf", "Mở"],
      ["Downloads", "shell:folder:C:/Downloads", "Mở"],
      ["Mở notch · tab Claude", "sparks", "Chạy"],
    ]);
    for (const row of rows) await row.run();
    expect(run.launchApp).toHaveBeenCalledWith("Chrome");
    expect(run.openPath).toHaveBeenCalledWith("C:/a.pdf");
    expect(run.openPath).toHaveBeenCalledWith("C:/Downloads");
    expect(run.runAction).toHaveBeenCalledWith("open-notch-claude");
    expect(record).toHaveBeenCalledTimes(4);
    await rows[1].runAlt?.();
    expect(run.revealPath).toHaveBeenCalledWith("C:/a.pdf");
    expect(rows[0].runAlt).toBeUndefined();
  });

  it("shows at most 8", () => {
    const many = Array.from({ length: 12 }, (_, i): [HistoryEntry, number] => [entry("action", `a${i}`), 1]);
    expect(recentResults(many, runners(), { record: vi.fn() })).toHaveLength(RECENT_LIMIT);
  });
});
