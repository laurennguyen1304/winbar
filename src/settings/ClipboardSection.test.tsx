import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardSection } from "./ClipboardSection";
import { DEFAULT_IGNORED_APPS, DEFAULT_SETTINGS } from "../shell/settings";

const { native } = vi.hoisted(() => ({ native: { cleared: 0 } }));
vi.mock("../widgets/clipboard/native", () => ({
  clearClips: () => {
    native.cleared += 1;
    return Promise.resolve(7);
  },
}));

const value = DEFAULT_SETTINGS.clipboard;

describe("ClipboardSection", () => {
  beforeEach(() => {
    native.cleared = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("changes how long the history is kept", () => {
    const onChange = vi.fn();
    render(<ClipboardSection value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "2 ngày" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, retentionDays: 2 });
  });

  it("turns recording off and says so", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ClipboardSection value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Đang ghi" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, paused: true });
    rerender(<ClipboardSection value={{ ...value, paused: true }} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Đang tạm dừng" })).toBeInTheDocument();
  });

  it("lists the password managers it skips by default", () => {
    render(<ClipboardSection value={value} onChange={vi.fn()} />);
    for (const app of DEFAULT_IGNORED_APPS) expect(screen.getByText(app)).toBeInTheDocument();
  });

  it("adds an app, lower-cased, and refuses a duplicate", () => {
    const onChange = vi.fn();
    render(<ClipboardSection value={value} onChange={onChange} />);
    const input = screen.getByLabelText("Thêm app vào danh sách bỏ qua");

    fireEvent.change(input, { target: { value: "  Enpass  " } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, ignoredApps: [...DEFAULT_IGNORED_APPS, "enpass"] });

    onChange.mockClear();
    fireEvent.change(input, { target: { value: "bitwarden" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes one app from the list", () => {
    const onChange = vi.fn();
    render(<ClipboardSection value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lastpass" }));
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      ignoredApps: DEFAULT_IGNORED_APPS.filter((a) => a !== "lastpass"),
    });
  });

  it("puts the default list back", () => {
    const onChange = vi.fn();
    render(<ClipboardSection value={{ ...value, ignoredApps: ["chrome"] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại mặc định" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, ignoredApps: DEFAULT_IGNORED_APPS });
  });

  it("asks before wiping the history, and reports what went", async () => {
    render(<ClipboardSection value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Xóa toàn bộ" }));
    expect(native.cleared).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(native.cleared).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Xóa toàn bộ" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa hết" }));
    await waitFor(() => expect(native.cleared).toBe(1));
    expect(await screen.findByText("Đã xóa 7 mục.")).toBeInTheDocument();
  });
});
