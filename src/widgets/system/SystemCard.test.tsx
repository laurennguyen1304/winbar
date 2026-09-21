import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { systemSearch } from "./index";
import { SystemCard } from "./SystemCard";

const { native } = vi.hoisted(() => ({
  native: {
    calls: 0,
    opened: 0,
    fail: false,
    openFails: false,
    cpu: 23.4,
  },
}));
vi.mock("./native", () => ({
  getSystemStats: () => {
    native.calls += 1;
    return native.fail
      ? Promise.reject(new Error("no counters"))
      : Promise.resolve({ cpuPercent: native.cpu, ramUsedBytes: 13_314_398_617, ramTotalBytes: 34_027_474_944 });
  },
  openTaskManager: () => {
    native.opened += 1;
    return native.openFails ? Promise.reject(new Error("từ chối")) : Promise.resolve();
  },
}));

describe("SystemCard", () => {
  beforeEach(() => {
    native.calls = 0;
    native.opened = 0;
    native.fail = false;
    native.openFails = false;
    native.cpu = 23.4;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows CPU and memory with their bars", async () => {
    render(<SystemCard />);
    expect(await screen.findByText("23%")).toBeInTheDocument();
    expect(screen.getByText("12.4 / 31.7 GB")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "CPU" })).toHaveAttribute("aria-valuenow", "23");
    expect(screen.getByRole("progressbar", { name: "RAM" })).toHaveAttribute("aria-valuenow", "39");
  });

  it("reads again every 2 seconds and stops when the card goes away", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const { unmount } = render(<SystemCard />);
    await act(async () => {});
    expect(native.calls).toBe(1);
    native.cpu = 91;
    await act(async () => vi.advanceTimersByTime(2000));
    expect(native.calls).toBe(2);
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "CPU" }).firstElementChild).toHaveAttribute(
      "data-level",
      "critical",
    );
    unmount();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(native.calls).toBe(2);
  });

  it("says so when the stats cannot be read", async () => {
    native.fail = true;
    render(<SystemCard />);
    expect(await screen.findByText("Không đọc được tình trạng máy")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("opens Task Manager and confirms, then clears the note", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    render(<SystemCard />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Task Manager" }));
    await act(async () => {});
    expect(native.opened).toBe(1);
    expect(screen.getByText("Đã mở Task Manager")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(screen.queryByText("Đã mở Task Manager")).not.toBeInTheDocument();
  });

  it("keeps the reason on screen when opening fails", async () => {
    native.openFails = true;
    render(<SystemCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Task Manager" }));
    await waitFor(() => expect(screen.getByText(/Không mở được Task Manager/)).toBeInTheDocument());
  });
});

describe("system search provider", () => {
  beforeEach(() => {
    native.opened = 0;
    native.openFails = false;
  });

  const search = async (query: string) => systemSearch.search(query, new AbortController().signal);

  it("finds Task Manager by name, without diacritics and by 'task'", async () => {
    for (const query of ["task", "Task Manager", "quan ly tac vu", "quản lý", "taskmgr"]) {
      const rows = await search(query);
      expect(
        rows.map((r) => r.title),
        query,
      ).toEqual(["Mở Task Manager"]);
    }
  });

  it("stays out of unrelated searches", async () => {
    for (const query of ["", "a", "spotify", "zzz"]) expect(await search(query)).toEqual([]);
  });

  it("runs the command", async () => {
    const [row] = await search("task");
    await row.run();
    expect(native.opened).toBe(1);
  });
});
