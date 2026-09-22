import { describe, expect, it } from "vitest";
import { bentoLayout, MAX_LARGE, placeSmalls } from "./layout";
import type { WidgetDefinition, WidgetSize } from "./widget-contract";

const w = (id: string, size?: WidgetSize): Pick<WidgetDefinition, "id" | "layout"> => ({
  id,
  layout: size ? { size } : undefined,
});

describe("bentoLayout", () => {
  it("puts the machine's own widgets where the owner asked for them", () => {
    // The real set, in Settings order.
    const layout = bentoLayout([
      w("media", "large"),
      w("clipboard", "medium"),
      w("system", "small"),
      w("claude-sessions", "large"),
      w("claude-usage", "small"),
    ]);
    expect(layout).toEqual({
      large: ["media", "claude-sessions"],
      small: ["system", "claude-usage"],
      medium: ["clipboard"],
    });
  });

  it("gives no tile to a widget that lives elsewhere", () => {
    // The clipboard moved to the command bar: still enabled, just not in the notch.
    const layout = bentoLayout([
      w("media", "large"),
      { id: "clipboard", layout: { size: "medium", inPanel: false } },
      w("system", "small"),
    ]);
    expect(layout).toEqual({ large: ["media"], small: ["system"], medium: [] });
  });

  it("treats a widget that says nothing as small", () => {
    expect(bentoLayout([w("media", "large"), w("quiet")]).small).toEqual(["quiet"]);
  });

  it("drops a third large widget to a full-width row rather than squeezing the others", () => {
    const layout = bentoLayout([w("a", "large"), w("b", "large"), w("c", "large"), w("d", "small")]);
    expect(layout.large).toHaveLength(MAX_LARGE);
    expect(layout.large).toEqual(["a", "b"]);
    expect(layout.medium).toEqual(["c"]);
  });

  it("spreads a lone large widget instead of leaving an empty column beside it", () => {
    expect(bentoLayout([w("only", "large")])).toEqual({ large: [], small: [], medium: ["only"] });
    // With something to sit beside, it keeps its tall tile.
    expect(bentoLayout([w("only", "large"), w("side", "small")]).large).toEqual(["only"]);
  });

  it("keeps the order Settings put them in", () => {
    const layout = bentoLayout([w("second", "medium"), w("first", "medium")]);
    expect(layout.medium).toEqual(["second", "first"]);
  });

  it("has nothing to place when nothing is enabled", () => {
    expect(bentoLayout([])).toEqual({ large: [], small: [], medium: [] });
  });
});

describe("placeSmalls", () => {
  const GAP = 10;

  it("puts a short tile under a short large one and gives the tall one a column", () => {
    // Music 322, sessions 160; the machine 114 and the limits with two accounts 368.
    const placed = placeSmalls(
      [322, 160],
      [
        { id: "system", height: 114 },
        { id: "claude-usage", height: 368 },
      ],
      3,
      GAP,
    );
    expect(placed).toEqual({ "claude-usage": 2, system: 1 });
  });

  it("stacks everything in the free column while nothing has been measured", () => {
    const placed = placeSmalls(
      [0, 0],
      [
        { id: "a", height: 0 },
        { id: "b", height: 0 },
      ],
      3,
      GAP,
    );
    expect(placed).toEqual({ a: 2, b: 2 });
  });

  it("stacks under a small tile when that column still ends highest", () => {
    // x (60) takes the empty column 1. y (55) then weighs column 0 at 100 against column 1 at 60, and stacks under x.
    const placed = placeSmalls(
      [100],
      [
        { id: "x", height: 60 },
        { id: "y", height: 55 },
      ],
      2,
      GAP,
    );
    expect(placed).toEqual({ x: 1, y: 1 });
  });

  it("uses the free column of a single large tile for the tallest small one", () => {
    const placed = placeSmalls(
      [160],
      [
        { id: "system", height: 114 },
        { id: "claude-usage", height: 368 },
      ],
      2,
      GAP,
    );
    expect(placed).toEqual({ "claude-usage": 1, system: 0 });
  });
});
