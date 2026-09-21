// Single source of notch dimensions (logical px). Values come from SPEC-notch-shell.md §5.1 and §7.

export type PillSize = "s" | "m" | "l";
export type AlwaysSize = "m" | "l";
export type PanelWidth = "s" | "m" | "l";

export interface Size {
  width: number;
  height: number;
}

/** Heights 32/36/40 chosen on the machine with the attached notch (SPEC §15 V5, 2026-09-17). */
export const PILL_SIZES: Record<PillSize, Size> = {
  s: { width: 300, height: 32 },
  m: { width: 340, height: 36 },
  l: { width: 400, height: 40 },
};

export const ALWAYS_SIZES: Record<AlwaysSize, Size> = {
  m: { width: 620, height: 64 },
  l: { width: 700, height: 76 },
};

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

/** Duration of the size morph (M1). Keep in sync with --motion-resize in design/tokens.css. */
export const RESIZE_MS = 420;

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
