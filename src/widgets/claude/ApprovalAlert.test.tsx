import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notch } from "../../shell/Notch";
import { createShell, type Shell } from "../../shell/shell";
import { ShellProvider } from "../../shell/shell-context";
import type { WidgetDefinition } from "../../shell/widget-contract";
import { ARM_MS, ApprovalAlerts } from "./ApprovalAlert";
import { resetForTests, setForTests, useApprovals, type ClaudeApproval } from "./approvals";
import { SessionsCard } from "./SessionsCard";
import { resetForTests as resetClaude } from "./store";
import type { ClaudeSession } from "./native";

const { calls, native } = vi.hoisted(() => ({
  calls: [] as Array<[string, Record<string, unknown> | undefined]>,
  native: { sessions: [] as unknown[] },
}));

// The store talks to Rust through `invoke`; here every call is recorded and answers nothing.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    return Promise.resolve(command === "claude_steps" ? {} : []);
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));
vi.mock("../../shell/native", () => ({
  requestNotchLayout: () => Promise.resolve(),
  requestSticky: () => Promise.resolve(),
  openSettings: () => Promise.resolve(),
  onOpenNotchRequested: () => () => {},
  onWindowBlur: () => () => {},
  loadSettings: () => Promise.resolve(undefined),
  onSettingsChanged: () => () => {},
}));
vi.mock("./native", () => ({
  NO_USAGE: { perModel: [], fetchedAt: 0 },
  listSessions: () => Promise.resolve(native.sessions),
  extraIcons: () => Promise.resolve({}),
  getUsage: () => Promise.resolve({ perModel: [], fetchedAt: 0 }),
  getAccounts: () => Promise.resolve(null),
  onSessionsChanged: () => () => {},
  openDesktop: () => Promise.resolve(),
}));
vi.mock("../../command-bar/native", () => ({ openTerminal: () => Promise.resolve() }));

/** A short command that is its whole request: the kind the pill may allow by itself. */
function approval(over: Partial<ClaudeApproval> & Pick<ClaudeApproval, "id">): ClaudeApproval {
  return {
    sessionId: "s1",
    title: "checkout-fix",
    project: "shop-app",
    tool: "Bash",
    summary: "npm test -- cart",
    complete: true,
    detail: "command: npm test -- cart\ndescription: Run the cart tests",
    truncated: false,
    receivedAt: 1,
    ...over,
  };
}

const widget: WidgetDefinition = {
  id: "claude-sessions",
  tab: "claude",
  title: "Phiên Claude",
  description: "",
  Card: () => <div>thẻ phiên</div>,
  Pill: () => <span>pill thường</span>,
  Background: ApprovalAlerts,
};

const notch = () => screen.getByTestId("notch");
const sent = (command: string) => calls.filter(([name]) => name === command).map(([, args]) => args);
const arm = () => act(() => void vi.advanceTimersByTime(ARM_MS));

/**
 * jsdom lays nothing out, so every size is 0 and nothing ever overflows. These stand in for a browser: the pill's
 * line is `lineWidth` wide in a 200 px slot, the card's text `textHeight` tall in a 240 px box.
 */
const layout = { lineWidth: 0, textHeight: 0 };
const isLine = (el: Element) => el.getAttribute("title") === "Bấm để xem đầy đủ";
const sizes: Array<[string, (el: Element) => number]> = [
  ["scrollWidth", (el) => (isLine(el) ? layout.lineWidth : 0)],
  ["clientWidth", (el) => (isLine(el) ? 200 : 0)],
  ["scrollHeight", (el) => (el.tagName === "PRE" ? layout.textHeight : 0)],
  ["clientHeight", (el) => (el.tagName === "PRE" ? 240 : 0)],
];

