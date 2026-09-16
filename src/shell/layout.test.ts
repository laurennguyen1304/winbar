import { describe, expect, it } from "vitest";
import { layoutTab } from "./layout";

const w = (id: string, tall = false) => ({ id, layout: { tall } });

describe("layoutTab", () => {
  it("is empty when no widget is enabled", () => {
    expect(layoutTab([])).toEqual({ kind: "empty" });
  });

  it("uses a 2-column grid in order when no widget is tall", () => {
    expect(layoutTab([w("media"), w("system"), w("extra")])).toEqual({ kind: "grid", ids: ["media", "system", "extra"] });
  });

  it("gives a tall widget its own column and stacks the rest in order", () => {
    expect(layoutTab([w("media"), w("clipboard", true), w("system")])).toEqual({
      kind: "columns",
      tall: "clipboard",
      tallFirst: false,
      stack: ["media", "system"],
    });
  });

  it("puts the tall column first when the tall widget comes first", () => {
    expect(layoutTab([w("clipboard", true), w("media")])).toMatchObject({ tallFirst: true, stack: ["media"] });
  });

  it("falls back to the grid when the tall widget is alone", () => {
    expect(layoutTab([w("clipboard", true)])).toEqual({ kind: "grid", ids: ["clipboard"] });
  });

  it("only gives the first tall widget a column; later tall widgets stack", () => {
    expect(layoutTab([w("a", true), w("b", true), w("c")])).toEqual({
      kind: "columns",
      tall: "a",
      tallFirst: true,
      stack: ["b", "c"],
    });
  });
});
