import type { Opened } from "./native";

/**
 * `opened.maxHeight` in this page's px.
 *
 * Rust measures the room below the bar in the screen's logical px. With Windows text size up, the page draws each CSS
 * px bigger than that, so fewer of them fit before the bar runs off the bottom of the screen.
 */
export function cssMaxHeight(opened: Opened, pixelRatio: number): number {
  if (!(opened.scale && opened.scale > 0 && pixelRatio > 0)) return opened.maxHeight;
  return Math.floor((opened.maxHeight * opened.scale) / pixelRatio);
}
