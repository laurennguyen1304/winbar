// Frontend view of settings (SPEC §7). Rust validates and stores them; this module maps them onto the notch.
import type { OpenMode } from "./notch-machine";
import { ALWAYS_SIZES, PANEL_WIDTHS, PILL_SIZES, type AlwaysSize, type PanelWidth, type PillSize, type Size } from "./notch-sizes";
import type { WidgetDefinition } from "./widget-contract";

export interface WidgetSetting {
  id: string;
  enabled: boolean;
}

export interface Settings {
  version: number;
  pill: {
    size: PillSize;
    alwaysSize: AlwaysSize;
    panelWidth: PanelWidth;
    topGap: number;
    openMode: OpenMode;
    priorityWidget: string | null;
  };
  fontScale: number;
  widgets: WidgetSetting[];
  hotkeys: { commandBar: string };
  launchAtStartup: boolean;
  commandBar: {
    /** Top-left in physical px; null until the user drags the command bar. */
    position: { x: number; y: number } | null;
    fileSearch: "auto" | "everything" | "windows" | "off";
    webSearch: "google" | "bing" | "duckduckgo";
  };
}

/** Must match `Settings::default()` in src-tauri/src/settings.rs. */
export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  pill: { size: "m", alwaysSize: "m", panelWidth: "m", topGap: 8, openMode: "hover", priorityWidget: "claude-sessions" },
  fontScale: 100,
  widgets: [],
  hotkeys: { commandBar: "Ctrl+Space" },
  launchAtStartup: true,
  commandBar: { position: null, fileSearch: "auto", webSearch: "google" },
};

/** Stored order and flags win; widgets that no longer exist are dropped; new widgets are appended, enabled. */
export function mergeWidgets(stored: readonly WidgetSetting[], registered: readonly WidgetDefinition[]): WidgetSetting[] {
  const known = new Set(registered.map((w) => w.id));
  const kept = stored.filter((w) => known.has(w.id));
  const seen = new Set(kept.map((w) => w.id));
  return [...kept, ...registered.filter((w) => !seen.has(w.id)).map((w) => ({ id: w.id, enabled: true }))];
}

export interface NotchSettingsProps {
  widgets: WidgetDefinition[];
  priorityWidget: string | undefined;
  mode: OpenMode;
  pillSize: Size;
  alwaysSize: Size;
  panelWidth: number;
  topGap: number;
  fontScale: number;
}

export function notchPropsFrom(settings: Settings, registered: readonly WidgetDefinition[]): NotchSettingsProps {
  const byId = new Map(registered.map((w) => [w.id, w]));
  const widgets = mergeWidgets(settings.widgets, registered)
    .filter((w) => w.enabled)
    .map((w) => byId.get(w.id) as WidgetDefinition);
  return {
    widgets,
    priorityWidget: settings.pill.priorityWidget ?? undefined,
    mode: settings.pill.openMode,
    pillSize: PILL_SIZES[settings.pill.size],
    alwaysSize: ALWAYS_SIZES[settings.pill.alwaysSize],
    panelWidth: PANEL_WIDTHS[settings.pill.panelWidth],
    topGap: settings.pill.topGap,
    fontScale: settings.fontScale / 100,
  };
}

/**
 * Moves a widget one step up (-1) or down (+1) among the widgets of the same tab, keeping every other widget's
 * position. Returns the list unchanged when the widget is already at that end of its tab.
 */
export function moveWidget(
  list: readonly WidgetSetting[],
  id: string,
  direction: -1 | 1,
  registered: readonly WidgetDefinition[],
): WidgetSetting[] {
  const tabOf = new Map(registered.map((w) => [w.id, w.tab]));
  const tab = tabOf.get(id);
  const sameTab = list.map((w, i) => ({ w, i })).filter(({ w }) => tabOf.get(w.id) === tab);
  const at = sameTab.findIndex(({ w }) => w.id === id);
  const target = sameTab[at + direction];
  if (at === -1 || !target) return [...list];
  const next = [...list];
  [next[sameTab[at].i], next[target.i]] = [next[target.i], next[sameTab[at].i]];
  return next;
}
