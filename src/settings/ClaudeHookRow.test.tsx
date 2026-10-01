import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeHookRow } from "./ClaudeHookRow";
import type { ClaudeHookPreview, ClaudeHookStatus } from "./claude-hook";

const { rust } = vi.hoisted(() => ({
  rust: {
    status: null as ClaudeHookStatus | null,
    preview: null as ClaudeHookPreview | null,
    applied: [] as Array<{ install: boolean; fingerprint: string; stamp: string }>,
    previews: [] as boolean[],
    /** What the next write does: succeed with this backup path, or fail with `error`. */
    backup: "",
    error: null as string | null,
    /** Makes the next preview fail, the way an unreadable settings.json does. */
    previewError: null as string | null,
  },
}));

vi.mock("./claude-hook", () => ({
  hookStatus: () => Promise.resolve(rust.status),
  hookPreview: (install: boolean) => {
    rust.previews.push(install);
    return rust.previewError ? Promise.reject(rust.previewError) : Promise.resolve(rust.preview);
  },
  hookApply: (install: boolean, preview: ClaudeHookPreview) => {
    rust.applied.push({ install, fingerprint: preview.fingerprint, stamp: preview.stamp });
    if (rust.error) return Promise.reject(rust.error);
    rust.status = { state: install ? "installed" : "absent", settingsPath: SETTINGS, listening: true };
    return Promise.resolve(rust.backup);
  },
}));

const SETTINGS = "C:\\Users\\me\\.claude\\settings.json";
const BACKUP = "C:\\Users\\me\\.claude\\settings.json.winbar-20261001-120000.bak";
const DIFF = '  "hooks": {\n+   "Stop": [\n+     "command": "\'C:/Apps/winbar.exe\' --winbar-claude-hook"\n  }\n';

function plan(over: Partial<ClaudeHookPreview> = {}): ClaudeHookPreview {
  return {
    diff: DIFF,
    backupPath: BACKUP,
    settingsPath: SETTINGS,
    fingerprint: "abc123",
    stamp: "20261001-120000",
    reformats: false,
    unchanged: false,
    ...over,
  };
}

