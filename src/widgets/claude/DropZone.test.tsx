import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notch } from "../../shell/Notch";
import { createShell, type Shell } from "../../shell/shell";
import { ShellProvider } from "../../shell/shell-context";
import type { WidgetDefinition } from "../../shell/widget-contract";
import { ApprovalAlerts } from "./ApprovalAlert";
import { resetForTests, setForTests } from "./approvals";
import { DropZone, FAILED_MS, OPENED_MS, REARM_MS } from "./DropZone";
import type { DropEvent } from "./drop";
import { resetForTests as resetClaude } from "./store";

const { calls, drops } = vi.hoisted(() => ({
  calls: [] as Array<[string, Record<string, unknown> | undefined]>,
  drops: { handler: undefined as ((event: { payload: unknown }) => void) | undefined },
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    return Promise.resolve(command === "claude_steps" ? {} : []);
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));
// Rust's drop target, stood in for: the test plays the events it would send to this window.
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    listen: (_name: string, handler: (event: { payload: unknown }) => void) => {
      drops.handler = handler;
      return Promise.resolve(() => {
        drops.handler = undefined;
      });
    },
  }),
}));
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
      <DropZone />
    </>
  ),
};

let shell: Shell;

async function mount(strict = false) {
  shell = createShell();
  const tree = (
    <ShellProvider shell={shell}>
      <Notch widgets={[widget]} />
    </ShellProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  // Lets the listener's promise settle, as it does before any real drag can arrive.
  await act(async () => {});
  return view;
}

function send(event: DropEvent) {
  act(() => drops.handler?.({ payload: event }));
}

const arms = () => calls.filter(([command]) => command === "claude_drop_arm").map(([, args]) => args?.armed);

describe("DropZone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    drops.handler = undefined;
    resetForTests();
    resetClaude();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells Rust this notch takes drops, once more after the page has settled, and no longer when it is gone", async () => {
    const view = await mount();
    expect(arms()).toEqual([true]);
    act(() => void vi.advanceTimersByTime(REARM_MS));
    expect(arms()).toEqual([true, true]);
    view.unmount();
    expect(arms()).toEqual([true, true, false]);
  });

  it("ends up armed under React's strict mode, which mounts twice", async () => {
    await mount(true);
    expect(arms().at(-1)).toBe(true);
  });

  it("shows the held file while it is over the notch and nothing once it leaves", async () => {
    await mount();
    send({ kind: "enter", names: ["báo cáo quý 3.docx"], count: 1 });
    expect(screen.getByText("Thả để hỏi Claude")).toBeTruthy();
    expect(screen.getByText("báo cáo quý 3.docx")).toBeTruthy();
    send({ kind: "leave" });
    expect(screen.queryByText("Thả để hỏi Claude")).toBeNull();
  });

  it("counts the files it has no room to name", async () => {
    await mount();
    send({ kind: "enter", names: ["a.md", "b.pdf", "c.txt"], count: 7 });
    expect(screen.getByText("a.md, b.pdf, c.txt +4")).toBeTruthy();
  });

  it("says why a drag will not be taken, instead of inviting the drop", async () => {
    await mount();
    send({ kind: "enter", names: ["a.txt"], count: 1, refused: "network" });
    expect(screen.getByText("Chỉ nhận file trên máy này, không nhận đường dẫn mạng")).toBeTruthy();
    expect(screen.queryByText("Thả để hỏi Claude")).toBeNull();
  });

  it("names the kinds of file it takes when handed another kind", async () => {
    await mount();
    send({ kind: "enter", names: ["setup.exe"], count: 1, refused: "file-type" });
    expect(screen.getByText("Chỉ nhận PDF, ảnh, CSV, Excel và Word")).toBeTruthy();
    expect(screen.queryByText("Thả để hỏi Claude")).toBeNull();
  });

  it("confirms an opened session briefly", async () => {
    await mount();
    send({ kind: "enter", names: ["a.txt"], count: 1 });
    send({ kind: "opened", names: ["a.txt"], count: 1 });
    expect(screen.getByText("Đang mở Claude")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(OPENED_MS));
    expect(screen.queryByText("Đang mở Claude")).toBeNull();
  });

  it("keeps a failure up long enough to read", async () => {
    await mount();
    send({ kind: "failed", reason: "missing" });
    act(() => void vi.advanceTimersByTime(OPENED_MS));
    expect(screen.getByText("File không còn ở đó")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(FAILED_MS));
    expect(screen.queryByText("File không còn ở đó")).toBeNull();
  });

  it("a new drag is not cut short by the previous outcome's timer", async () => {
    await mount();
    send({ kind: "opened", names: ["a.txt"], count: 1 });
    send({ kind: "enter", names: ["b.txt"], count: 1 });
    act(() => void vi.advanceTimersByTime(OPENED_MS * 2));
    expect(screen.getByText("b.txt")).toBeTruthy();
  });

  it("covers a waiting permission request only while the file is held, and gives the pill back", async () => {
    await mount();
    act(() =>
      setForTests({
        approvals: [
          {
            id: "r1",
            sessionId: "s1",
            title: "checkout-fix",
            project: "shop-app",
            tool: "Bash",
            summary: "npm test -- cart",
            complete: true,
            detail: "command: npm test -- cart",
            truncated: false,
            receivedAt: 1,
          },
        ],
      }),
    );
    expect(screen.getByText("npm test -- cart")).toBeTruthy();
    send({ kind: "enter", names: ["a.txt"], count: 1 });
    expect(screen.getByText("Thả để hỏi Claude")).toBeTruthy();
    expect(screen.queryByText("npm test -- cart")).toBeNull();
    send({ kind: "leave" });
    expect(screen.getByText("npm test -- cart")).toBeTruthy();
    // Nothing answered the request on the way.
    expect(calls.some(([command]) => command === "claude_approval_decide")).toBe(false);
  });
});
