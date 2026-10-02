import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../shell/settings";
import { ClaudeIcon, ROTATE_MS } from "./ClaudeIcon";
import type { ClaudeSession } from "./native";
import { SessionsCard } from "./SessionsCard";
import { resetForTests as resetApprovals, setForTests as setApprovals } from "./approvals";
import { resetForTests } from "./store";

const { native, saved } = vi.hoisted(() => ({
  saved: { settings: undefined as unknown },
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
vi.mock("../../shell/native", () => ({
  loadSettings: () => Promise.resolve(saved.settings),
  onSettingsChanged: () => () => {},
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
    resetApprovals();
    saved.settings = undefined;
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

  it("counts the subagents a working session has running, and none for an idle one", async () => {
    native.sessions = [
      session({ id: "a", title: "firefish", phase: "tool", tool: "Agent" }),
      session({ id: "c", title: "brain", phase: "idle" }),
    ];
    setApprovals({ agents: { a: 2, c: 1 } });
    render(<SessionsCard />);
    expect(await screen.findByText("+2 agent")).toBeInTheDocument();
    expect(screen.queryByText("+1 agent")).toBeNull();
  });

  it("says what each session is waiting for, finished or stopped on", async () => {
    const at = Date.now() - 6 * 60_000;
    native.sessions = [
      session({ id: "a", title: "firefish", phase: "permission" }),
      session({ id: "b", title: "brain", phase: "idle", startedAt: Date.now() - 3_600_000 }),
      session({ id: "c", title: "blog", phase: "idle" }),
      session({ id: "d", title: "shop", phase: "thinking" }),
    ];
    const ended = { id: "1", sessionId: "b", title: "brain", at };
    setApprovals({
      approvals: [
        {
          id: "r1",
          sessionId: "a",
          title: "firefish",
          tool: "Bash",
          summary: "Bash · git push",
          complete: true,
          detail: "command: git push",
          truncated: false,
          receivedAt: 1,
        },
      ],
      outcomes: {
        b: { ...ended, kind: "finished", summary: "Đã gộp 3 ghi chú trùng" },
        c: { ...ended, sessionId: "c", kind: "failed", reason: "rate_limit" },
        // Left over from the turn before: the session is working again.
        d: { ...ended, sessionId: "d", kind: "finished", summary: "việc cũ" },
      },
    });
    render(<SessionsCard />);
    expect(await screen.findByText("Bash · git push")).toBeInTheDocument();
    expect(screen.getByText(/Chờ duyệt:/)).toBeInTheDocument();
    // Nothing to press on the row: a request is answered where all of it can be seen.
    expect(screen.queryByText("Cho phép")).toBeNull();
    expect(screen.getByText("Đã gộp 3 ghi chú trùng")).toBeInTheDocument();
    expect(screen.getByText(/Xong —/)).toBeInTheDocument();
    expect(screen.getByText("Dừng: chạm giới hạn dùng")).toBeInTheDocument();
    // When it ended, not how long the session has been open.
    expect(screen.getAllByText("6 phút")).toHaveLength(2);
    expect(screen.queryByText(/đã chạy/)).toBeNull();
    expect(screen.queryByText("việc cũ")).toBeNull();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("keeps the reply's line off the row when stop notices are switched off", async () => {
    saved.settings = { ...DEFAULT_SETTINGS, claude: { ...DEFAULT_SETTINGS.claude, stopNotice: false } };
    native.sessions = [session({ id: "b", title: "brain", phase: "idle" })];
    setApprovals({
      outcomes: { b: { id: "1", sessionId: "b", title: "brain", kind: "finished", summary: "bí mật", at: Date.now() } },
    });
    render(<SessionsCard />);
    expect(await screen.findByText("Xong")).toBeInTheDocument();
    expect(screen.queryByText("bí mật")).toBeNull();
  });

  it("opens a terminal in the folder of the row that was clicked", async () => {
    render(<SessionsCard />);
    fireEvent.click(await screen.findByTitle("C:\\brain"));
    await waitFor(() => expect(native.opened).toEqual(["C:\\brain"]));
  });

  it("takes a Desktop row to the Desktop app, never to a terminal", async () => {
    native.sessions = [session({ id: "d", title: "Lauren Claude", source: "desktop" })];
    render(<SessionsCard />);
    fireEvent.click(await screen.findByTitle("Mở Claude Desktop"));
    await waitFor(() => expect(native.desktopOpens).toBe(1));
    expect(native.opened).toEqual([]);
  });

  it("leaves a Desktop row clickable even with no folder", async () => {
    native.sessions = [session({ id: "d", title: "Lauren Claude", source: "desktop" })];
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
