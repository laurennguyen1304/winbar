import { describe, expect, it, vi } from "vitest";
import type { AppEntry } from "../native";
import { createAppsProvider, LIST_TTL_MS } from "./apps";

const APPS: AppEntry[] = [
  { id: "Microsoft.VisualStudioCode", name: "Visual Studio Code", path: "C:/Users/me/AppData/Local/Programs/Microsoft VS Code/Code.exe" },
  { id: "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App", name: "Terminal", path: null },
  { id: "windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel", name: "Settings", path: null },
];

function fakeNative(apps = APPS) {
  return {
    list: vi.fn(() => Promise.resolve(apps)),
    launch: vi.fn(() => Promise.resolve()),
    reveal: vi.fn(() => Promise.resolve()),
  };
}

const signal = () => new AbortController().signal;

describe("apps provider", () => {
  it("ranks apps by name and launches by id", async () => {
    const native = fakeNative();
    const provider = createAppsProvider(native);
    const rows = await provider.search("vsc", signal());
    expect(rows.map((r) => [r.title, r.subtitle, r.icon, r.verb])).toEqual([
      ["Visual Studio Code", "Ứng dụng", "shell:app:Microsoft.VisualStudioCode", "Mở"],
    ]);
    expect(rows[0].score).toBeGreaterThan(0);
    await rows[0].run();
    expect(native.launch).toHaveBeenCalledWith("Microsoft.VisualStudioCode");
  });

  it("offers Ctrl+Enter only for apps with an executable path", async () => {
    const native = fakeNative();
    const provider = createAppsProvider(native);
    const [code] = await provider.search("code", signal());
    await code.runAlt?.();
    expect(native.reveal).toHaveBeenCalledWith("Microsoft.VisualStudioCode");
    const [terminal] = await provider.search("term", signal());
    expect(terminal.runAlt).toBeUndefined();
  });

  it("asks Rust for the list once a minute at most", async () => {
    let clock = 0;
    const native = fakeNative();
    const provider = createAppsProvider(native, () => clock);
    await provider.search("a", signal());
    await provider.search("b", signal());
    expect(native.list).toHaveBeenCalledTimes(1);
    clock = LIST_TTL_MS + 1;
    await provider.search("c", signal());
    expect(native.list).toHaveBeenCalledTimes(2);
  });

  it("tries again after a failed listing", async () => {
    const native = fakeNative();
    native.list.mockRejectedValueOnce(new Error("COM"));
    const provider = createAppsProvider(native);
    await expect(provider.search("code", signal())).rejects.toThrow("COM");
    expect(await provider.search("code", signal())).toHaveLength(1);
  });

  it("records launches and ranks often-used apps first among equal matches", async () => {
    const native = fakeNative([
      { id: "a.Terminal", name: "Terminal", path: null },
      { id: "b.Termius", name: "Termius", path: null },
    ]);
    const record = vi.fn();
    const sortedTitles = async (bonus: (kind: string, id: string) => number) => {
      const rows = await createAppsProvider(native, Date.now, { record, bonus }).search("term", signal());
      return [...rows].sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
    };
    // Same tier: without history the shorter name wins; a used-often app overtakes it.
    expect((await sortedTitles(() => 0)).map((r) => r.title)).toEqual(["Termius", "Terminal"]);
    const sorted = await sortedTitles((_kind, id) => (id === "a.Terminal" ? 300 : 0));
    expect(sorted.map((r) => r.title)).toEqual(["Terminal", "Termius"]);
    await sorted[0].run();
    expect(record).toHaveBeenCalledWith({ kind: "app", target: "a.Terminal", title: "Terminal", subtitle: "Ứng dụng" });
    await sorted[1].runAlt?.();
    expect(record).toHaveBeenCalledTimes(1);
  });
});
