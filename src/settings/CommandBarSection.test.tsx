import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileSearchStatus } from "../command-bar/native";
import { DEFAULT_SETTINGS } from "../shell/settings";
import { CommandBarSection, fileStatusText } from "./CommandBarSection";

const { native } = vi.hoisted(() => ({
  native: { status: vi.fn(() => Promise.resolve(undefined as FileSearchStatus | undefined)) },
}));

vi.mock("../command-bar/native", () => ({ getFileSearchStatus: native.status }));

const windowsOnly: FileSearchStatus = { everything: false, windows: true, active: "windows" };

describe("fileStatusText", () => {
  it("names the source in use and explains when there is none", () => {
    expect(fileStatusText("auto", undefined)).toBe("Đang kiểm tra nguồn tìm file…");
    expect(fileStatusText("auto", { everything: true, windows: true, active: "everything" })).toMatch(/^Đang dùng Everything/);
    expect(fileStatusText("auto", windowsOnly)).toMatch(/^Đang dùng Windows Search \(Everything không chạy\)/);
    expect(fileStatusText("windows", windowsOnly)).toMatch(/^Đang dùng Windows Search ·/);
    expect(fileStatusText("everything", { everything: false, windows: true, active: null })).toBe(
      "Không có nguồn file: Everything đang không chạy",
    );
    expect(fileStatusText("off", windowsOnly)).toBe("Command bar không tìm file");
  });
});

describe("CommandBarSection", () => {
  beforeEach(() => native.status.mockReset().mockImplementation(() => Promise.resolve(windowsOnly)));

  it("changes the file source, asks for the status again, and shows it", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<CommandBarSection value={DEFAULT_SETTINGS.commandBar} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText(/Đang dùng Windows Search \(Everything không chạy\)/)).toBeInTheDocument());
    const group = screen.getByRole("radiogroup", { name: "Nguồn tìm file" });
    fireEvent.click(within(group).getByRole("radio", { name: "Everything" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS.commandBar, fileSearch: "everything" });

    native.status.mockImplementation(() => Promise.resolve({ everything: false, windows: true, active: null }));
    rerender(<CommandBarSection value={{ ...DEFAULT_SETTINGS.commandBar, fileSearch: "everything" }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText("Không có nguồn file: Everything đang không chạy")).toBeInTheDocument());
    expect(native.status).toHaveBeenCalledTimes(2);
  });

  it("changes the preferred web engine", () => {
    const onChange = vi.fn();
    render(<CommandBarSection value={DEFAULT_SETTINGS.commandBar} onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "Trang tìm web ưu tiên" });
    expect(within(group).getByRole("radio", { name: "Google" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(group).getByRole("radio", { name: "YouTube" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS.commandBar, webSearch: "youtube" });
  });

  it("resets a dragged position, and is disabled when there is none", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CommandBarSection value={DEFAULT_SETTINGS.commandBar} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Đặt lại vị trí" })).toBeDisabled();
    const dragged = { ...DEFAULT_SETTINGS.commandBar, position: { x: 247, y: 470 } };
    rerender(<CommandBarSection value={dragged} onChange={onChange} />);
    expect(screen.getByText("Mở ở chỗ bạn đã kéo tới")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại vị trí" }));
    expect(onChange).toHaveBeenCalledWith({ ...dragged, position: null });
  });
});
