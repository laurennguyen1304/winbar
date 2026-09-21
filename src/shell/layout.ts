import type { WidgetDefinition, WidgetId, WidgetSize } from "./widget-contract";

/**
 * Where each widget sits in the panel's bento (SPEC-notch-shell §6).
 *
 * Three columns. The `large` widgets take the wide columns and stand two rows high; the `small` ones stack in
 * the narrow column beside them; each `medium` one gets a full-width row underneath. The owner set that order of
 * importance on 20/09: sessions and music big, clipboard middling, the limits and the machine small.
 */
export interface BentoLayout {
  /** Tall tiles, left to right. At most two fit beside the narrow column. */
  large: WidgetId[];
  /** Single cells stacked in the narrow column. */
  small: WidgetId[];
  /** Full-width rows, in order, below the band above. */
  medium: WidgetId[];
}

/** How many tall tiles fit before the narrow column would be squeezed out. */
export const MAX_LARGE = 2;

type Sized = Pick<WidgetDefinition, "id" | "layout">;

const sizeOf = (w: Sized): WidgetSize => w.layout?.size ?? "small";

/**
 * Arranges the enabled widgets (already in Settings order) into the bento.
 *
 * Nothing here knows any widget by name: a widget says how much it is worth and the shell places it. Too many
 * `large` ones would leave no room for the narrow column, so the extras drop to full-width rows rather than
 * shrinking everything.
 */
export function bentoLayout(widgets: readonly Sized[]): BentoLayout {
  const large: WidgetId[] = [];
  const small: WidgetId[] = [];
  const medium: WidgetId[] = [];
  for (const w of widgets) {
    // A widget that lives elsewhere (the clipboard, in the command bar) takes no tile here.
    if (w.layout?.inPanel === false) continue;
    switch (sizeOf(w)) {
      case "large":
        (large.length < MAX_LARGE ? large : medium).push(w.id);
        break;
      case "medium":
        medium.push(w.id);
        break;
      default:
        small.push(w.id);
    }
  }
  // A lone large tile with nothing beside it would leave an empty column, so it spreads instead.
  if (large.length === 1 && small.length === 0) {
    medium.unshift(large.pop() as WidgetId);
  }
  return { large, small, medium };
}
