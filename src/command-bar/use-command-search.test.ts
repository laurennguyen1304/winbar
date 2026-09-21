import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../shell/widget-contract";
import type { Slot } from "./search";
import { STALE_MS, useCommandSearch } from "./use-command-search";

const row = (id: string): SearchResult => ({ id, title: id, verb: "Mở", run: () => {} });

/** Answers "fast" at once and anything else after 1 s. */
const slots: Slot[] = [
  {
    limit: 4,
    provider: {
      id: "p",
      title: "P",
      search: (q) => new Promise((resolve) => setTimeout(() => resolve([row(q)]), q === "fast" ? 0 : 1000)),
    },
  },
];

describe("useCommandSearch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("keeps old rows briefly, then clears them while a slow search is still running", async () => {
    const { result, rerender } = renderHook(({ q }) => useCommandSearch(q, slots), { initialProps: { q: "fast" } });
    await advance(10);
    expect(result.current.groups[0].results[0].id).toBe("fast");

    rerender({ q: "slow" });
    await advance(STALE_MS - 50);
    expect(result.current.groups[0].results[0].id).toBe("fast");
    expect(result.current.settled).toBe(false);
    await advance(100);
    expect(result.current.groups).toEqual([]);
    await advance(1000);
    expect(result.current.groups[0].results[0].id).toBe("slow");
    expect(result.current.settled).toBe(true);
  });
});
