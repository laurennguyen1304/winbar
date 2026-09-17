import { describe, expect, it } from "vitest";
import {
  initialNotchState,
  notchReducer,
  visualState,
  type NotchEvent,
  type NotchState,
  type OpenMode,
} from "./notch-machine";

function run(mode: OpenMode, events: NotchEvent[], from: NotchState = initialNotchState, hasAlert = false) {
  let state = from;
  const effects: string[] = [];
  for (const event of events) {
    const out = notchReducer(state, event, mode, hasAlert);
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

  it("a press cancels the hover timer, so a drag does not open the panel", () => {
    const { state, effects } = run("hover", [{ type: "pointerEnter" }, { type: "pointerDown" }]);
    expect(effects).toEqual(["startHoverTimer", "cancelHoverTimer"]);
    expect(state).toEqual({ expanded: false, hovering: true });
    expect(run("hover", [{ type: "pointerDown" }]).effects).toEqual([]);
    expect(run("click", [{ type: "pointerEnter" }, { type: "pointerDown" }]).effects).toEqual([]);
  });

  it("does not open if the pointer leaves before the delay", () => {
    const { state, effects } = run("hover", [
      { type: "pointerEnter" },
      { type: "pointerLeave" },
      { type: "hoverElapsed" },
    ]);
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

describe("notch machine — always mode with an alert", () => {
  it("keeps the large pill (the alert is drawn inside it) and opens on click", () => {
    expect(visualState(initialNotchState, "always", true)).toBe("always");
    const { state } = run("always", [{ type: "pointerEnter" }, { type: "hoverElapsed" }], initialNotchState, true);
    expect(state.expanded).toBe(false);
    const opened = run("always", [{ type: "clickPill" }], initialNotchState, true).state;
    expect(visualState(opened, "always", true)).toBe("expanded");
    expect(
      visualState(
        notchReducer(opened, { type: "close", reason: "collapseButton" }, "always", true).state,
        "always",
        true,
      ),
    ).toBe("always");
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

describe("notch machine — alert on the pill", () => {
  it("does not start the hover timer while an alert is shown", () => {
    const { state, effects } = run(
      "hover",
      [{ type: "pointerEnter" }, { type: "hoverElapsed" }],
      initialNotchState,
      true,
    );
    expect(effects).toEqual([]);
    expect(state.expanded).toBe(false);
  });

  it("does not open if an alert arrives while the hover delay is running", () => {
    const hovering = run("hover", [{ type: "pointerEnter" }]).state;
    expect(notchReducer(hovering, { type: "hoverElapsed" }, "hover", true).state.expanded).toBe(false);
  });

  it("still opens on click", () => {
    expect(
      run("hover", [{ type: "pointerEnter" }, { type: "clickPill" }], initialNotchState, true).state.expanded,
    ).toBe(true);
  });
});

describe("visualState", () => {
  it("maps state, mode and alerts to what is drawn", () => {
    expect(visualState({ ...initialNotchState }, "hover")).toBe("pill");
    expect(visualState({ ...initialNotchState }, "hover", true)).toBe("alert");
    expect(visualState({ ...initialNotchState }, "click", true)).toBe("alert");
    expect(visualState({ ...initialNotchState }, "always")).toBe("always");
    expect(visualState({ ...initialNotchState, expanded: true }, "click", true)).toBe("expanded");
  });
});
