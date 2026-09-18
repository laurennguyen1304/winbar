import { describe, expect, it } from "vitest";
import type { ClaudeSession } from "./native";
import {
  BUILT_IN_ICONS,
  ago,
  groupSessions,
  iconAt,
  iconsFor,
  phaseLook,
  pillSession,
  rowTime,
  runningFor,
} from "./phase";

function session(over: Partial<ClaudeSession> & Pick<ClaudeSession, "id">): ClaudeSession {
  return { source: "cli", title: over.id, phase: "idle", lastActiveAt: 0, ...over };
}

describe("phaseLook", () => {
  it("reads the way the mockup says", () => {
    expect(phaseLook({ phase: "idle" })).toEqual({ label: "idle", color: "var(--text-faint)" });
    expect(phaseLook({ phase: "thinking" }).label).toBe("Thinking");
    expect(phaseLook({ phase: "permission" })).toEqual({
      label: "wait for you",
      color: "var(--warn)",
    });
  });

  it("names the tool a session is running", () => {
    expect(phaseLook({ phase: "tool", tool: "Bash" }).label).toBe("Cooking · Bash");
    expect(phaseLook({ phase: "tool" }).label).toBe("Cooking");
  });
});

describe("status images", () => {
  it("ships two images for the busy phases and one for the rest", () => {
    expect(BUILT_IN_ICONS.thinking).toHaveLength(2);
    expect(BUILT_IN_ICONS.tool).toHaveLength(2);
    expect(BUILT_IN_ICONS.idle).toHaveLength(1);
  });

  it("appends the user's own images after the bundled ones", () => {
    const extra = { idle: ["data:image/png;base64,AAA", "data:image/png;base64,BBB"] };
    const icons = iconsFor("idle", extra);
    expect(icons).toHaveLength(3);
    expect(icons.slice(1)).toEqual(extra.idle);
    expect(iconsFor("tool", extra)).toEqual(BUILT_IN_ICONS.tool);
  });

  it("cycles through the images and never runs off the end", () => {
    const icons = ["a", "b", "c"];
    expect([0, 1, 2, 3, 4].map((t) => iconAt(icons, t))).toEqual(["a", "b", "c", "a", "b"]);
    // A phase that lost images must not keep an index that no longer exists.
    expect(iconAt(["only"], 7)).toBe("only");
    expect(iconAt([], 3)).toBeUndefined();
  });
});

describe("times on a row", () => {
  const now = 1_000_000_000;

  it("says how long ago a session last spoke", () => {
    expect(ago(now, now)).toBe("vừa xong");
    expect(ago(now - 5 * 60_000, now)).toBe("5 phút");
    expect(ago(now - 3 * 3_600_000, now)).toBe("3 giờ");
    expect(ago(now - 2 * 86_400_000, now)).toBe("2 ngày");
  });

  it("only claims a running time when the hook recorded a start", () => {
    // startedAt is 0 for most sessions on this machine, so this is the common case.
    expect(runningFor({ startedAt: undefined }, now)).toBeUndefined();
    expect(runningFor({ startedAt: 0 }, now)).toBeUndefined();
    expect(runningFor({ startedAt: now - 30_000 }, now)).toBe("vừa mở");
    expect(runningFor({ startedAt: now - 12 * 60_000 }, now)).toBe("đã chạy 12m");
    expect(runningFor({ startedAt: now - 125 * 60_000 }, now)).toBe("đã chạy 2h05");
  });

  it("falls back to last-active when there is no start time", () => {
    expect(rowTime(session({ id: "a", lastActiveAt: now - 120_000 }), now)).toBe("2 phút");
    expect(rowTime(session({ id: "b", startedAt: now - 60_000, lastActiveAt: now }), now)).toBe("đã chạy 1m");
  });
});

describe("grouping", () => {
  const sessions: ClaudeSession[] = [
    session({ id: "live", phase: "tool" }),
    session({ id: "quiet", stale: true }),
    session({ id: "past", source: "history", turns: 3 }),
  ];

  it("splits live, quiet and past sessions", () => {
    const groups = groupSessions(sessions);
    expect(groups.live.map((s) => s.id)).toEqual(["live"]);
    expect(groups.quiet.map((s) => s.id)).toEqual(["quiet"]);
    expect(groups.history.map((s) => s.id)).toEqual(["past"]);
  });

  it("gives the pill the first live session, never a ghost or a past one", () => {
    expect(pillSession(sessions)?.id).toBe("live");
    // With only ghosts and history there is nothing worth showing.
    expect(pillSession(sessions.slice(1))).toBeUndefined();
    expect(pillSession([])).toBeUndefined();
  });
});
