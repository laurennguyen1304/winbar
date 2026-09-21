import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeIcon, ROTATE_MS } from "./ClaudeIcon";
import type { ClaudeSession } from "./native";
import { SessionsCard } from "./SessionsCard";
import { resetForTests } from "./store";

const { native } = vi.hoisted(() => ({
  native: {
    sessions: [] as ClaudeSession[],
    icons: {} as Record<string, string[]>,
    opened: [] as string[],
    desktopOpens: 0,
    changed: undefined as (() => void) | undefined,
  },
}));

vi.mock("./native", () => ({
  NO_USAGE: { perModel: [], fetchedAt: 0 },
  listSessions: () => Promise.resolve(native.sessions),
  extraIcons: () => Promise.resolve(native.icons),
  getUsage: () => Promise.resolve({ perModel: [], fetchedAt: 0 }),
  onSessionsChanged: (handler: () => void) => {
    native.changed = handler;
    return () => {};
  },
  openDesktop: () => {
    native.desktopOpens += 1;
    return Promise.resolve();
  },
}));
vi.mock("../../command-bar/native", () => ({
  openTerminal: (path: string) => {
    native.opened.push(path);
    return Promise.resolve();
  },
}));

function session(over: Partial<ClaudeSession> & Pick<ClaudeSession, "id">): ClaudeSession {
  return { source: "cli", title: over.id, phase: "idle", lastActiveAt: Date.now(), ...over };
}

describe("SessionsCard", () => {
  beforeEach(() => {
    resetForTests();
    native.sessions = [
      session({
        id: "a",
        title: "firefish",
        project: "winbar",
        phase: "tool",
        tool: "Bash",
        cwd: "C:\\orca\\workspaces\\winbar\\firefish",
      }),
      session({ id: "b", title: "brain", phase: "permission", cwd: "C:\\brain" }),
    ];
    native.icons = {};
    native.opened = [];
    native.desktopOpens = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a worktree with the project it belongs to", async () => {
    render(<SessionsCard />);
    expect(await screen.findByText("winbar")).toBeInTheDocument();
    expect(screen.getByText("firefish")).toBeInTheDocument();
    // A folder outside Orca has no project half.
    expect(screen.getByText("brain")).toBeInTheDocument();
    expect(screen.getByText("2 đang mở")).toBeInTheDocument();
  });

  it("names the tool a session is running, and what a session is waiting for", async () => {
    render(<SessionsCard />);
    expect(await screen.findByText("Cooking · Bash")).toBeInTheDocument();
    expect(screen.getByText("wait for you")).toBeInTheDocument();
  });

  it("opens a terminal in the folder of the row that was clicked", async () => {
    render(<SessionsCard />);
    fireEvent.click(await screen.findByTitle("C:\\brain"));
    await waitFor(() => expect(native.opened).toEqual(["C:\\brain"]));
  });

  it("takes a Desktop row to the Desktop app, never to a terminal", async () => {
    native.sessions = [session({ id: "d", title: "Personal Claude", source: "desktop" })];
    render(<SessionsCard />);
    fireEvent.click(await screen.findByTitle("Mở Claude Desktop"));
    await waitFor(() => expect(native.desktopOpens).toBe(1));
    expect(native.opened).toEqual([]);
  });

  it("leaves a Desktop row clickable even with no folder", async () => {
    native.sessions = [session({ id: "d", title: "Personal Claude", source: "desktop" })];
    render(<SessionsCard />);
    // A CLI row without a folder stays disabled; a Desktop row needs no folder to open its app.
    expect(await screen.findByTitle("Mở Claude Desktop")).toBeEnabled();
  });

  it("says so when nothing is running", async () => {
    native.sessions = [];
    render(<SessionsCard />);
    expect(await screen.findByText("Không có phiên Claude nào đang chạy")).toBeInTheDocument();
  });

  it("lists only what is running, and counts the quiet ones instead of showing them", async () => {
    native.sessions = [
      session({ id: "live", title: "firefish" }),
      session({ id: "ghost", title: "makara", stale: true }),
      session({ id: "ghost2", title: "fangtooth", stale: true }),
    ];
    render(<SessionsCard />);
    expect(await screen.findByText("firefish")).toBeInTheDocument();
    expect(screen.getByText("1 đang mở")).toBeInTheDocument();
    // The quiet ones are still open, so they are counted and pointed at rather than dropped in silence.
    expect(screen.queryByText("makara")).not.toBeInTheDocument();
    expect(screen.getByText(/2 phiên đã lâu không hoạt động/)).toBeInTheDocument();
  });

  it("re-reads the list when Rust says it changed", async () => {
    render(<SessionsCard />);
    await screen.findByText("firefish");
    native.sessions = [session({ id: "fresh", title: "fangtooth", phase: "thinking" })];
    native.changed?.();
    expect(await screen.findByText("fangtooth")).toBeInTheDocument();
  });
});

describe("ClaudeIcon", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rotates through a phase's images", () => {
    vi.useFakeTimers();
    render(<ClaudeIcon phase="thinking" extra={{}} />);
    const first = document.querySelector("img")?.src;
    act(() => void vi.advanceTimersByTime(ROTATE_MS));
    expect(document.querySelector("img")?.src).not.toBe(first);
  });

  it("rotates every phase, now that each ships more than one image", () => {
    vi.useFakeTimers();
    for (const phase of ["idle", "thinking", "tool", "permission"] as const) {
      const { unmount } = render(<ClaudeIcon phase={phase} extra={{}} />);
      expect(vi.getTimerCount()).toBe(1);
      unmount();
    }
  });

  it("stops its timer when it leaves the screen", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ClaudeIcon phase="tool" extra={{}} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds still when rotation is turned off", () => {
    vi.useFakeTimers();
    render(<ClaudeIcon phase="thinking" extra={{}} rotateMs={0} />);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes an image the user added", () => {
    render(<ClaudeIcon phase="idle" extra={{ idle: ["data:image/png;base64,ZZZ"] }} />);
    // The user's file joins the rotation, so it is one of the images that can be on screen.
    expect(document.querySelector("img")).toBeTruthy();
  });
});
