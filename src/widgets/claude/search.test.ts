import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeSession, ClaudeUsage } from "./native";
import { createClaudeProvider } from "./search";

const { native } = vi.hoisted(() => ({
  native: { opened: [] as string[], tabs: [] as string[], desktopOpens: 0 },
}));
vi.mock("../../command-bar/native", () => ({
  openTerminal: (path: string) => {
    native.opened.push(path);
    return Promise.resolve();
  },
  openNotch: (tab: string) => {
    native.tabs.push(tab);
    return Promise.resolve();
  },
}));
vi.mock("./native", () => ({
  listSessions: () => Promise.resolve([]),
  getUsage: () => Promise.resolve({}),
  openDesktop: () => {
    native.desktopOpens += 1;
    return Promise.resolve();
  },
}));

function session(over: Partial<ClaudeSession> & Pick<ClaudeSession, "id">): ClaudeSession {
  return { source: "cli", title: over.id, phase: "idle", lastActiveAt: 0, ...over };
}

const SESSIONS: ClaudeSession[] = [
  session({ id: "a", title: "firefish", project: "winbar", phase: "tool", tool: "Bash", cwd: "C:\\wb" }),
  session({ id: "b", title: "makara", project: "acme-theme-v3", cwd: "C:\\qk" }),
  session({ id: "c", title: "Việc cũ", source: "history", turns: 2 }),
];
const USAGE: ClaudeUsage = { fiveHour: { percent: 52 }, sevenDay: { percent: 24 }, perModel: [], fetchedAt: 1 };

const provider = createClaudeProvider(
  () => Promise.resolve(SESSIONS),
  () => Promise.resolve(USAGE),
);
const search = (q: string) => provider.search(q, new AbortController().signal);

describe("claude command bar rows", () => {
  beforeEach(() => {
    native.opened = [];
    native.tabs = [];
    native.desktopOpens = 0;
  });

  it("sends a Desktop session to the Desktop app, and says so on the row", async () => {
    // Its own provider: the shared fixture has no live Desktop session, and past ones never reach the bar.
    const withDesktop = createClaudeProvider(
      () => Promise.resolve([session({ id: "d", title: "Personal Claude", source: "desktop" })]),
      () => Promise.resolve(USAGE),
    );
    const rows = await withDesktop.search("", new AbortController().signal);
    const desktop = rows.find((r) => r.id === "claude-d");
    expect(desktop?.verb).toBe("Claude");
    await desktop?.run();
    expect(native.desktopOpens).toBe(1);
    // A past Desktop session has no folder anyway, and must not try for a terminal.
    expect(native.opened).toEqual([]);
  });

  it("is the Claude group behind the cl prefix", () => {
    expect(provider.id).toBe("claude");
    expect(provider.title).toBe("Claude");
    expect(provider.prefix).toBe("cl");
  });

  it("lists the running sessions and a limits row when the prefix is typed alone", async () => {
    const rows = await search("");
    expect(rows.map((r) => r.title)).toEqual([
      "winbar · firefish",
      "acme-theme-v3 · makara",
      "Hạn mức Claude · 5h 52% · 7d 24%",
    ]);
    // History is not something you can open again, so it stays out.
    expect(rows.some((r) => r.title.includes("Việc cũ"))).toBe(false);
  });

  it("finds a session by project, by worktree, and by the tool it runs", async () => {
    expect((await search("winbar")).map((r) => r.id)).toEqual(["claude-a"]);
    expect((await search("firefish")).map((r) => r.id)).toEqual(["claude-a"]);
    expect((await search("bash")).map((r) => r.id)).toEqual(["claude-a"]);
    // Both worktrees of one project answer to the project name.
    expect((await search("acme")).map((r) => r.id)).toEqual(["claude-b"]);
  });

  it("says what a session is doing in the subtitle", async () => {
    const [row] = await search("firefish");
    expect(row.subtitle).toBe("Cooking · Bash · Claude");
    expect(row.verb).toBe("Terminal");
  });

  it("opens a terminal in the session folder, and the Claude tab for the limits row", async () => {
    const [session] = await search("firefish");
    await session.run();
    expect(native.opened).toEqual(["C:\\wb"]);

    const rows = await search("");
    await rows[rows.length - 1].run();
    expect(native.tabs).toEqual(["claude"]);
  });

  it("never records a row in Gần đây", async () => {
    const rows = await search("");
    expect(rows.every((r) => r.remember === false)).toBe(true);
  });

  it("stays quiet for a single letter", async () => {
    expect(await search("w")).toEqual([]);
  });

  it("returns nothing once the search is abandoned", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await provider.search("winbar", controller.signal)).toEqual([]);
  });
});
