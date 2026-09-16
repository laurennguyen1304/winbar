// Single source of notch dimensions (logical px). Values come from SPEC-notch-shell.md §5.1 and §7.

export type PillSize = "s" | "m" | "l";
export type AlwaysSize = "m" | "l";
export type PanelWidth = "s" | "m" | "l";

export interface Size {
  width: number;
  height: number;
}

export const PILL_SIZES: Record<PillSize, Size> = {
  s: { width: 300, height: 36 },
  m: { width: 340, height: 40 },
  l: { width: 400, height: 46 },
};

export const ALWAYS_SIZES: Record<AlwaysSize, Size> = {
  m: { width: 620, height: 64 },
  l: { width: 700, height: 76 },
};

export const PANEL_WIDTHS: Record<PanelWidth, number> = { s: 720, m: 780, l: 860 };

export const DEFAULT_TOP_GAP = 8;
export const TOP_GAP_RANGE = { min: 0, max: 24 } as const;

/** Alert pill: wider and slightly taller than the regular pill (SPEC §5.1). */
export function alertSize(pill: Size): Size {
  return { width: pill.width + 150, height: pill.height + 4 };
}

/** Fully rounded ends for a pill of this height. */
export function pillRadius(size: Size): number {
  return size.height / 2;
}
