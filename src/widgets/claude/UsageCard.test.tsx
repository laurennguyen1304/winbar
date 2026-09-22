import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShell } from "../../shell/shell";
import { ShellProvider } from "../../shell/shell-context";
import { ClaudeBackground, ClaudePill } from "./ClaudePill";
import type { ClaudeAccountUsage, ClaudeSession, ClaudeUsage } from "./native";
import { resetForTests } from "./store";
import { UsageCard } from "./UsageCard";

const { native } = vi.hoisted(() => ({
  native: {
    usage: { perModel: [], fetchedAt: 0 } as ClaudeUsage,
    accounts: null as ClaudeAccountUsage[] | null,
    /** The CLI never answers, as when it hangs until its timeout. */
    accountsHang: false,
    sessions: [] as ClaudeSession[],
    forced: [] as boolean[],
    /** Number of leading calls that should fail, as they do when Rust has not managed its state yet. */
    failFirst: 0,
  },
}));

vi.mock("./native", () => ({
  NO_USAGE: { perModel: [], fetchedAt: 0 },
  listSessions: () => Promise.resolve(native.sessions),
  extraIcons: () => Promise.resolve({}),
  getUsage: (force: boolean) => {
    native.forced.push(force);
    if (native.failFirst > 0) {
      native.failFirst -= 1;
      return Promise.reject(new Error("state not managed for field `state` on command `claude_usage`"));
    }
    return Promise.resolve(native.usage);
  },
  getAccounts: () => (native.accountsHang ? new Promise(() => {}) : Promise.resolve(native.accounts)),
  onSessionsChanged: () => () => {},
}));

function session(over: Partial<ClaudeSession> & Pick<ClaudeSession, "id">): ClaudeSession {
  return { source: "cli", title: over.id, phase: "idle", lastActiveAt: Date.now(), ...over };
}

describe("UsageCard", () => {
  beforeEach(() => {
    resetForTests();
    native.forced = [];
    native.sessions = [];
    native.failFirst = 0;
    native.accounts = null;
    native.accountsHang = false;
    native.usage = {
      fiveHour: { percent: 52, resetsAt: new Date(Date.now() + 134 * 60_000).toISOString() },
      sevenDay: { percent: 24 },
      perModel: [{ label: "Fable", percent: 9 }],
      fetchedAt: Date.now(),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows both windows, the countdown and the per-model line", async () => {
    render(<UsageCard />);
    expect(await screen.findByText("52")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("Reset sau 2h 14m")).toBeInTheDocument();
    expect(screen.getByText("Fable 9%")).toBeInTheDocument();
  });

  it("colours the bar by how much is gone", async () => {
    native.usage = { ...native.usage, fiveHour: { percent: 93 }, sevenDay: { percent: 80 } };
    render(<UsageCard />);
    await screen.findByText("93");
    const levels = [...document.querySelectorAll("[data-level]")].map((el) => el.getAttribute("data-level"));
    expect(levels).toEqual(["critical", "high"]);
  });

  it("asks for a fresh read when the label is clicked", async () => {
    render(<UsageCard />);
    await screen.findByText("52");
    // Mounting reads the cached answer; only the click bypasses the cache.
    expect(native.forced.every((f) => !f)).toBe(true);
    fireEvent.click(screen.getByLabelText("Cập nhật hạn mức"));
    await waitFor(() => expect(native.forced.at(-1)).toBe(true));
  });

  it("keeps the old numbers after a network blip and says they are old", async () => {
    native.usage = { ...native.usage, error: "network", fetchedAt: Date.now() - 8 * 60_000 };
    render(<UsageCard />);
    expect(await screen.findByText("52")).toBeInTheDocument();
    expect(screen.getByText("Không cập nhật được · số từ 8 phút trước")).toBeInTheDocument();
  });

  it("says so when Claude Code is not signed in, with no numbers", async () => {
    native.usage = { perModel: [], fetchedAt: 0, error: "no-login" };
    render(<UsageCard />);
    expect(await screen.findByText("Chưa đăng nhập Claude Code")).toBeInTheDocument();
    // The meters stay, showing a dash rather than a number nobody fetched.
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("52")).not.toBeInTheDocument();
  });

  it("recovers when the very first read lands before Rust is ready", async () => {
    // The page is alive before setup finishes managing state, so the first call can fail outright. Without a
    // retry the card would sit empty until something else happened to refresh it.
    native.failFirst = 2;
    render(<UsageCard />);
    expect(await screen.findByText("52", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(native.forced.length).toBeGreaterThan(1);
  });

  it("asks for a new login when the token was refused", async () => {
    native.usage = { perModel: [], fetchedAt: 0, error: "auth" };
    render(<UsageCard />);
    expect(await screen.findByText("Cần đăng nhập lại Claude Code")).toBeInTheDocument();
  });

  it("names the active account and shows the others under it", async () => {
    native.accounts = [
      { id: "a", label: "Work", active: true, fiveHour: { percent: 99 }, fetchedAt: Date.now(), needsLogin: false },
      {
        id: "b",
        label: "ja…@example.com",
        active: false,
        fiveHour: { percent: 37, resetsAt: new Date(Date.now() + 60 * 60_000).toISOString() },
        sevenDay: { percent: 21 },
        fetchedAt: Date.now(),
        needsLogin: false,
      },
      {
        id: "c",
        label: "Old",
        active: false,
        fiveHour: { percent: 80, resetsAt: new Date(Date.now() - 60_000).toISOString() },
        fetchedAt: 0,
        needsLogin: true,
      },
    ];
    render(<UsageCard />);
    expect(await screen.findByText("Work")).toBeInTheDocument();
    // The big numbers stay the active account's own read, not the CLI's copy of it.
    expect(screen.getByText("52")).toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.getByText("ja…@example.com")).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("cần đăng nhập lại")).toBeInTheDocument();
    // Its window reset a minute ago: the 80% is gone, not shown as if still true.
    expect(screen.queryByText("80")).not.toBeInTheDocument();
  });

  it("shows the active account's numbers without waiting for the other accounts", async () => {
    native.accountsHang = true;
    render(<UsageCard />);
    expect(await screen.findByText("52")).toBeInTheDocument();
  });

  it("looks as it always did with a single account", async () => {
    native.accounts = [{ id: "a", label: "Only", active: true, fetchedAt: Date.now(), needsLogin: false }];
    render(<UsageCard />);
    expect(await screen.findByText("52")).toBeInTheDocument();
    expect(screen.queryByText("Only")).not.toBeInTheDocument();
  });
});

