import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeWidgets, moveWidget, notchPropsFrom, type Settings } from "./settings";
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
    pill: {
      size: "l",
      alwaysSize: "l",
      panelWidth: "s",
      topGap: 40,
      openMode: "click",
      priorityWidget: "media",
      layout: "float",
      material: "dense",
      opacity: 60,
      offsetX: -320,
      sticky: true,
      monitor: "all",
    },
    fontScale: 115,
    widgets: [
      { id: "clipboard", enabled: true },
      { id: "media", enabled: false },
      { id: "system", enabled: true },
    ],
  };

  it("maps layout and material", () => {
    expect(notchPropsFrom(settings, registered)).toMatchObject({
      layout: "float",
      material: "dense",
      offsetX: -320,
      sticky: true,
    });
    expect(notchPropsFrom(DEFAULT_SETTINGS, registered)).toMatchObject({ layout: "attached", material: "liquid" });
  });

  it("maps sizes, gap, mode, priority and font scale", () => {
    const props = notchPropsFrom(settings, registered);
    expect(props.pillSize).toEqual({ width: 400, height: 40 });
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

describe("moveWidget", () => {
  const reg: WidgetDefinition[] = [
    { ...def("media"), tab: "core" },
    { ...def("claude-sessions"), tab: "claude" },
    { ...def("clipboard"), tab: "core" },
    { ...def("claude-usage"), tab: "claude" },
  ];
  const list = reg.map((w) => ({ id: w.id, enabled: true }));
  const ids = (l: { id: string }[]) => l.map((w) => w.id);

  it("swaps with the neighbour of the same tab, skipping other tabs", () => {
    expect(ids(moveWidget(list, "clipboard", -1, reg))).toEqual([
      "clipboard",
      "claude-sessions",
      "media",
      "claude-usage",
    ]);
    expect(ids(moveWidget(list, "claude-sessions", 1, reg))).toEqual([
      "media",
      "claude-usage",
      "clipboard",
      "claude-sessions",
    ]);
  });

  it("does nothing at the ends of a tab or for unknown ids", () => {
    expect(ids(moveWidget(list, "media", -1, reg))).toEqual(ids(list));
    expect(ids(moveWidget(list, "claude-usage", 1, reg))).toEqual(ids(list));
    expect(ids(moveWidget(list, "gone", 1, reg))).toEqual(ids(list));
  });

  it("keeps the enabled flags with their widgets", () => {
    const flagged = [
      { id: "media", enabled: false },
      { id: "clipboard", enabled: true },
    ];
    expect(moveWidget(flagged, "clipboard", -1, reg)).toEqual([
      { id: "clipboard", enabled: true },
      { id: "media", enabled: false },
    ]);
  });
});
