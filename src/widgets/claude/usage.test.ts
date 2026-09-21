import { describe, expect, it } from "vitest";
import type { ClaudeUsage } from "./native";
import { CRITICAL_PERCENT, HIGH_PERCENT, errorNote, fetchedAgo, level, pillUsage, resetIn } from "./usage";

const NOW = Date.parse("2026-09-18T12:00:00Z");

function usage(over: Partial<ClaudeUsage> = {}): ClaudeUsage {
  return { perModel: [], fetchedAt: NOW, ...over };
}

describe("level", () => {
  it("changes band at 75 and 90", () => {
    expect(level(0)).toBe("normal");
    expect(level(HIGH_PERCENT - 1)).toBe("normal");
    expect(level(HIGH_PERCENT)).toBe("high");
    expect(level(CRITICAL_PERCENT - 1)).toBe("high");
    expect(level(CRITICAL_PERCENT)).toBe("critical");
    expect(level(100)).toBe("critical");
  });
});

describe("resetIn", () => {
  const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

  it("counts down in hours and minutes", () => {
    expect(resetIn(at(134), NOW)).toBe("Reset sau 2h 14m");
    expect(resetIn(at(120), NOW)).toBe("Reset sau 2h");
    expect(resetIn(at(14), NOW)).toBe("Reset sau 14m");
  });

  it("does not count down from the past", () => {
    // A reset time that has passed means nobody has asked since the window rolled over.
    expect(resetIn(at(-30), NOW)).toBe("Đang tính lại");
    expect(resetIn(at(0), NOW)).toBe("Đang tính lại");
  });

  it("says nothing when there is no time to show", () => {
    expect(resetIn(undefined, NOW)).toBe("");
    expect(resetIn("not a date", NOW)).toBe("");
  });
});

describe("fetchedAgo", () => {
  it("reads as a short label", () => {
    expect(fetchedAgo(NOW, NOW)).toBe("vừa cập nhật");
    expect(fetchedAgo(NOW - 5 * 60_000, NOW)).toBe("cập nhật 5 phút trước");
    expect(fetchedAgo(NOW - 3 * 3_600_000, NOW)).toBe("cập nhật 3 giờ trước");
  });

  it("says nothing when there has never been a successful read", () => {
    expect(fetchedAgo(0, NOW)).toBe("");
  });
});

describe("errorNote", () => {
  it("says nothing while everything is fine", () => {
    expect(errorNote(usage({ fiveHour: { percent: 52 } }), NOW)).toBeUndefined();
  });

  it("keeps the old numbers after a network blip and says how old they are", () => {
    const note = errorNote(usage({ error: "network", fiveHour: { percent: 52 }, fetchedAt: NOW - 8 * 60_000 }), NOW);
    expect(note?.hasNumbers).toBe(true);
    expect(note?.text).toBe("Không cập nhật được · số từ 8 phút trước");
  });

  it("does not pretend there are numbers when there are none", () => {
    const note = errorNote(usage({ error: "no-login", fetchedAt: 0 }), NOW);
    expect(note).toEqual({ text: "Chưa đăng nhập Claude Code", hasNumbers: false });
  });

  it("asks for a new login when the token was refused", () => {
    expect(errorNote(usage({ error: "auth", fetchedAt: 0 }), NOW)?.text).toBe("Cần đăng nhập lại Claude Code");
  });
});

describe("pillUsage", () => {
  it("is the five-hour number, or nothing yet", () => {
    expect(pillUsage(usage({ fiveHour: { percent: 52 } }))).toBe("5h 52%");
    expect(pillUsage(usage())).toBe("");
  });
});
