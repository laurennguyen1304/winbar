import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD, clampOffset, passedThreshold } from "./notch-drag";

describe("passedThreshold", () => {
  it("counts a press as a drag only after 6px sideways", () => {
    expect(DRAG_THRESHOLD).toBe(6);
    expect(passedThreshold(5)).toBe(false);
    expect(passedThreshold(-5)).toBe(false);
    expect(passedThreshold(6)).toBe(true);
    expect(passedThreshold(-40)).toBe(true);
  });
});

describe("clampOffset", () => {
  it("keeps the window on the screen and rounds to whole px", () => {
    // 1536 logical px wide (1920 at 125%), window 368: at most 584 either way.
    expect(clampOffset(-120.4, 1536, 368)).toBe(-120);
    expect(clampOffset(900, 1536, 368)).toBe(584);
    expect(clampOffset(-900, 1536, 368)).toBe(-584);
  });

  it("has no room to move when the window is as wide as the screen", () => {
    expect(clampOffset(200, 800, 900)).toBe(0);
  });

  it("stays within the stored range on very wide screens", () => {
    expect(clampOffset(9000, 20000, 368)).toBe(4000);
  });
});
