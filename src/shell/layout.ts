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

/** A small tile and how tall it is on its own, before any stretching. */
export interface MeasuredTile {
  id: WidgetId;
  height: number;
}

/**
 * Picks a column for each small tile: the one that ends highest at the time, the tallest tile first.
 *
 * The large tiles open the first columns and the rest start empty. Stacking every small tile in the narrow column
 * made that column the tallest thing in the panel once the Claude limits listed a second account: the row grew to
 * ~510 px, music and the sessions stood mostly empty beside it, and the limits were still squeezed (the owner, 22/09).
 * Filling whichever column is shortest puts a short tile under a short large one instead. A tie goes to the
 * rightmost column, so with nothing measured yet (all zeros) the small tiles stack in the free column as before.
 */
export function placeSmalls(
  largeHeights: readonly number[],
  smalls: readonly MeasuredTile[],
  columns: number,
  gap: number,
): Record<WidgetId, number> {
  const heights = Array.from({ length: columns }, (_, i) => largeHeights[i] ?? 0);
  const filled = heights.map((_, i) => i < largeHeights.length);
  const tallestFirst = [...smalls].sort((a, b) => b.height - a.height);
  const placed: Record<WidgetId, number> = {};
  for (const tile of tallestFirst) {
    let column = columns - 1;
    for (let i = columns - 2; i >= 0; i--) if (heights[i] < heights[column]) column = i;
    heights[column] += (filled[column] ? gap : 0) + tile.height;
    filled[column] = true;
    placed[tile.id] = column;
  }
  return placed;
}
