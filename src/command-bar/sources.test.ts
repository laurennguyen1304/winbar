import { describe, expect, it } from "vitest";
import type { SearchProvider, WidgetDefinition } from "../shell/widget-contract";
import { DEFAULT_SETTINGS } from "../shell/settings";
import { ACTIONS_LIMIT, allSlots, APPS_LIMIT, FILES_LIMIT, WIDGET_LIMIT, widgetSlots } from "./sources";

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

  it("puts Apps, Actions and File first, then widgets, the site commands, and Web last as the fallback", () => {
    const slots = allSlots(DEFAULT_SETTINGS, registered);
    expect(slots.map((s) => s.provider.id)).toEqual([
      "apps",
      "winbar-actions",
      "files",
      "clipboard-search",
      "system-search",
      "web-google",
      "web-youtube",
      "web-reddit",
      "web-x",
      "web",
    ]);
    expect(slots.slice(5, 9).map((s) => s.provider.prefix)).toEqual(["/g", "/y", "/r", "/x"]);
    expect(slots.at(-1)).toMatchObject({ limit: 1, fallback: true });
    expect(slots.at(-1)?.provider.prefix).toBe("?");
    expect(slots[0]).toMatchObject({ limit: APPS_LIMIT });
    expect(slots[0].provider.prefix).toBeUndefined();
    expect(slots[1]).toMatchObject({ limit: ACTIONS_LIMIT });
    expect(slots[2]).toMatchObject({ limit: FILES_LIMIT });
    expect(slots[2].provider.prefix).toBe("/f");
  });
});
