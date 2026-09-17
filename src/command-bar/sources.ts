// Which providers the command bar asks, in group order (SPEC-command-bar §5.4). Built-in sources join in later tasks.
import { mergeWidgets, type Settings, type WidgetSetting } from "../shell/settings";
import type { WidgetDefinition } from "../shell/widget-contract";
import { createAppsProvider } from "./providers/apps";
import { createFilesProvider } from "./providers/files";
import { createEngineProvider, createWebProvider, ENGINES, type EngineId } from "./providers/web";
import type { Slot } from "./search";

/** Rows per group without a prefix (SPEC-command-bar §5.4). */
export const APPS_LIMIT = 6;
export const FILES_LIMIT = 4;

const apps: Slot = { provider: createAppsProvider(), limit: APPS_LIMIT };

/** Built-in sources, created once for the window: the files provider numbers its requests. */
const files: Slot = { provider: createFilesProvider(), limit: FILES_LIMIT };

/** Rows per widget group without a prefix. */
export const WIDGET_LIMIT = 4;

/** Search providers of enabled widgets, in the order set in Settings › Widget. */
export function widgetSlots(stored: readonly WidgetSetting[], registered: readonly WidgetDefinition[]): Slot[] {
  const byId = new Map(registered.map((w) => [w.id, w]));
  return mergeWidgets(stored, registered)
    .filter((w) => w.enabled)
    .flatMap((w) => {
      const provider = byId.get(w.id)?.searchProvider;
      return provider ? [{ provider, limit: WIDGET_LIMIT }] : [];
    });
}

let preferredEngine: EngineId = "google";
/** Web rows: every engine with "?", otherwise one row for the preferred engine when nothing else matched. */
const web: Slot = { provider: createWebProvider(() => preferredEngine), limit: 1, fallback: true };
/** /g /y /r /x: one site each, only through the command. */
const engines: Slot[] = ENGINES.map((engine) => ({ provider: createEngineProvider(engine), limit: 1 }));

/** Every slot in group order: apps, files, widgets, site commands, then the web fallback. */
export function allSlots(settings: Settings, registered: readonly WidgetDefinition[]): Slot[] {
  preferredEngine = settings.commandBar.webSearch;
  return [apps, files, ...widgetSlots(settings.widgets, registered), ...engines, web];
}
