// Which providers the command bar asks, in group order (SPEC-command-bar §5.4). Built-in sources join in later tasks.
import { mergeWidgets, type WidgetSetting } from "../shell/settings";
import type { WidgetDefinition } from "../shell/widget-contract";
import { createFilesProvider } from "./providers/files";
import type { Slot } from "./search";

/** Rows per group without a prefix (SPEC-command-bar §5.4). */
export const FILES_LIMIT = 4;

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

/** Every slot in group order: built-in sources, then widgets. */
export function allSlots(stored: readonly WidgetSetting[], registered: readonly WidgetDefinition[]): Slot[] {
  return [files, ...widgetSlots(stored, registered)];
}
