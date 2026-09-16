import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeWidgets, notchPropsFrom, type Settings } from "./settings";
import type { WidgetDefinition } from "./widget-contract";

const C = () => null;
const def = (id: string): WidgetDefinition => ({ id, tab: "core", title: id, description: "", Card: C });
const registered = [def("media"), def("system"), def("clipboard")];

describe("mergeWidgets", () => {
  it("adds every registered widget, enabled, when nothing is stored", () => {
    expect(mergeWidgets([], registered)).toEqual([
      { id: "media", enabled: true },
      { id: "system", enabled: true },
      { id: "clipboard", enabled: true },
    ]);
  });

  it("keeps the stored order and flags, drops unknown ids, appends new widgets", () => {
    const stored = [
      { id: "clipboard", enabled: false },
      { id: "gone", enabled: true },
      { id: "media", enabled: true },
    ];
    expect(mergeWidgets(stored, registered)).toEqual([
      { id: "clipboard", enabled: false },
      { id: "media", enabled: true },
      { id: "system", enabled: true },
    ]);
  });
});

describe("notchPropsFrom", () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    pill: { size: "l", alwaysSize: "l", panelWidth: "s", topGap: 40, openMode: "click", priorityWidget: "media" },
    fontScale: 115,
    widgets: [
      { id: "clipboard", enabled: true },
      { id: "media", enabled: false },
      { id: "system", enabled: true },
    ],
  };

  it("maps sizes, gap, mode, priority and font scale", () => {
    const props = notchPropsFrom(settings, registered);
    expect(props.pillSize).toEqual({ width: 400, height: 46 });
    expect(props.alwaysSize).toEqual({ width: 700, height: 76 });
    expect(props.panelWidth).toBe(720);
    expect(props.topGap).toBe(40);
    expect(props.mode).toBe("click");
    expect(props.priorityWidget).toBe("media");
    expect(props.fontScale).toBeCloseTo(1.15);
  });

  it("passes only enabled widgets, in the stored order", () => {
    expect(notchPropsFrom(settings, registered).widgets.map((w) => w.id)).toEqual(["clipboard", "system"]);
  });

  it("treats registered widgets missing from the file as enabled at the end", () => {
    const partial = { ...settings, widgets: [{ id: "system", enabled: true }] };
    expect(notchPropsFrom(partial, registered).widgets.map((w) => w.id)).toEqual(["system", "media", "clipboard"]);
  });
});
