import { describe, expect, it } from "vitest";
import { cssMaxHeight } from "./max-height";

describe("cssMaxHeight", () => {
  it("leaves the height alone when the page draws at the screen's scale", () => {
    expect(cssMaxHeight({ maxHeight: 600, scale: 1.5 }, 1.5)).toBe(600);
  });

  it("gives fewer px when Windows text size makes each one bigger", () => {
    // 100% screen, text size 125%: 600 logical px of room hold 480 of the page's px.
    expect(cssMaxHeight({ maxHeight: 600, scale: 1 }, 1.25)).toBe(480);
  });

  it("trusts the height as it is when a scale is missing or makes no sense", () => {
    expect(cssMaxHeight({ maxHeight: 600 }, 1.25)).toBe(600);
    expect(cssMaxHeight({ maxHeight: 600, scale: 0 }, 1.25)).toBe(600);
    expect(cssMaxHeight({ maxHeight: 600, scale: 1 }, 0)).toBe(600);
  });
});
