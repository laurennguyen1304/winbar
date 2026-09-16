import { describe, expect, it } from "vitest";
import { initialNotchState, notchReducer, visualState, type NotchEvent, type NotchState, type OpenMode } from "./notch-machine";

function run(mode: OpenMode, events: NotchEvent[], from: NotchState = initialNotchState) {
  let state = from;
  const effects: string[] = [];
  for (const event of events) {
    const out = notchReducer(state, event, mode);
    state = out.state;
    effects.push(...out.effects);
  }
  return { state, effects };
}

describe("notch machine — hover mode", () => {
  it("starts the hover timer on enter and opens when it elapses", () => {
    const { state, effects } = run("hover", [{ type: "pointerEnter" }, { type: "hoverElapsed" }]);
    expect(effects).toEqual(["startHoverTimer"]);
    expect(state.expanded).toBe(true);
  });

  it("does not open if the pointer leaves before the delay", () => {
    const { state, effects } = run("hover", [{ type: "pointerEnter" }, { type: "pointerLeave" }, { type: "hoverElapsed" }]);
    expect(effects).toEqual(["startHoverTimer", "cancelHoverTimer"]);
    expect(state.expanded).toBe(false);
  });

  it("closes as soon as the pointer leaves an open panel", () => {
    const { state } = run("hover", [{ type: "pointerEnter" }, { type: "hoverElapsed" }, { type: "pointerLeave" }]);
    expect(state.expanded).toBe(false);
  });

  it("opens immediately on click", () => {
    const { state, effects } = run("hover", [{ type: "pointerEnter" }, { type: "clickPill" }]);
    expect(state.expanded).toBe(true);
    expect(effects).toEqual(["startHoverTimer", "cancelHoverTimer"]);
  });

  it("ignores a late hover timer once already open", () => {
    const opened = run("hover", [{ type: "clickPill" }]).state;
    expect(notchReducer(opened, { type: "hoverElapsed" }, "hover").state).toBe(opened);
  });
});

describe("notch machine — click mode", () => {
  it("ignores hover", () => {
    const { state, effects } = run("click", [{ type: "pointerEnter" }, { type: "hoverElapsed" }]);
    expect(state.expanded).toBe(false);
    expect(effects).toEqual([]);
  });

  it("opens on click and stays open when the pointer leaves", () => {
    const { state } = run("click", [{ type: "clickPill" }, { type: "pointerLeave" }]);
    expect(state.expanded).toBe(true);
  });

  it.each(["escape", "collapseButton", "clickOutside"] as const)("closes on %s", (reason) => {
    const { state } = run("click", [{ type: "clickPill" }, { type: "close", reason }]);
    expect(state.expanded).toBe(false);
  });
});

describe("notch machine — always mode", () => {
  it("opens on click, ignores hover, closes back", () => {
    const { state } = run("always", [{ type: "pointerEnter" }, { type: "hoverElapsed" }]);
    expect(state.expanded).toBe(false);
    const opened = run("always", [{ type: "clickPill" }]).state;
    expect(opened.expanded).toBe(true);
    expect(notchReducer(opened, { type: "close", reason: "escape" }, "always").state.expanded).toBe(false);
  });
});

describe("notch machine — mode change", () => {
  it("collapses and cancels any pending hover when the mode changes", () => {
    const hovering = run("hover", [{ type: "pointerEnter" }]).state;
    const out = notchReducer(hovering, { type: "modeChanged" }, "click");
    expect(out.state).toEqual(initialNotchState);
    expect(out.effects).toEqual(["cancelHoverTimer"]);
  });
});

describe("visualState", () => {
  it("maps state and mode to what is drawn", () => {
    expect(visualState({ ...initialNotchState }, "hover")).toBe("pill");
    expect(visualState({ ...initialNotchState }, "always")).toBe("always");
    expect(visualState({ ...initialNotchState, expanded: true }, "click")).toBe("expanded");
  });
});
