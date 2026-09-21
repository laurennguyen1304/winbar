import type { WidgetDefinition, WidgetId } from "./widget-contract";

/** Widget shown on the 340×36 pill: the priority widget if it has pill content, else the first widget that does. */
export function pickPill(widgets: readonly WidgetDefinition[], priority: WidgetId | undefined): WidgetDefinition | undefined {
  return pickPills(widgets, priority)[0];
}

/**
 * Up to two widgets for the collapsed pill, the priority one first.
 *
 * Only widgets with something to say reach here: Claude and media each take themselves out of the pill when
 * there is no session and no music (`ShellApi.setHidden`). Two of them means two things really are happening,
 * and the pill widens to `duoSize` to fit both.
 */
export function pickPills(widgets: readonly WidgetDefinition[], priority: WidgetId | undefined): WidgetDefinition[] {
  const withPill = widgets.filter((w) => w.Pill);
  const first = withPill.find((w) => w.id === priority) ?? withPill[0];
  if (!first) return [];
  const second = withPill.find((w) => w !== first);
  return second ? [first, second] : [first];
}

/** Up to two widgets for the always-mode pill (SPEC §5.1): the priority widget first, then the next in order. */
export function pickMidPills(widgets: readonly WidgetDefinition[], priority: WidgetId | undefined): WidgetDefinition[] {
  const withMid = widgets.filter((w) => w.MidPill);
  const first = withMid.find((w) => w.id === priority) ?? withMid[0];
  if (!first) return [];
  const second = withMid.find((w) => w !== first);
  return second ? [first, second] : [first];
}
