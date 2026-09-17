import { describe, expect, it } from "vitest";
import type { SearchProvider, WidgetDefinition } from "../shell/widget-contract";
import { WIDGET_LIMIT, widgetSlots } from "./sources";

const provider = (id: string): SearchProvider => ({ id, title: id, search: () => Promise.resolve([]) });
const widget = (id: string, withProvider: boolean): WidgetDefinition => ({
  id,
  tab: "core",
  title: id,
  description: "",
  Card: () => null,
  searchProvider: withProvider ? provider(`${id}-search`) : undefined,
});

describe("widgetSlots", () => {
  const registered = [widget("media", false), widget("clipboard", true), widget("system", true)];

  it("uses enabled widgets that have a provider, in the stored order", () => {
    const slots = widgetSlots(
      [
        { id: "system", enabled: true },
        { id: "media", enabled: true },
        { id: "clipboard", enabled: true },
      ],
      registered,
    );
    expect(slots.map((s) => s.provider.id)).toEqual(["system-search", "clipboard-search"]);
    expect(slots.every((s) => s.limit === WIDGET_LIMIT && !s.fallback)).toBe(true);
  });

  it("leaves out disabled widgets and includes widgets new since the settings were saved", () => {
    const slots = widgetSlots([{ id: "clipboard", enabled: false }], registered);
    expect(slots.map((s) => s.provider.id)).toEqual(["system-search"]);
  });
});
