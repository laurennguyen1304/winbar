import { describe, expect, it } from "vitest";
import { formatTime, positionNow } from "./progress";

const base = { status: "playing" as const, positionMs: 60_000, durationMs: 243_000, positionAt: 1_000_000, rate: 1 };

describe("positionNow", () => {
  it("moves on from the reported position while playing", () => {
    expect(positionNow(base, 1_000_000)).toBe(60_000);
    expect(positionNow(base, 1_042_000)).toBe(102_000);
    expect(positionNow({ ...base, rate: 1.5 }, 1_010_000)).toBe(75_000);
  });

  it("stays put when paused, and never runs backwards for a clock older than the report", () => {
    expect(positionNow({ ...base, status: "paused" }, 1_500_000)).toBe(60_000);
    expect(positionNow(base, 999_000)).toBe(60_000);
  });

  it("clamps to the track length", () => {
    expect(positionNow(base, 9_000_000)).toBe(243_000);
    expect(positionNow({ ...base, positionMs: -5 }, 1_000_000)).toBe(0);
  });

  it("has no position without a usable length", () => {
    expect(positionNow({ ...base, durationMs: null }, 1_000_000)).toBeNull();
    expect(positionNow({ ...base, positionMs: null }, 1_000_000)).toBeNull();
  });
});

describe("formatTime", () => {
  it("uses m:ss, and h:mm:ss from one hour", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(102_400)).toBe("1:42");
    expect(formatTime(243_000)).toBe("4:03");
    expect(formatTime(3_600_000)).toBe("1:00:00");
    expect(formatTime(3_725_000)).toBe("1:02:05");
    expect(formatTime(-1)).toBe("0:00");
  });
});
