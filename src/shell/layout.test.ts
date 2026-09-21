import { describe, expect, it } from "vitest";
import { bentoLayout, MAX_LARGE } from "./layout";
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
