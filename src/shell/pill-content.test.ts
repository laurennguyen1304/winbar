import { describe, expect, it } from "vitest";
import { pickMidPills, pickPill, pickPills } from "./pill-content";
import type { WidgetDefinition } from "./widget-contract";

const C = () => null;
const w = (id: string, parts: { pill?: boolean; mid?: boolean } = {}): WidgetDefinition => ({
  id,
  tab: "core",
  title: id,
  description: "",
  Card: C,
  Pill: parts.pill ? C : undefined,
  MidPill: parts.mid ? C : undefined,
});

describe("pickPill", () => {
  const widgets = [w("media", { pill: true }), w("claude-sessions", { pill: true }), w("clipboard")];

  it("uses the priority widget when it has pill content", () => {
    expect(pickPill(widgets, "claude-sessions")?.id).toBe("claude-sessions");
  });

  it("falls back to the first widget with pill content", () => {
    expect(pickPill(widgets, "clipboard")?.id).toBe("media");
    expect(pickPill(widgets, undefined)?.id).toBe("media");
  });

  it("is undefined when no widget has pill content", () => {
    expect(pickPill([w("clipboard")], undefined)).toBeUndefined();
  });
});

describe("pickPills", () => {
  const widgets = [w("media", { pill: true }), w("claude-sessions", { pill: true }), w("clipboard")];

  it("carries both when a Claude session and music are on at once, priority first", () => {
    expect(pickPills(widgets, "claude-sessions").map((x) => x.id)).toEqual(["claude-sessions", "media"]);
    expect(pickPills(widgets, "media").map((x) => x.id)).toEqual(["media", "claude-sessions"]);
  });

  it("carries one when only one widget has anything to say", () => {
    // A widget with nothing to show has already taken itself out of the list (ShellApi.setHidden).
    expect(pickPills([w("media", { pill: true }), w("clipboard")], "claude-sessions").map((x) => x.id)).toEqual([
      "media",
    ]);
  });

  it("never carries a third", () => {
    const three = [...widgets, w("system", { pill: true })];
    expect(pickPills(three, "system")).toHaveLength(2);
  });

  it("is empty when nothing has pill content", () => {
    expect(pickPills([w("clipboard")], undefined)).toEqual([]);
  });
});

describe("pickMidPills", () => {
  const widgets = [w("media", { mid: true }), w("clipboard"), w("claude-sessions", { mid: true }), w("usage", { mid: true })];

  it("puts the priority widget first, then the next widget in order", () => {
    expect(pickMidPills(widgets, "claude-sessions").map((x) => x.id)).toEqual(["claude-sessions", "media"]);
  });

  it("uses the order when there is no usable priority", () => {
    expect(pickMidPills(widgets, "clipboard").map((x) => x.id)).toEqual(["media", "claude-sessions"]);
    expect(pickMidPills(widgets, undefined).map((x) => x.id)).toEqual(["media", "claude-sessions"]);
  });

  it("returns a single widget when only one has always-pill content", () => {
    expect(pickMidPills([w("media", { mid: true }), w("clipboard")], "media").map((x) => x.id)).toEqual(["media"]);
  });

  it("returns nothing when no widget has always-pill content", () => {
    expect(pickMidPills([w("clipboard")], undefined)).toEqual([]);
  });
});
