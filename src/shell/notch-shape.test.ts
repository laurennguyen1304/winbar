import { describe, expect, it } from "vitest";
import { FLARE, notchShape, stickyHeight, windowSizeFor } from "./notch-shape";

/** Commands of a path as [letter, ...numbers]. */
const commands = (d: string) =>
  d
    .trim()
    .split(/(?=[MHVAZ])/)
    .map((c) => c.trim().split(/\s+/))
    .map(([letter, ...rest]) => [letter, ...rest.map(Number)] as [string, ...number[]]);

describe("notchShape · attached", () => {
  const s = notchShape(340, 40, 20, "attached");

  it("widens the shape box by the flare on both sides", () => {
    expect(s).toMatchObject({ inset: FLARE, width: 340 + 2 * FLARE, height: 40 });
  });

  it("fills one closed outline that starts and ends on the top edge", () => {
    const c = commands(s.fill);
    expect(c[0]).toEqual(["M", 0, 0]);
    expect(c[1]).toEqual(["H", 368]);
    expect(c.at(-1)).toEqual(["Z"]);
    // Concave flares: radius 14, meeting the sides at y = 14.
    expect(c[2]).toEqual(["A", 14, 14, 0, 0, 0, 354, 14]);
    expect(c.at(-2)).toEqual(["A", 14, 14, 0, 0, 0, 0, 0]);
  });

  it("draws the rim as one open line (no segment along the screen edge, no seam at the flares)", () => {
    const c = commands(s.rim);
    expect(c.some(([letter]) => letter === "Z")).toBe(false);
    expect(c.filter(([letter]) => letter === "M")).toHaveLength(1);
    expect(c[0]).toEqual(["M", 0, 0]);
    expect(c.at(-1)).toEqual(["A", 14, 14, 0, 0, 1, 368, 0]);
    // Left side goes straight from the flare to the bottom corner.
    expect(c[1]).toEqual(["A", 14, 14, 0, 0, 1, 14, 14]);
    expect(c[2]).toEqual(["V", 19.5]);
  });

  it("clamps the bottom radius so it never overlaps the flare", () => {
    const tall = commands(notchShape(780, 330, 28, "attached").rim);
    expect(tall[3]).toEqual(["A", 28, 28, 0, 0, 0, 42, 329.5]);
    const short = commands(notchShape(340, 30, 99, "attached").rim);
    expect(short[2]).toEqual(["V", 14]);
    expect(short[3][1]).toBe(15.5);
  });
});

describe("notchShape · float", () => {
  it("is a closed rounded rectangle with no inset", () => {
    const s = notchShape(340, 40, 20, "float");
    expect(s).toMatchObject({ inset: 0, width: 340, height: 40 });
    expect(commands(s.fill)[0]).toEqual(["M", 20, 0]);
    // Rim half a stroke inside the box so the window edge does not cut it.
    expect(commands(s.rim)[0]).toEqual(["M", 20, 0.5]);
    expect(commands(s.rim)[3]).toEqual(["V", 20]);
    expect(commands(s.fill).at(-1)).toEqual(["Z"]);
  });
});

describe("windowSizeFor", () => {
  it("adds room for the flares only when attached", () => {
    expect(windowSizeFor({ width: 340, height: 40 }, "attached")).toEqual({ width: 368, height: 40 });
    expect(windowSizeFor({ width: 340, height: 40 }, "float")).toEqual({ width: 340, height: 40 });
  });
});

describe("stickyHeight", () => {
  it("reserves the collapsed notch, plus the gap when it floats", () => {
    expect(stickyHeight({ width: 340, height: 40 }, "attached", 8)).toBe(40);
    expect(stickyHeight({ width: 620, height: 64 }, "attached", 8)).toBe(64);
    expect(stickyHeight({ width: 300, height: 36 }, "float", 8)).toBe(44);
  });
});
