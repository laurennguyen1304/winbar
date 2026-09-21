import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HotkeyStatus } from "../shell/native";
import { HotkeySection } from "./HotkeySection";

const { native } = vi.hoisted(() => ({
  native: {
    status: undefined as HotkeyStatus | undefined,
    retryResult: undefined as HotkeyStatus | undefined,
    listeners: [] as Array<(s: HotkeyStatus) => void>,
  },
}));

vi.mock("../shell/native", () => ({
  getHotkeyStatus: () => Promise.resolve(native.status),
  retryHotkey: () => Promise.resolve(native.retryResult),
  onHotkeyStatus: (h: (s: HotkeyStatus) => void) => {
    native.listeners.push(h);
    return () => native.listeners.splice(native.listeners.indexOf(h), 1);
  },
}));

const ok: HotkeyStatus = { accelerator: "Ctrl+Space", registered: true, problem: null, message: null };
const inUse: HotkeyStatus = {
  accelerator: "Ctrl+Space",
  registered: false,
  problem: "in-use",
  message: "HotKey already registered",
};

describe("HotkeySection", () => {
  beforeEach(() => {
    native.status = undefined;
    native.retryResult = undefined;
    native.listeners.length = 0;
  });

  it("shows the shortcut as active", async () => {
    native.status = ok;
    render(<HotkeySection accelerator="Ctrl+Space" onChange={() => {}} />);
    // The first render of a file pays for loading the Radix/Tailwind button (seconds under a busy full run).
    await waitFor(() => expect(screen.getByText("Đang hoạt động")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mặc định" })).not.toBeInTheDocument();
  });

  it("explains when another app holds the shortcut, and retries", async () => {
    native.status = inUse;
    native.retryResult = ok;
    render(<HotkeySection accelerator="Ctrl+Space" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("đang bị app khác dùng"));
    expect(screen.getByRole("alert")).toHaveTextContent("YASB");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.getByText("Đang hoạt động")).toBeInTheDocument());
  });

  it("follows status events from Rust", async () => {
    native.status = ok;
    render(<HotkeySection accelerator="Ctrl+Space" onChange={() => {}} />);
    await waitFor(() => expect(native.listeners).toHaveLength(1));
    act(() => native.listeners[0]({ ...inUse, problem: "invalid", message: "bad" }));
    expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
  });

  it("records a new shortcut from the keyboard", async () => {
    native.status = ok;
    const onChange = vi.fn();
    render(<HotkeySection accelerator="Ctrl+Space" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Đổi phím" }));
    expect(screen.getByText("Nhấn tổ hợp phím mới… (Esc để hủy)")).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "ControlLeft", ctrlKey: true });
    fireEvent.keyDown(window, { code: "KeyA" });
    expect(screen.getByText("Cần ít nhất một phím Ctrl, Alt, Shift hoặc Win")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: "Space", altKey: true });
    expect(onChange).toHaveBeenCalledWith("Alt+Space");
    expect(screen.getByRole("button", { name: "Đổi phím" })).toBeInTheDocument();
  });

  it("cancels recording with Escape", () => {
    const onChange = vi.fn();
    render(<HotkeySection accelerator="Ctrl+Space" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Đổi phím" }));
    fireEvent.keyDown(window, { code: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Đổi phím" })).toBeInTheDocument();
  });

  it("offers going back to Ctrl+Space and ignores status for another shortcut", async () => {
    native.status = ok; // still about Ctrl+Space
    const onChange = vi.fn();
    render(<HotkeySection accelerator="Alt+Space" onChange={onChange} />);
    await act(() => Promise.resolve());
    expect(screen.getByText("Đang kiểm tra…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mặc định" }));
    expect(onChange).toHaveBeenCalledWith("Ctrl+Space");
  });
});