describe("permission requests on the notch", () => {
  let shell: Shell;
  const mount = () =>
    render(
      <ShellProvider shell={shell}>
        <Notch widgets={[widget]} />
      </ShellProvider>,
    );

  beforeEach(() => {
    vi.useFakeTimers();
    shell = createShell();
    resetForTests();
    resetClaude();
    calls.length = 0;
    layout.lineWidth = 0;
    layout.textHeight = 0;
    for (const [name, value] of sizes) {
      Object.defineProperty(HTMLElement.prototype, name, {
        configurable: true,
        get(this: Element) {
          return value(this);
        },
      });
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    // Back to jsdom's own (inherited) getters.
    for (const [name] of sizes) Reflect.deleteProperty(HTMLElement.prototype, name);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("takes the pill, says who is asking and what for, and tells Rust it is on screen", () => {
    mount();
    expect(notch()).toHaveAttribute("data-state", "pill");
    act(() => setForTests({ approvals: [approval({ id: "a1" })] }));
    expect(notch()).toHaveAttribute("data-state", "alert");
    expect(notch()).toHaveStyle({ width: "490px", height: "40px" });
    // Which repository `npm test` is about to run in.
    expect(screen.getByText("shop-app")).toBeInTheDocument();
    expect(screen.getByText("npm test -- cart")).toBeInTheDocument();
    // Without this Rust hands the request back to the terminal after two seconds.
    expect(sent("claude_approval_shown")).toEqual([{ id: "a1" }]);
  });

  it("names the folder when the session has no project", () => {
    mount();
    act(() => setForTests({ approvals: [approval({ id: "a1", project: undefined, title: "blog-tools" })] }));
    expect(screen.getByText("blog-tools")).toBeInTheDocument();
  });

  it("a click already on its way when the pill appears answers nothing", () => {
    mount();
    act(() => setForTests({ approvals: [approval({ id: "a1" })] }));
    const allow = screen.getByRole("button", { name: "Cho phép" });
    expect(allow).toBeDisabled();
    expect(screen.getByRole("button", { name: "Từ chối" })).toBeDisabled();
    fireEvent.click(allow);
    expect(sent("claude_approval_decide")).toEqual([]);
    act(() => void vi.advanceTimersByTime(ARM_MS - 1));
    expect(allow).toBeDisabled();
    act(() => void vi.advanceTimersByTime(1));
    expect(allow).toBeEnabled();
  });

  it("Cho phép on the pill answers allow, once, and the pill goes back to normal", () => {
    mount();
    act(() => setForTests({ approvals: [approval({ id: "a1" })] }));
    arm();
    const allow = screen.getByRole("button", { name: "Cho phép" });
    fireEvent.click(allow);
    fireEvent.click(allow);
    expect(sent("claude_approval_decide")).toEqual([{ id: "a1", decision: "allow" }]);
    expect(notch()).toHaveAttribute("data-state", "pill");
    expect(screen.getByText("pill thường")).toBeInTheDocument();
  });

  it("Từ chối on the pill answers deny", () => {
    mount();
    act(() => setForTests({ approvals: [approval({ id: "a1" })] }));
    arm();
    fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
    expect(sent("claude_approval_decide")).toEqual([{ id: "a1", decision: "deny" }]);
  });

  describe("the pill never offers to allow what it does not show", () => {
    // Real buttons only: the pill as a whole also answers to the button role, for opening the card.
    const pillButtons = () =>
      screen
        .getAllByRole("button")
        .filter((b) => b.tagName === "BUTTON")
        .map((b) => b.textContent);

    it("a request that is more than its one line gets Xem… instead of Cho phép", () => {
      mount();
      // A file about to be written: the line names the file, not what goes into it.
      act(() =>
        setForTests({
          approvals: [approval({ id: "a1", tool: "Write", summary: "Write · a.txt", complete: false })],
        }),
      );
      arm();
      expect(pillButtons()).toEqual(["Từ chối", "Xem…"]);
      fireEvent.click(screen.getByRole("button", { name: "Xem…" }));
      // It opened the card and decided nothing.
      expect(notch()).toHaveAttribute("data-detail", "true");
      expect(sent("claude_approval_decide")).toEqual([]);
    });

    it("a line too long for the pill gets Xem… even when it is the whole request", () => {
      layout.lineWidth = 420;
      mount();
      act(() =>
        setForTests({
          approvals: [approval({ id: "a1", summary: "git push origin checkout-fix --force-with-lease" })],
        }),
      );
      arm();
      expect(pillButtons()).toEqual(["Từ chối", "Xem…"]);
      expect(screen.queryByRole("button", { name: "Cho phép" })).not.toBeInTheDocument();
    });

    it("Xem… works at once: opening the card needs no arming delay", () => {
      mount();
      act(() => setForTests({ approvals: [approval({ id: "a1", complete: false })] }));
      const look = screen.getByRole("button", { name: "Xem…" });
      expect(look).toBeEnabled();
      expect(screen.getByRole("button", { name: "Từ chối" })).toBeDisabled();
      fireEvent.click(look);
      expect(notch()).toHaveAttribute("data-detail", "true");
    });

    it("refusing is always possible from the pill", () => {
      mount();
      act(() => setForTests({ approvals: [approval({ id: "a1", complete: false })] }));
      arm();
      fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
      expect(sent("claude_approval_decide")).toEqual([{ id: "a1", decision: "deny" }]);
    });
  });

  it("several requests queue: the oldest shows, with a count of the rest", () => {
    mount();
    act(() =>
      setForTests({
        approvals: [approval({ id: "a1", summary: "first" }), approval({ id: "a2", summary: "second" })],
      }),
    );
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.queryByText("second")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(sent("claude_approval_shown")).toEqual([{ id: "a1" }, { id: "a2" }]);

    arm();
    fireEvent.click(screen.getByRole("button", { name: "Cho phép" }));
    expect(notch()).toHaveAttribute("data-state", "alert");
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.queryByText("+1")).not.toBeInTheDocument();
    // The second pill is a new arrival under the pointer: it arms on its own clock.
    expect(screen.getByRole("button", { name: "Cho phép" })).toBeDisabled();
    expect(sent("claude_approval_decide")).toEqual([{ id: "a1", decision: "allow" }]);
  });

  it("a request answered somewhere else leaves the pill by itself", () => {
    mount();
    act(() => setForTests({ approvals: [approval({ id: "a1" })] }));
    expect(notch()).toHaveAttribute("data-state", "alert");
    // Rust dropped it: allowed in the terminal, or the hook was stopped.
    act(() => setForTests({ approvals: [] }));
    expect(notch()).toHaveAttribute("data-state", "pill");
    expect(sent("claude_approval_decide")).toEqual([]);
  });

  describe("the full card", () => {
    const open = (request: ClaudeApproval) => {
      mount();
      act(() => setForTests({ approvals: [request] }));
      fireEvent.mouseEnter(notch());
      fireEvent.click(screen.getByText(request.summary));
    };

    it("opens from the text of the pill and shows everything the tool was given", () => {
      open(approval({ id: "a1" }));
      expect(notch()).toHaveAttribute("data-detail", "true");
      expect(notch()).toHaveStyle({ width: "560px" });
      expect(screen.getByText("shop-app")).toBeInTheDocument();
      expect(screen.getByText("· checkout-fix")).toBeInTheDocument();
      expect(screen.getByText("xin dùng Bash")).toBeInTheDocument();
      expect(screen.getByText(/command: npm test -- cart\s+description: Run the cart tests/)).toBeInTheDocument();
      expect(screen.queryByText(/đã bị cắt bớt/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cuộn hết nội dung/)).not.toBeInTheDocument();
      expect(sent("claude_approval_decide")).toEqual([]);
    });

    it("stays while the pointer is away, and answers from its own buttons without the arming delay", () => {
      open(approval({ id: "a1" }));
      fireEvent.mouseLeave(notch());
      act(() => void vi.advanceTimersByTime(5000));
      expect(notch()).toHaveAttribute("data-detail", "true");
      // Opening the card was itself a deliberate click: its buttons are live at once.
      fireEvent.click(screen.getByRole("button", { name: "Cho phép" }));
      expect(sent("claude_approval_decide")).toEqual([{ id: "a1", decision: "allow" }]);
      expect(notch()).toHaveAttribute("data-state", "pill");
    });

    it("content taller than the box has to be scrolled to its end before it can be allowed", () => {
      // 40 lines in a box that shows 12: the last line could be the one that matters.
      layout.textHeight = 800;
      open(approval({ id: "a1", complete: false, detail: `command:\n  echo ok\n${"\n".repeat(38)}  rm -rf ~` }));
      const allow = screen.getByRole("button", { name: "Cho phép" });
      expect(allow).toBeDisabled();
      expect(screen.getByText("Cuộn hết nội dung để bật Cho phép.")).toBeInTheDocument();
      fireEvent.click(allow);
      expect(sent("claude_approval_decide")).toEqual([]);

      const box = document.querySelector("pre") as HTMLPreElement;
      // Halfway is not the end.
      box.scrollTop = 300;
      fireEvent.scroll(box);
      expect(allow).toBeDisabled();
      box.scrollTop = 560;
      fireEvent.scroll(box);
      expect(allow).toBeEnabled();
      expect(screen.queryByText("Cuộn hết nội dung để bật Cho phép.")).not.toBeInTheDocument();
      // Scrolling back up to read again does not take the button away.
      box.scrollTop = 0;
      fireEvent.scroll(box);
      expect(allow).toBeEnabled();
      // Refusing never needed any of that.
      fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
      expect(sent("claude_approval_decide")).toEqual([{ id: "a1", decision: "deny" }]);
    });

    it("content that was cut before it got here cannot be allowed from winbar at all", () => {
      open(approval({ id: "a1", truncated: true, complete: false, detail: "content: xxxx… [đã cắt 9000 ký tự]" }));
      expect(screen.getByText(/không duyệt được từ winbar/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cho phép" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Từ chối" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Để terminal hỏi" })).toBeEnabled();
    });

    it("says so when a tool takes no input at all", () => {
      open(approval({ id: "a1", summary: "mcp__db__status", complete: false, detail: "" }));
      expect(screen.getByText("(tool này không nhận tham số nào)")).toBeInTheDocument();
    });

    it("Để terminal hỏi releases the request without deciding it", () => {
      open(approval({ id: "a1" }));
      fireEvent.click(screen.getByRole("button", { name: "Để terminal hỏi" }));
      expect(sent("claude_approval_decide")).toEqual([{ id: "a1", decision: "release" }]);
      expect(notch()).toHaveAttribute("data-state", "pill");
    });

    it("Thu về pill goes back to the pill and decides nothing", () => {
      open(approval({ id: "a1" }));
      fireEvent.click(screen.getByRole("button", { name: "Thu về pill" }));
      expect(notch()).toHaveAttribute("data-state", "alert");
      expect(sent("claude_approval_decide")).toEqual([]);
    });

    it("draws a hostile command as text, never as markup", () => {
      open(
        approval({
          id: "a1",
          project: "<i>shop</i>",
          tool: "<u>Bash</u>",
          summary: "<img src=x onerror=alert(1)>",
          detail: "command: <b>bold</b>",
        }),
      );
      expect(document.querySelector("img[src='x']")).toBeNull();
      expect(document.querySelector("pre b, header i, header u")).toBeNull();
      expect(screen.getByText("command: <b>bold</b>")).toBeInTheDocument();
      expect(screen.getByText("xin dùng <u>Bash</u>")).toBeInTheDocument();
    });
  });

  it("survives React's strict-mode remount with its alert still on the pill", () => {
    render(
      <StrictMode>
        <ShellProvider shell={shell}>
          <Notch widgets={[widget]} />
        </ShellProvider>
      </StrictMode>,
    );
    act(() => setForTests({ approvals: [approval({ id: "a1" })] }));
    expect(notch()).toHaveAttribute("data-state", "alert");
  });

  it("puts a waiting request on the pill when the page starts with one already there", () => {
    setForTests({ approvals: [approval({ id: "a1" })] });
    render(
      <StrictMode>
        <ShellProvider shell={shell}>
          <Notch widgets={[widget]} />
        </ShellProvider>
      </StrictMode>,
    );
    expect(notch()).toHaveAttribute("data-state", "alert");
    expect(shell.getSnapshot().alert?.id).toBe("claude-approval:a1");
  });

  it("takes its alerts off the pill when the widget is turned off", () => {
    const { rerender } = mount();
    act(() => setForTests({ approvals: [approval({ id: "a1" })] }));
    expect(shell.getSnapshot().alert?.id).toBe("claude-approval:a1");
    rerender(
      <ShellProvider shell={shell}>
        <Notch widgets={[]} />
      </ShellProvider>,
    );
    expect(shell.getSnapshot().alert).toBeUndefined();
  });

  it("starts with nothing waiting", () => {
    function Probe() {
      return <span>{useApprovals().length} waiting</span>;
    }
    render(<Probe />);
    expect(screen.getByText("0 waiting")).toBeInTheDocument();
  });
});

describe("the steps under a working session", () => {
  function session(over: Partial<ClaudeSession> & Pick<ClaudeSession, "id">): ClaudeSession {
    return { source: "cli", title: over.id, phase: "idle", lastActiveAt: Date.now(), ...over };
  }

  beforeEach(() => {
    resetForTests();
    resetClaude();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the last three, with the one in progress marked", async () => {
    native.sessions = [session({ id: "s1", title: "checkout-fix", phase: "tool", tool: "Bash" })];
    render(<SessionsCard />);
    await screen.findByText("checkout-fix");
    act(() =>
      setForTests({ steps: { s1: ["Read · cart.ts", "Grep · applyDiscount", "Edit · cart.ts", "Bash · npm test"] } }),
    );
    const lines = Array.from(screen.getByTestId("steps-s1").children);
    expect(lines.map((l) => l.textContent)).toEqual(["Grep · applyDiscount", "Edit · cart.ts", "Bash · npm test"]);
    expect(lines.map((l) => l.hasAttribute("data-current"))).toEqual([false, false, true]);
  });

  it("marks nothing as in progress while the session is thinking or waiting for you", async () => {
    native.sessions = [session({ id: "s1", title: "checkout-fix", phase: "permission" })];
    render(<SessionsCard />);
    await screen.findByText("checkout-fix");
    act(() => setForTests({ steps: { s1: ["Read · cart.ts"] } }));
    expect(screen.getByTestId("steps-s1").children[0]).not.toHaveAttribute("data-current");
  });

  it("shows no steps for an idle session, or for one that has none", async () => {
    native.sessions = [
      session({ id: "idle", title: "blog-tools", phase: "idle" }),
      session({ id: "fresh", title: "new-one", phase: "thinking" }),
    ];
    render(<SessionsCard />);
    await screen.findByText("blog-tools");
    act(() => setForTests({ steps: { idle: ["Bash · old step"], other: ["Bash · someone else"] } }));
    expect(screen.queryByTestId("steps-idle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("steps-fresh")).not.toBeInTheDocument();
    expect(screen.queryByText("Bash · someone else")).not.toBeInTheDocument();
  });
});
