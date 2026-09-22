import { describe, expect, it } from "vitest";
import {
  ALWAYS_SIZES,
  PANEL_WIDTHS,
  PILL_SIZES,
  alertSize,
  duoSize,
  panelHeight,
  panelFitWidth,
  panelMaxHeight,
  pillRadius,
} from "./notch-sizes";

describe("notch sizes", () => {
  it("matches the approved defaults", () => {
    expect(PILL_SIZES).toEqual({
      s: { width: 300, height: 32 },
      m: { width: 340, height: 36 },
      l: { width: 400, height: 40 },
    });
    expect(ALWAYS_SIZES.m).toEqual({ width: 620, height: 64 });
    expect(PANEL_WIDTHS.m).toBe(780);
  });

  it("derives the alert pill from the regular pill", () => {
    expect(alertSize(PILL_SIZES.m)).toEqual({ width: 490, height: 40 });
  });

  it("widens the pill when it carries two widgets, and keeps its height", () => {
    expect(duoSize(PILL_SIZES.m)).toEqual({ width: 580, height: 36 });
    expect(duoSize(PILL_SIZES.s)).toEqual({ width: 540, height: 32 });
    // Still narrower than the always-mode bar, which is a different, two-line shape.
    expect(duoSize(PILL_SIZES.l).width).toBeLessThan(ALWAYS_SIZES.l.width);
  });

  it("rounds pill ends fully", () => {
    expect(pillRadius(PILL_SIZES.l)).toBe(20);
  });

  it("sizes the panel to its content within limits", () => {
    expect(panelHeight(300.2, 1080)).toBe(301);
    expect(panelHeight(20, 1080)).toBe(120);
    expect(panelHeight(2000, 1080)).toBe(864);
    expect(panelHeight(500, 0)).toBe(120);
  });

  it("caps the window and the panel content at the same height", () => {
    // These two must agree. When only the window was capped, the content kept growing and every row past the
    // cap sat outside the window — visible, but impossible to click or drag.
    for (const screen of [1080, 1200, 1440, 800, 0]) {
      expect(panelHeight(99_999, screen)).toBe(panelMaxHeight(screen));
    }
    expect(panelMaxHeight(1080)).toBe(864);
    expect(panelMaxHeight(0)).toBe(120);
  });

  it("narrows the panel only on a screen too small for it", () => {
    expect(panelFitWidth(PANEL_WIDTHS.l, 1920)).toBe(860);
    expect(panelFitWidth(PANEL_WIDTHS.l, 853)).toBe(813);
    expect(panelFitWidth(PANEL_WIDTHS.m, 200)).toBe(400);
    expect(panelFitWidth(PANEL_WIDTHS.m, 0)).toBe(780);
  });
});