describe("ClaudeHookRow", () => {
  beforeEach(() => {
    rust.status = { state: "absent", settingsPath: SETTINGS, listening: true };
    rust.preview = plan();
    rust.applied = [];
    rust.previews = [];
    rust.backup = BACKUP;
    rust.error = null;
    rust.previewError = null;
  });

  it("shows nothing outside the app", async () => {
    rust.status = null;
    const { container } = render(<ClaudeHookRow />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it("offers to install, and writes nothing until the change has been shown and confirmed", async () => {
    render(<ClaudeHookRow />);
    fireEvent.click(await screen.findByRole("button", { name: "Cài hook…" }));

    // The preview: where, what, and where the old file goes.
    expect(await screen.findByText(SETTINGS)).toBeInTheDocument();
    expect(screen.getByText(/--winbar-claude-hook/)).toBeInTheDocument();
    expect(screen.getByText(BACKUP)).toBeInTheDocument();
    expect(rust.previews).toEqual([true]);
    expect(rust.applied).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Ghi vào settings.json" }));
    // The write names the preview it follows: the same file contents, and the backup name that was shown.
    await waitFor(() =>
      expect(rust.applied).toEqual([{ install: true, fingerprint: "abc123", stamp: "20261001-120000" }]),
    );
    const done = await screen.findByText(/Phiên Claude Code đang mở có thể phải mở lại/);
    expect(done).toHaveTextContent(BACKUP);
    expect(screen.getByText(/Đã cài\. Yêu cầu cấp quyền/)).toBeInTheDocument();
    // Installed now: the only thing left to offer is taking it out again.
    expect(screen.getByRole("button", { name: "Gỡ hook…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cài hook…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ghi vào settings.json" })).not.toBeInTheDocument();
  });

  it("Huỷ closes the preview and writes nothing", async () => {
    render(<ClaudeHookRow />);
    fireEvent.click(await screen.findByRole("button", { name: "Cài hook…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Huỷ" }));
    expect(screen.queryByRole("group", { name: "Xem trước thay đổi" })).not.toBeInTheDocument();
    expect(rust.applied).toEqual([]);
  });

  it("removes through the same preview", async () => {
    rust.status = { state: "installed", settingsPath: SETTINGS, listening: true };
    render(<ClaudeHookRow />);
    expect(await screen.findByText(/Đã cài\. Yêu cầu cấp quyền/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cài hook…" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gỡ hook…" }));
    expect(await screen.findByText(/Sẽ gỡ khỏi/)).toBeInTheDocument();
    expect(rust.previews).toEqual([false]);
    fireEvent.click(screen.getByRole("button", { name: "Ghi vào settings.json" }));
    await waitFor(() =>
      expect(rust.applied).toEqual([{ install: false, fingerprint: "abc123", stamp: "20261001-120000" }]),
    );
    expect(await screen.findByText(/Đã gỡ hook của winbar\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cài hook…" })).toBeInTheDocument();
  });

  it("says when the hooks point at another copy of winbar, and offers both ways out", async () => {
    rust.status = { state: "stale", settingsPath: SETTINGS, listening: true };
    render(<ClaudeHookRow />);
    expect(await screen.findByText(/trỏ tới một bản winbar khác/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cài lại…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gỡ hook…" })).toBeInTheDocument();
  });

  it("a file that changed since the preview is not written: the reason and a fresh preview are shown", async () => {
    render(<ClaudeHookRow />);
    fireEvent.click(await screen.findByRole("button", { name: "Cài hook…" }));
    await screen.findByRole("button", { name: "Ghi vào settings.json" });
    rust.error = "settings.json đã đổi sau khi bạn xem trước. Chưa ghi gì; hãy xem lại phần thay đổi.";
    rust.preview = plan({ fingerprint: "new456", stamp: "20261001-120009", diff: "+ fresh\n" });
    fireEvent.click(screen.getByRole("button", { name: "Ghi vào settings.json" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("settings.json đã đổi sau khi bạn xem trước");
    expect(await screen.findByText("+ fresh")).toBeInTheDocument();
    expect(rust.previews).toEqual([true, true]);
    // The next press writes over the file as it is now, not as it was.
    rust.error = null;
    fireEvent.click(screen.getByRole("button", { name: "Ghi vào settings.json" }));
    await waitFor(() =>
      expect(rust.applied.at(-1)).toEqual({ install: true, fingerprint: "new456", stamp: "20261001-120009" }),
    );
  });

  it("a settings file winbar cannot read is reported, with no preview and no write", async () => {
    render(<ClaudeHookRow />);
    await screen.findByRole("button", { name: "Cài hook…" });
    rust.previewError =
      "settings.json không phải JSON hợp lệ (dòng 3, cột 1). Sửa file rồi thử lại; winbar không ghi đè nó.";
    fireEvent.click(screen.getByRole("button", { name: "Cài hook…" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không phải JSON hợp lệ");
    expect(screen.queryByRole("button", { name: "Ghi vào settings.json" })).not.toBeInTheDocument();
    expect(rust.applied).toEqual([]);
  });

  it("says so when the hooks are installed but winbar could not open its end", async () => {
    rust.status = { state: "installed", settingsPath: SETTINGS, listening: false };
    render(<ClaudeHookRow />);
    expect(await screen.findByRole("status")).toHaveTextContent("winbar không mở được kênh nhận hook");
  });

  it("does not warn about the channel while nothing is installed", async () => {
    rust.status = { state: "absent", settingsPath: SETTINGS, listening: false };
    render(<ClaudeHookRow />);
    await screen.findByRole("button", { name: "Cài hook…" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says so when nothing needs changing, and offers no write", async () => {
    rust.preview = plan({ unchanged: true, diff: "  …\n" });
    render(<ClaudeHookRow />);
    fireEvent.click(await screen.findByRole("button", { name: "Cài hook…" }));
    expect(await screen.findByText("Không có gì cần thay đổi.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ghi vào settings.json" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByText("Không có gì cần thay đổi.")).not.toBeInTheDocument();
  });

  it("tells you when there is no file to back up, and when the layout of the file will change", async () => {
    rust.preview = plan({ backupPath: "", reformats: true });
    render(<ClaudeHookRow />);
    fireEvent.click(await screen.findByRole("button", { name: "Cài hook…" }));
    expect(await screen.findByText("Chưa có settings.json: winbar sẽ tạo file mới.")).toBeInTheDocument();
    expect(screen.getByText(/viết lại cả những dòng không hiện ở trên/)).toBeInTheDocument();
  });
});
