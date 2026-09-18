import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShell } from "../../shell/shell";
import { ShellProvider } from "../../shell/shell-context";
import { ClipboardCard } from "./ClipboardCard";
import type { ClipItem, SkipReason } from "./native";
import { resetForTests } from "./store";

const { native } = vi.hoisted(() => ({
  native: {
    items: [] as ClipItem[],
    paused: false,
    copied: [] as string[],
    pinned: [] as Array<[string, boolean]>,
    removed: [] as string[],
    cleared: 0,
    paused_calls: [] as boolean[],
    copyFails: false,
    changed: undefined as (() => void) | undefined,
    skipped: undefined as ((reason: SkipReason) => void) | undefined,
  },
}));

vi.mock("./native", () => ({
  listClips: () => Promise.resolve(native.items),
  clipboardStatus: () => Promise.resolve({ paused: native.paused }),
  clipThumb: () => Promise.resolve("data:image/png;base64,AAA"),
  copyClip: (id: string) => {
    if (native.copyFails) return Promise.reject(new Error("bận"));
    native.copied.push(id);
    return Promise.resolve();
  },
  pinClip: (id: string, pinned: boolean) => {
    native.pinned.push([id, pinned]);
    return Promise.resolve();
  },
  removeClip: (id: string) => {
    native.removed.push(id);
    return Promise.resolve();
  },
  clearClips: () => {
    native.cleared += 1;
    return Promise.resolve(1);
  },
  pauseClipboard: (paused: boolean) => {
    native.paused_calls.push(paused);
    native.paused = paused;
    return Promise.resolve();
  },
  onClipboardChanged: (handler: () => void) => {
    native.changed = handler;
    return () => {};
  },
  onClipboardSkipped: (handler: (reason: SkipReason) => void) => {
    native.skipped = handler;
    return () => {};
  },
}));

function clip(over: Partial<ClipItem> & Pick<ClipItem, "id">): ClipItem {
  return { kind: "text", preview: over.id, at: Date.now(), pinned: false, ...over };
}

const SAMPLE: ClipItem[] = [
  clip({ id: "note", preview: "Gửi lại bản brief cho freelancer" }),
  clip({ id: "url", kind: "link", preview: "https://tauri.app/v2/" }),
  clip({
    id: "shot",
    kind: "image",
    preview: "Ảnh 1920×1080",
    image: { width: 1920, height: 1080, path: "C:/a.png", thumb: "C:/t.png" },
  }),
];

describe("ClipboardCard", () => {
  beforeEach(() => {
    resetForTests();
    native.items = SAMPLE;
    native.paused = false;
    native.copied = [];
    native.pinned = [];
    native.removed = [];
    native.cleared = 0;
    native.paused_calls = [];
    native.copyFails = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists what was copied, with a thumbnail for a picture", async () => {
    render(<ClipboardCard />);
    await screen.findByText("Gửi lại bản brief cho freelancer");
    expect(screen.getByText("https://tauri.app/v2/")).toBeInTheDocument();
    // The picture's thumbnail is fetched per row, so it arrives a tick after the list.
    await waitFor(() => expect(document.querySelector("img")?.src).toContain("data:image/png"));
  });

  it("says so when the history is empty", async () => {
    native.items = [];
    render(<ClipboardCard />);
    expect(await screen.findByText("Chưa có gì trong clipboard")).toBeInTheDocument();
  });

  it("filters by chip and by search, and tells the two empty states apart", async () => {
    render(<ClipboardCard />);
    await screen.findByText("Gửi lại bản brief cho freelancer");

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(screen.queryByText("Gửi lại bản brief cho freelancer")).not.toBeInTheDocument();
    expect(screen.getByText("https://tauri.app/v2/")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    fireEvent.change(screen.getByLabelText("Tìm trong clipboard"), { target: { value: "gui lai" } });
    expect(screen.getByText("Gửi lại bản brief cho freelancer")).toBeInTheDocument();
    expect(screen.queryByText("https://tauri.app/v2/")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tìm trong clipboard"), { target: { value: "khong co gi" } });
    expect(screen.getByText("Không có item khớp")).toBeInTheDocument();
  });

  it("copies an item back and flashes the row", async () => {
    render(<ClipboardCard />);
    const row = await screen.findByTitle("Gửi lại bản brief cho freelancer");
    fireEvent.click(row);
    await waitFor(() => expect(native.copied).toEqual(["note"]));
    expect(await screen.findByText("Đã copy")).toBeInTheDocument();
  });

  it("flashes the collapsed pill too, since the panel is about to close", async () => {
    const shell = createShell();
    const flashed: unknown[] = [];
    shell.api.flashPill = (content) => flashed.push(content);
    render(
      <ShellProvider shell={shell}>
        <ClipboardCard />
      </ShellProvider>,
    );
    fireEvent.click(await screen.findByTitle("https://tauri.app/v2/"));
    await waitFor(() => expect(flashed).toHaveLength(1));
  });

  it("reports a copy that did not work", async () => {
    native.copyFails = true;
    render(<ClipboardCard />);
    fireEvent.click(await screen.findByTitle("https://tauri.app/v2/"));
    expect(await screen.findByText("Không copy được")).toBeInTheDocument();
  });

  it("pins and deletes one item", async () => {
    render(<ClipboardCard />);
    await screen.findByText("Gửi lại bản brief cho freelancer");
    fireEvent.click(screen.getAllByRole("button", { name: "Ghim" })[0]);
    await waitFor(() => expect(native.pinned).toEqual([["note", true]]));
    fireEvent.click(screen.getAllByRole("button", { name: "Xóa item" })[0]);
    await waitFor(() => expect(native.removed).toEqual(["note"]));
  });

  it("asks before clearing everything", async () => {
    render(<ClipboardCard />);
    await screen.findByText("Gửi lại bản brief cho freelancer");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tất cả" }));
    expect(screen.getByText("Xóa hết, trừ mục đã ghim?")).toBeInTheDocument();
    expect(native.cleared).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(native.cleared).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Xóa tất cả" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Xóa tất cả" })[0]);
    await waitFor(() => expect(native.cleared).toBe(1));
  });

  it("turns recording off and shows that it is off", async () => {
    render(<ClipboardCard />);
    const pause = await screen.findByRole("button", { name: /Tạm dừng/ });
    fireEvent.click(pause);
    await waitFor(() => expect(native.paused_calls).toEqual([true]));
    expect(await screen.findByRole("button", { name: /Đang tạm dừng/ })).toBeInTheDocument();
  });

  it("says a sensitive copy was skipped, without saying what", async () => {
    render(<ClipboardCard />);
    await screen.findByText("Gửi lại bản brief cho freelancer");
    native.skipped?.("secret");
    expect(await screen.findByText("Đã bỏ qua một mục nhạy cảm")).toBeInTheDocument();
  });

  it("re-reads the list when Rust says it changed", async () => {
    render(<ClipboardCard />);
    await screen.findByText("Gửi lại bản brief cho freelancer");
    native.items = [clip({ id: "fresh", preview: "vừa copy xong" })];
    native.changed?.();
    expect(await screen.findByText("vừa copy xong")).toBeInTheDocument();
  });
});
