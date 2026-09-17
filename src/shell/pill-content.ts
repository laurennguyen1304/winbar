import type { WidgetDefinition, WidgetId } from "./widget-contract";

/** Widget shown on the 340×36 pill: the priority widget if it has pill content, else the first widget that does. */
export function pickPill(widgets: readonly WidgetDefinition[], priority: WidgetId | undefined): WidgetDefinition | undefined {
  return widgets.find((w) => w.id === priority && w.Pill) ?? widgets.find((w) => w.Pill);
}

/** Up to two widgets for the always-mode pill (SPEC §5.1): the priority widget first, then the next in order. */
export function pickMidPills(widgets: readonly WidgetDefinition[], priority: WidgetId | undefined): WidgetDefinition[] {
  const withMid = widgets.filter((w) => w.MidPill);
  const first = withMid.find((w) => w.id === priority) ?? withMid[0];
  if (!first) return [];
  const second = withMid.find((w) => w !== first);
  return second ? [first, second] : [first];
}
