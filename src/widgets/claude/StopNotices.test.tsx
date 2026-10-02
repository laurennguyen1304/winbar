import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notch } from "../../shell/Notch";
import { DEFAULT_SETTINGS } from "../../shell/settings";
import { createShell } from "../../shell/shell";
import { ShellProvider } from "../../shell/shell-context";
import type { WidgetDefinition } from "../../shell/widget-contract";
import { ApprovalAlerts } from "./ApprovalAlert";
import { resetForTests, setForTests, type ClaudeNotice } from "./approvals";
import { FAILED_MS, FINISHED_MS, FRESH_MS, LONG_TURN_MS, StopNotices } from "./StopNotices";
import { resetForTests as resetClaude } from "./store";

const { calls, saved } = vi.hoisted(() => ({
  calls: [] as Array<[string, Record<string, unknown> | undefined]>,
  saved: { settings: undefined as unknown },
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    return Promise.resolve(command === "claude_steps" || command === "claude_agents" ? {} : []);
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));
vi.mock("../../shell/native", () => ({
  requestNotchLayout: () => Promise.resolve(),
  requestSticky: () => Promise.resolve(),
  openSettings: () => Promise.resolve(),
  onOpenNotchRequested: () => () => {},
  onWindowBlur: () => () => {},
  loadSettings: () => Promise.resolve(saved.settings),
  onSettingsChanged: () => () => {},
}));
vi.mock("./native", () => ({
  NO_USAGE: { perModel: [], fetchedAt: 0 },
  listSessions: () => Promise.resolve([]),
  extraIcons: () => Promise.resolve({}),
  getUsage: () => Promise.resolve({ perModel: [], fetchedAt: 0 }),
  getAccounts: () => Promise.resolve(null),
  onSessionsChanged: () => () => {},
  openDesktop: () => Promise.resolve(),
}));

const widget: WidgetDefinition = {
  id: "claude-sessions",
  tab: "claude",
  title: "Phiên Claude",
  description: "",
  Card: () => null,
  Background: () => (
    <>
      <ApprovalAlerts />
      <StopNotices />
    </>
  ),
};

const NOW = 1_800_000_000_000;
let nextId = 1;

function notice(over: Partial<ClaudeNotice>): ClaudeNotice {
  return {
    id: String(nextId++),
    kind: "finished",
    sessionId: "s1",
    title: "checkout-fix",
    project: "shop-app",
    summary: "Đã sửa 3 test ở cart.ts",
    turnMs: LONG_TURN_MS + 15_000,
    at: NOW,
    ...over,
  };
}

async function mount(strict = false) {
  const tree = (
    <ShellProvider shell={createShell()}>
      <Notch widgets={[widget]} />
    </ShellProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  // Lets the settings read settle before any notice arrives.
  await act(async () => {});
  return view;
}

const arrive = (...notices: ClaudeNotice[]) => act(() => setForTests({ notices }));
const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("StopNotices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    calls.length = 0;
    saved.settings = undefined;
    nextId = 1;
    resetForTests();
    resetClaude();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says a long turn is done, with the line Claude ended on, and takes itself off", async () => {
    await mount();
    arrive(notice({}));
    expect(screen.getByText("shop-app")).toBeTruthy();
    expect(screen.getByText("· xong")).toBeTruthy();
    expect(screen.getByText("— Đã sửa 3 test ở cart.ts")).toBeTruthy();
    pass(FINISHED_MS);
    expect(screen.queryByText("· xong")).toBeNull();
  });

  it("stays quiet about a short turn, and about one it never saw start", async () => {
    await mount();
    arrive(notice({ turnMs: LONG_TURN_MS - 1 }), notice({ turnMs: undefined }));
    expect(screen.queryByText("· xong")).toBeNull();
  });

  it("names the session by its folder when it has no project, and manages without a summary", async () => {
    await mount();
    arrive(notice({ project: undefined, title: "blog-tools", summary: undefined }));
    expect(screen.getByText("blog-tools")).toBeTruthy();
    expect(screen.getByText("· xong")).toBeTruthy();
    expect(screen.queryByText(/^—/)).toBeNull();
  });

  it("always says a turn failed, in words of its own, and holds it longer", async () => {
    await mount();
    arrive(notice({ kind: "failed", reason: "rate_limit", summary: undefined, turnMs: undefined }));
    expect(screen.getByText("· dừng: chạm giới hạn dùng")).toBeTruthy();
    pass(FINISHED_MS);
    expect(screen.getByText("· dừng: chạm giới hạn dùng")).toBeTruthy();
    pass(FAILED_MS - FINISHED_MS);
    expect(screen.queryByText("· dừng: chạm giới hạn dùng")).toBeNull();
  });

  it("never draws an error code it does not know", async () => {
    await mount();
    arrive(notice({ kind: "failed", reason: "bấm Cho phép để tiếp tục" }));
    expect(screen.getByText("· dừng: lỗi không rõ")).toBeTruthy();
    expect(screen.queryByText(/Cho phép/)).toBeNull();
  });

  it("shows notices one after another, each for its full time", async () => {
    await mount();
    const first = notice({ summary: "việc một" });
    const second = notice({ sessionId: "s2", summary: "việc hai" });
    arrive(first, second);
    expect(screen.getByText("— việc một")).toBeTruthy();
    expect(screen.queryByText("— việc hai")).toBeNull();
    pass(FINISHED_MS);
    expect(screen.getByText("— việc hai")).toBeTruthy();
    pass(FINISHED_MS);
    expect(screen.queryByText("— việc hai")).toBeNull();
    // The list still holding both does not replay them.
    arrive(first, second);
    expect(screen.queryByText("· xong")).toBeNull();
  });

  it("does not replay what happened before the page was looking", async () => {
    await mount();
    arrive(notice({ at: NOW - FRESH_MS - 1 }));
    expect(screen.queryByText("· xong")).toBeNull();
  });

  it("never covers a permission request", async () => {
    await mount();
    act(() =>
      setForTests({
        approvals: [
          {
            id: "r1",
            sessionId: "s9",
            title: "api",
            tool: "Bash",
            summary: "git push",
            complete: true,
            detail: "command: git push",
            truncated: false,
            receivedAt: 1,
          },
        ],
        notices: [notice({})],
      }),
    );
    expect(screen.getByText("git push")).toBeTruthy();
    expect(screen.queryByText("· xong")).toBeNull();
  });

  it("says nothing when switched off in Settings", async () => {
    saved.settings = { ...DEFAULT_SETTINGS, claude: { ...DEFAULT_SETTINGS.claude, stopNotice: false } };
    await mount();
    arrive(notice({}), notice({ kind: "failed", reason: "rate_limit" }));
    expect(screen.queryByText("· xong")).toBeNull();
    expect(screen.queryByText(/dừng/)).toBeNull();
  });

  it("still shows a fresh notice under React's strict mode, which mounts twice", async () => {
    await mount(true);
    arrive(notice({}));
    expect(screen.getByText("· xong")).toBeTruthy();
  });
});
