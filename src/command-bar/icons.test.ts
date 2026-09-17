import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appIcon, BATCH, createIconStore, fileIcon, useShellIcon } from "./icons";

describe("icon store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("builds specs for apps, files and folders", () => {
    expect(appIcon("Chrome")).toBe("shell:app:Chrome");
    expect(fileIcon("C:/a.pdf", false)).toBe("shell:file:C:/a.pdf");
    expect(fileIcon("C:/Downloads", true)).toBe("shell:folder:C:/Downloads");
  });

  it("batches requests made together into one call and remembers the answers", async () => {
    const fetch = vi.fn((specs: string[]) => Promise.resolve(specs.map((s) => (s.endsWith("none") ? null : `data:${s}`))));
    const store = createIconStore(fetch);
    store.request("shell:app:a");
    store.request("shell:app:b");
    store.request("shell:app:a");
    store.request("shell:app:none");
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(["shell:app:a", "shell:app:b", "shell:app:none"]);
    expect(store.get("shell:app:a")).toBe("data:shell:app:a");
    expect(store.get("shell:app:none")).toBeNull();
    store.request("shell:app:a");
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("splits large requests into batches of 32", async () => {
    const fetch = vi.fn((specs: string[]) => Promise.resolve(specs.map(() => "data:x")));
    const store = createIconStore(fetch);
    for (let i = 0; i < BATCH + 5; i++) store.request(`shell:app:${i}`);
    await vi.runAllTimersAsync();
    expect(fetch.mock.calls.map((c) => c[0].length)).toEqual([BATCH, 5]);
  });

  it("treats a failed call as no icon instead of asking forever", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(() => Promise.reject(new Error("COM")));
    const store = createIconStore(fetch);
    store.request("shell:file:C:/a.pdf");
    await vi.runAllTimersAsync();
    expect(store.get("shell:file:C:/a.pdf")).toBeNull();
    warn.mockRestore();
  });

  it("re-renders a tile when its icon arrives", async () => {
    const store = createIconStore((specs) => Promise.resolve(specs.map(() => "data:image/png;base64,AAAA")));
    const { result } = renderHook(() => useShellIcon("shell:app:code", store));
    expect(result.current).toBeUndefined();
    await act(async () => void (await vi.runAllTimersAsync()));
    expect(result.current).toBe("data:image/png;base64,AAAA");
  });
});
