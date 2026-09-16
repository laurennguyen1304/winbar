import type { WidgetDefinition, WidgetId } from "./widget-contract";

export type TabLayout =
  | { kind: "empty" }
  | { kind: "grid"; ids: WidgetId[] }
  | { kind: "columns"; tall: WidgetId; tallFirst: boolean; stack: WidgetId[] };

/**
 * Arranges the enabled widgets of one tab (already in Settings order), SPEC §6:
 * a tall widget gets its own column and the others stack in the other column;
 * without a tall widget (or when it is alone) widgets flow through a 2-column grid.
 */
export function layoutTab(widgets: ReadonlyArray<Pick<WidgetDefinition, "id" | "layout">>): TabLayout {
  if (widgets.length === 0) return { kind: "empty" };
  const tallIndex = widgets.findIndex((w) => w.layout?.tall);
  if (tallIndex === -1 || widgets.length === 1) return { kind: "grid", ids: widgets.map((w) => w.id) };
  return {
    kind: "columns",
    tall: widgets[tallIndex].id,
    tallFirst: tallIndex === 0,
    stack: widgets.filter((_, i) => i !== tallIndex).map((w) => w.id),
  };
}
