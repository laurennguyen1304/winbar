import { describe, expect, it } from "vitest";
import { formatPercent, formatRam, level, ramPercent } from "./format";

describe("formatRam", () => {
  it("shows used and total in GB with one decimal", () => {
    expect(formatRam(13_314_398_617, 34_027_474_944)).toBe("12.4 / 31.7 GB");
    expect(formatRam(0, 8 * 1024 ** 3)).toBe("0.0 / 8.0 GB");
    expect(formatRam(-5, 1024 ** 3)).toBe("0.0 / 1.0 GB");
  });
});

describe("formatPercent", () => {
  it("rounds, clamps and falls back to a dash", () => {
    expect(formatPercent(23.4)).toBe("23%");
    expect(formatPercent(23.6)).toBe("24%");
    expect(formatPercent(-2)).toBe("0%");
    expect(formatPercent(140)).toBe("100%");
    expect(formatPercent(undefined)).toBe("—");
  });
});

describe("level", () => {
  it("marks 75% as high and 90% as critical", () => {
    expect(level(10)).toBe("normal");
    expect(level(74.9)).toBe("normal");
    expect(level(75)).toBe("high");
    expect(level(89.9)).toBe("high");
    expect(level(90)).toBe("critical");
    expect(level(100)).toBe("critical");
  });
});

describe("ramPercent", () => {
  it("is the share in use, and 0 without a total", () => {
    expect(ramPercent(8 * 1024 ** 3, 32 * 1024 ** 3)).toBe(25);
    expect(ramPercent(40, 32)).toBe(100);
    expect(ramPercent(8, 0)).toBe(0);
  });
});
