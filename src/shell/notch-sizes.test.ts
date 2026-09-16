import { describe, expect, it } from "vitest";
import { ALWAYS_SIZES, PANEL_WIDTHS, PILL_SIZES, alertSize, pillRadius } from "./notch-sizes";

describe("notch sizes", () => {
  it("matches the approved defaults", () => {
    expect(PILL_SIZES.m).toEqual({ width: 340, height: 40 });
    expect(ALWAYS_SIZES.m).toEqual({ width: 620, height: 64 });
    expect(PANEL_WIDTHS.m).toBe(780);
  });

  it("derives the alert pill from the regular pill", () => {
    expect(alertSize(PILL_SIZES.m)).toEqual({ width: 490, height: 44 });
  });

  it("rounds pill ends fully", () => {
    expect(pillRadius(PILL_SIZES.l)).toBe(23);
  });
});
