import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchProvider, SearchResult } from "../shell/widget-contract";
import { PREFIX_LIMIT, resolvePrefixes, routeQuery, searchAll, type Group, type Slot } from "./search";

const result = (id: string, extra: Partial<SearchResult> = {}): SearchResult => ({ id, title: id, verb: "Mở", run: () => {}, ...extra });

function provider(id: string, items: string[] | ((q: string) => SearchResult[]), extra: Partial<SearchProvider> = {}): SearchProvider {
  return {
    id,
    title: id.toUpperCase(),
    search: vi.fn((q: string) => Promise.resolve(typeof items === "function" ? items(q) : items.map((i) => result(i)))),
    ...extra,
  };
}

const slot = (p: SearchProvider, limit = 4, fallback = false): Slot => ({ provider: p, limit, fallback });
const ids = (groups: Group[]) => groups.map((g) => `${g.id}:${g.results.map((r) => r.id).join(",")}`);

describe("routeQuery / resolvePrefixes", () => {
  it("matches a prefix alone or followed by a space, case-insensitively", () => {
    const cb = slot(provider("clip", [], { prefix: "cb" }));
    const prefixes = resolvePrefixes([cb]);
    expect(routeQuery("cb", prefixes)).toEqual({ slot: cb, text: "" });
    expect(routeQuery("CB  git push ", prefixes)).toEqual({ slot: cb, text: "git push" });
    expect(routeQuery("cbx", prefixes)).toEqual({ slot: undefined, text: "cbx" });
    expect(routeQuery("  code ", prefixes)).toEqual({ slot: undefined, text: "code" });
  });

  it("prefers the longest prefix", () => {
    const f = slot(provider("files", [], { prefix: "f" }));
    const fx = slot(provider("fx", [], { prefix: "fx" }));
    const prefixes = resolvePrefixes([f, fx]);
    expect(routeQuery("fx rate", prefixes).slot).toBe(fx);
    expect(routeQuery("f rate", prefixes).slot).toBe(f);
  });

  it("drops a duplicate prefix from the later provider and warns", () => {
    const warn = vi.fn();
    const a = slot(provider("a", [], { prefix: "cb" }));
    const b = slot(provider("b", [], { prefix: "CB" }));
    const prefixes = resolvePrefixes([a, b], warn);
    expect(routeQuery("cb x", prefixes).slot).toBe(a);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"b"'));
  });
});

describe("searchAll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const run = async (query: string, slots: Slot[], signal = new AbortController().signal) => {
    const updates: Group[][] = [];
    const done = searchAll(query, slots, signal, (g) => updates.push(g));
    await vi.runAllTimersAsync();
    return { groups: await done, updates };
  };

  it("searches nothing for an empty query", async () => {
    const p = provider("apps", ["a"]);
    const { groups } = await run("   ", [slot(p)]);
    expect(groups).toEqual([]);
    expect(p.search).not.toHaveBeenCalled();
  });

  it("keeps slot order, applies each slot's limit and skips empty groups", async () => {
    const apps = provider("apps", ["a1", "a2", "a3"]);
    const none = provider("none", []);
    const acts = provider("acts", ["x1", "x2"]);
    const { groups } = await run("q", [slot(apps, 2), slot(none), slot(acts, 1)]);
    expect(ids(groups)).toEqual(["apps:a1,a2", "acts:x1"]);
    expect(groups[0].title).toBe("APPS");
  });

  it("sorts by score inside a group and keeps the provider's order for ties", async () => {
    const p = provider("p", () => [result("low", { score: 1 }), result("none"), result("high", { score: 5 }), result("also-none")]);
    const { groups } = await run("q", [slot(p, 10)]);
    expect(ids(groups)).toEqual(["p:high,low,none,also-none"]);
  });

  it("with a prefix searches only that provider, with the rest of the text and a larger limit", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const clip = provider("clip", many, { prefix: "cb", inDefaultResults: false });
    const apps = provider("apps", ["a"]);
    const { groups } = await run("cb git", [slot(apps), slot(clip)]);
    expect(clip.search).toHaveBeenCalledWith("git", expect.anything());
    expect(apps.search).not.toHaveBeenCalled();
    expect(groups).toHaveLength(1);
    expect(groups[0].results).toHaveLength(PREFIX_LIMIT);
  });

  it("leaves prefix-only providers out of default results", async () => {
    const clip = provider("clip", ["c"], { prefix: "cb", inDefaultResults: false });
    const { groups } = await run("git", [slot(clip)]);
    expect(groups).toEqual([]);
    expect(clip.search).not.toHaveBeenCalled();
  });

  it("asks fallback providers only when nothing else matched", async () => {
    const web = provider("web", ["search the web"]);
    const apps = provider("apps", ["a"]);
    const empty = provider("empty", []);
    expect(ids((await run("q", [slot(apps), slot(web, 1, true)])).groups)).toEqual(["apps:a"]);
    expect(web.search).not.toHaveBeenCalled();
    expect(ids((await run("q", [slot(empty), slot(web, 1, true)])).groups)).toEqual(["web:search the web"]);
  });

  it("drops a provider that throws or is slower than the timeout, and aborts it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let slowSignal: AbortSignal | undefined;
    const slow: SearchProvider = {
      id: "slow",
      title: "Slow",
      search: (_q, signal) => {
        slowSignal = signal;
        return new Promise(() => {});
      },
    };
    const broken: SearchProvider = { id: "broken", title: "Broken", search: () => Promise.reject(new Error("boom")) };
    const apps = provider("apps", ["a"]);
    const { groups } = await run("q", [slot(slow), slot(broken), slot(apps)]);
    expect(ids(groups)).toEqual(["apps:a"]);
    expect(slowSignal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("reports groups as each provider finishes, in slot order", async () => {
    let finishFirst: (r: SearchResult[]) => void = () => {};
    const first: SearchProvider = { id: "first", title: "First", search: () => new Promise((r) => (finishFirst = r)) };
    const second = provider("second", ["s"]);
    const updates: Group[][] = [];
    const done = searchAll("q", [slot(first), slot(second)], new AbortController().signal, (g) => updates.push(g));
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.map(ids)).toEqual([["second:s"]]);
    finishFirst([result("f")]);
    await done;
    expect(updates.map(ids).at(-1)).toEqual(["first:f", "second:s"]);
  });

  it("stops reporting once the search is aborted and passes the abort on to providers", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    let finish: (r: SearchResult[]) => void = () => {};
    const p: SearchProvider = {
      id: "p",
      title: "P",
      search: (_q, signal) => {
        seen = signal;
        return new Promise((r) => (finish = r));
      },
    };
    const updates: Group[][] = [];
    const done = searchAll("q", [slot(p)], controller.signal, (g) => updates.push(g));
    controller.abort();
    finish([result("late")]);
    await vi.runAllTimersAsync();
    expect(await done).toEqual([]);
    expect(updates).toEqual([]);
    expect(seen?.aborted).toBe(true);
  });
});