describe("ClaudePill", () => {
  beforeEach(() => {
    resetForTests();
    native.usage = { fiveHour: { percent: 52 }, perModel: [], fetchedAt: Date.now() };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("speaks for the session that matters most", async () => {
    native.sessions = [
      session({ id: "a", title: "firefish", project: "winbar", phase: "permission" }),
      session({ id: "b", title: "brain" }),
    ];
    render(<ClaudePill />);
    expect(await screen.findByText("wait for you")).toBeInTheDocument();
    expect(screen.getByText("winbar")).toBeInTheDocument();
    expect(screen.getByText("5h 52%")).toBeInTheDocument();
  });

  it("shows nothing at all when only ghosts are left", async () => {
    native.sessions = [session({ id: "ghost", stale: true })];
    const { container } = render(<ClaudePill />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});

describe("ClaudeBackground", () => {
  beforeEach(() => {
    resetForTests();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const hiddenFlags = () => {
    const shell = createShell();
    const calls: Array<[string, boolean]> = [];
    shell.api.setHidden = (id, hidden) => calls.push([id, hidden]);
    return { shell, calls };
  };

  it("hides the widget from the pill while nothing is running", async () => {
    native.sessions = [];
    const { shell, calls } = hiddenFlags();
    render(
      <ShellProvider shell={shell}>
        <ClaudeBackground />
      </ShellProvider>,
    );
    await waitFor(() => expect(calls).toContainEqual(["claude-sessions", true]));
  });

  it("brings it back as soon as a session is alive", async () => {
    native.sessions = [session({ id: "a", phase: "thinking" })];
    const { shell, calls } = hiddenFlags();
    render(
      <ShellProvider shell={shell}>
        <ClaudeBackground />
      </ShellProvider>,
    );
    await waitFor(() => expect(calls.at(-1)).toEqual(["claude-sessions", false]));
  });
});
