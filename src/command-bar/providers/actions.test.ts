import { describe, expect, it, vi } from "vitest";
import { createActionsProvider, runActionById } from "./actions";

function fakeNative(hidden = false) {
  return {
    openNotch: vi.fn(() => Promise.resolve()),
    notchHidden: vi.fn(() => Promise.resolve(hidden)),
    setNotchHidden: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
    quit: vi.fn(() => Promise.resolve()),
  };
}

const signal = () => new AbortController().signal;
const titles = async (query: string, hidden = false) =>
  (await createActionsProvider(fakeNative(hidden)).search(query, signal())).map((r) => r.title);

describe("winbar actions", () => {
  it("matches Vietnamese titles, without diacritics, and English keywords", async () => {
    expect(await titles("cai dat")).toEqual(["Cài đặt winbar"]);
    expect(await titles("settings")).toEqual(["Cài đặt winbar"]);
    expect(await titles("thoat")).toEqual(["Thoát winbar"]);
    expect(await titles("quit")).toEqual(["Thoát winbar"]);
    expect(await titles("claude")).toEqual(["Mở notch · tab Claude"]);
    expect(await titles("zzz")).toEqual([]);
  });

  it("offers hiding or showing the notch depending on its state", async () => {
    expect(await titles("an notch")).toContain("Ẩn notch");
    expect(await titles("hien notch", true)).toContain("Hiện notch");
    expect(await titles("notch", true)).not.toContain("Ẩn notch");
  });

  it("runs each action through Rust", async () => {
    const native = fakeNative();
    const rows = await createActionsProvider(native).search("notch", signal());
    const byId = new Map(rows.map((r) => [r.id, r]));
    await byId.get("open-notch")?.run();
    await byId.get("open-notch-claude")?.run();
    await byId.get("hide-notch")?.run();
    expect(native.openNotch).toHaveBeenNthCalledWith(1);
    expect(native.openNotch).toHaveBeenNthCalledWith(2, "claude");
    expect(native.setNotchHidden).toHaveBeenCalledWith(true);

    const [settings] = await createActionsProvider(native).search("settings", signal());
    await settings.run();
    expect(native.openSettings).toHaveBeenCalled();
  });

  it("never records quitting in recent items", async () => {
    const [quit] = await createActionsProvider(fakeNative()).search("quit", signal());
    expect(quit).toMatchObject({ verb: "Chạy", subtitle: "winbar", remember: false });
  });

  it("stays out of the way for one letter and for loose matches", async () => {
    expect(await titles("a")).toEqual([]);
    expect(await titles("al")).toEqual([]);
    expect(await titles("ot")).toEqual([]);
  });

  it("records actions it runs, except quitting", async () => {
    const record = vi.fn();
    const provider = createActionsProvider(fakeNative(), { record, bonus: () => 0 });
    const [settings] = await provider.search("settings", signal());
    await settings.run();
    const [quit] = await provider.search("quit", signal());
    await quit.run();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({ kind: "action", target: "settings", title: "Cài đặt winbar", subtitle: "winbar" });
  });

  it("runs a remembered action by id, whatever the notch state is now", async () => {
    const native = fakeNative(true);
    await runActionById("hide-notch", native);
    expect(native.setNotchHidden).toHaveBeenCalledWith(true);
    await runActionById("open-notch-claude", native);
    expect(native.openNotch).toHaveBeenCalledWith("claude");
  });
});
