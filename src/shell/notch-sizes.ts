// Single source of notch dimensions (logical px). Values come from SPEC-notch-shell.md §5.1 and §7.

export type PresetPillSize = "s" | "m" | "l";
export type PresetAlwaysSize = "m" | "l";
/** A preset, or `custom`: a width set as a share of the screen width (the owner, 23/11). */
export type PillSize = PresetPillSize | "custom";
export type AlwaysSize = PresetAlwaysSize | "custom";
export type PanelWidth = "s" | "m" | "l";

export interface Size {
  width: number;
  height: number;
}

/** Heights 32/36/40 chosen on the machine with the attached notch (SPEC §15 V5, 2026-09-17). */
export const PILL_SIZES: Record<PresetPillSize, Size> = {
  s: { width: 300, height: 32 },
  m: { width: 340, height: 36 },
  l: { width: 400, height: 40 },
};

export const ALWAYS_SIZES: Record<PresetAlwaysSize, Size> = {
  m: { width: 620, height: 64 },
  l: { width: 700, height: 76 },
};

/**
 * Custom widths, in percent of the width of the screen the notch is on. Must match src-tauri/src/settings.rs.
 *
 * The defaults are the `m` presets on a 1920 px screen. Below `minPx` the content no longer fits, so a small screen
 * gets at least that much; a custom pill keeps the height of the `m` preset.
 */
export const PILL_WIDTH_PERCENT = { min: 10, max: 35, step: 1, default: 18, minPx: 240 } as const;
export const ALWAYS_WIDTH_PERCENT = { min: 25, max: 60, step: 1, default: 33, minPx: 480 } as const;

type PercentRange = typeof PILL_WIDTH_PERCENT | typeof ALWAYS_WIDTH_PERCENT;

function customSize(percent: number, range: PercentRange, height: number, fallback: Size, screenWidth: number): Size {
  if (!(screenWidth > 0) || !Number.isFinite(percent)) return fallback;
  const share = Math.min(range.max, Math.max(range.min, percent));
  const width = Math.max(range.minPx, Math.round((screenWidth * share) / 100));
  return { width: panelFitWidth(width, screenWidth), height };
}

/** The collapsed pill for a setting: a preset, or `percent` of `screenWidth`. */
export function pillSizeFor(size: PillSize, percent: number, screenWidth: number): Size {
  if (size !== "custom") return PILL_SIZES[size] ?? PILL_SIZES.m;
  return customSize(percent, PILL_WIDTH_PERCENT, PILL_SIZES.m.height, PILL_SIZES.m, screenWidth);
}

/** The always-mode pill for a setting: a preset, or `percent` of `screenWidth`. */
export function alwaysSizeFor(size: AlwaysSize, percent: number, screenWidth: number): Size {
  if (size !== "custom") return ALWAYS_SIZES[size] ?? ALWAYS_SIZES.m;
  return customSize(percent, ALWAYS_WIDTH_PERCENT, ALWAYS_SIZES.m.height, ALWAYS_SIZES.m, screenWidth);
}

/** The share of `screenWidth` a preset width is, inside `range`: where the slider starts when "custom" is picked. */
export function percentOf(width: number, screenWidth: number, range: PercentRange): number {
  if (!(screenWidth > 0)) return range.default;
  return Math.min(range.max, Math.max(range.min, Math.round((width / screenWidth) * 100)));
}

export const PANEL_WIDTHS: Record<PanelWidth, number> = { s: 720, m: 780, l: 860 };
export const PANEL_RADIUS = 28;
export const PANEL_MIN_HEIGHT = 120;
/** The expanded panel never exceeds this share of the screen height; extra content scrolls. */
export const PANEL_MAX_SCREEN_SHARE = 0.8;

/**
 * How much solid black may sit behind the notch material, as a percentage.
 *
 * 0 leaves the material's own translucency alone; 100 is a black notch you cannot see through. Steps of 5 keep
 * the slider from offering a precision nobody can see.
 */
export const NOTCH_OPACITY_RANGE = { min: 0, max: 100, step: 5 } as const;

export const DEFAULT_TOP_GAP = 8;
/** Up to 48 so the pill can sit below a top taskbar such as yasb (~32px). */
export const TOP_GAP_RANGE = { min: 0, max: 48 } as const;

/**
 * How long the notch takes to shrink (M1). The native window is only made smaller once this has passed. Keep in
 * sync with --motion-shrink in design/tokens.css. Growing needs no number here: the window grows first.
 */
export const SHRINK_MS = 340;

/** Width of an alert's own card (SPEC-claude-approvals §5). */
export const DETAIL_WIDTH = 560;

/**
 * Pill carrying two widgets at once — a Claude session while music is playing (the owner, 20/09).
 *
 * Widened rather than squeezed: 340 px is already tight for the Claude row on its own, so two of them in the
 * same width would mean two ellipses and nothing readable.
 */
export function duoSize(pill: Size): Size {
  return { width: pill.width + 240, height: pill.height };
}

/** Alert pill: wider and slightly taller than the regular pill (SPEC §5.1). */
export function alertSize(pill: Size): Size {
  return { width: pill.width + 150, height: pill.height + 4 };
}

/** Extra width of an alert that is a sentence to read rather than buttons to press. */
const WIDE_ALERT_EXTRA = 300;

/**
 * Alert pill for a `wide` alert: a session's name and a line about it side by side (the owner, 02/10 — at the
 * regular alert width the name was cut to make room for the line). Never wider than the screen allows.
 */
export function wideAlertSize(pill: Size, screenWidth: number): Size {
  return { width: panelFitWidth(pill.width + WIDE_ALERT_EXTRA, screenWidth), height: alertSize(pill).height };
}

/** Fully rounded ends for a pill of this height. */
export function pillRadius(size: Size): number {
  return size.height / 2;
}

/**
 * Tallest the expanded panel may be. The panel content is capped at the same number, otherwise the window stops
 * growing here while the content keeps going — and every row past this point sits outside the window, where it
 * cannot be clicked or dragged.
 */
export function panelMaxHeight(screenHeight: number): number {
  return Math.max(PANEL_MIN_HEIGHT, Math.floor(screenHeight * PANEL_MAX_SCREEN_SHARE));
}

/** Panel height follows its content, clamped between a minimum and a share of the screen height. */
export function panelHeight(contentHeight: number, screenHeight: number): number {
  return Math.min(Math.max(Math.ceil(contentHeight), PANEL_MIN_HEIGHT), panelMaxHeight(screenHeight));
}

/** Room left at the screen's sides when the panel is squeezed: the attached notch's flares, and a little air. */
const PANEL_SIDE_ROOM = 40;

/**
 * Panel width that still fits the screen. The widest setting is 860 px, and a 1280 px laptop at 150% is only
 * 853 px wide, so there the panel would otherwise lose both edges.
 */
export function panelFitWidth(width: number, screenWidth: number): number {
  if (!(screenWidth > 0)) return width;
  return Math.min(width, Math.max(PILL_SIZES.l.width, Math.floor(screenWidth - PANEL_SIDE_ROOM)));
}
