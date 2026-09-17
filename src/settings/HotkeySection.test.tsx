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
    render(<HotkeySection />);
    await waitFor(() => expect(screen.getByText("Đang hoạt động")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains when another app holds the shortcut, and retries", async () => {
    native.status = inUse;
    native.retryResult = ok;
    render(<HotkeySection />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("đang bị app khác dùng"));
    expect(screen.getByRole("alert")).toHaveTextContent("yasb");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.getByText("Đang hoạt động")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("follows status events from Rust", async () => {
    native.status = ok;
    render(<HotkeySection />);
    await waitFor(() => expect(native.listeners).toHaveLength(1));
    act(() => native.listeners[0]({ ...inUse, problem: "invalid", message: "bad" }));
    expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
  });
});
