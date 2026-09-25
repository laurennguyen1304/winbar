import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../shell/settings";
import type { UpdateStatus } from "../update/native";
import { UpdateSection } from "./UpdateSection";

const { native } = vi.hoisted(() => ({
  native: {
    status: null as UpdateStatus | null,
    check: null as UpdateStatus | null,
    fail: false,
    opened: 0,
  },
}));

vi.mock("../update/native", () => ({
  updateStatus: () => Promise.resolve(native.status),
  checkNow: () => (native.fail ? Promise.reject(new Error("boom")) : Promise.resolve(native.check)),
  openChangelog: () => {
    native.opened += 1;
    return Promise.resolve();
  },
}));

const value = DEFAULT_SETTINGS.update;

describe("UpdateSection", () => {
  beforeEach(() => {
    native.status = { current: "0.2.0", checkedAt: 0 };
    native.check = null;
    native.fail = false;
    native.opened = 0;
  });

  it("is on by default and turns off", () => {
    expect(value.check).toBe(true);
    const onChange = vi.fn();
    render(<UpdateSection value={value} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Tự kiểm tra bản mới"));
    expect(onChange).toHaveBeenCalledWith({ check: false });
  });

  it("shows the running version and a known newer one, which opens the changelog", async () => {
    native.status = { current: "0.2.0", latest: "0.3.0", checkedAt: 1 };
    render(<UpdateSection value={value} onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Có bản 0.3.0" }));
    expect(screen.getByText(/Phiên bản 0\.2\.0/)).toBeTruthy();
    expect(native.opened).toBe(1);
  });

  it("says when this is the latest", async () => {
    native.check = { current: "0.2.0", checkedAt: 2 };
    render(<UpdateSection value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra ngay" }));
    expect(await screen.findByText("Đang dùng bản mới nhất")).toBeTruthy();
  });

  it("says when there is a newer one", async () => {
    native.check = { current: "0.2.0", latest: "0.3.0", checkedAt: 2 };
    render(<UpdateSection value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra ngay" }));
    await waitFor(() => expect(screen.getAllByText(/Có bản 0\.3\.0/).length).toBeGreaterThan(0));
  });

  it("says when it could not check, whether Rust answered with an error or not at all", async () => {
    native.check = { current: "0.2.0", checkedAt: 0, error: "network" };
    const { unmount } = render(<UpdateSection value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra ngay" }));
    expect(await screen.findByText("Không kiểm tra được (mất mạng?)")).toBeTruthy();
    unmount();

    native.fail = true;
    render(<UpdateSection value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra ngay" }));
    expect(await screen.findByText("Không kiểm tra được (mất mạng?)")).toBeTruthy();
  });

  it("still checks when the switch is off", async () => {
    native.check = { current: "0.2.0", checkedAt: 2 };
    render(<UpdateSection value={{ check: false }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra ngay" }));
    expect(await screen.findByText("Đang dùng bản mới nhất")).toBeTruthy();
  });
});
