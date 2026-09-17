// Outline of the notch (SPEC-notch-shell §15 V1). One path per shape, so the attached notch's flares and sides are a
// single continuous line with no seam. Coordinates are in the shape box, which starts `inset` px left of the notch.
import type { Size } from "./notch-sizes";

export type NotchLayout = "attached" | "float";
export type NotchMaterial = "liquid" | "dense";

/** Concave flare where the attached notch meets the top edge of the screen. */
export const FLARE = 14;

export interface ShapePaths {
  /** Closed outline for the background (`clip-path: path()`). */
  fill: string;
  /** Outline for the rim stroke; open along the top edge when attached. */
  rim: string;
  /** Same outline 1.5 px inside, for the glass's inner edge. */
  innerRim: string;
  /** Shape box offset to the left of the notch, and its size. */
  inset: number;
  width: number;
  height: number;
}

/** Rim stroke width, and how far inside it the faint inner edge runs. */
const STROKE = 1;
const INNER = 1.5;

const n = (v: number) => Math.round(v * 100) / 100;

function attachedOutline(w: number, h: number, f: number, r: number, x0 = 0, y0 = 0) {
  const L = x0 + f;
  const R = x0 + f + w;
  const top = y0;
  const bottom = y0 + h;
  const fill = [
    `M ${n(x0)} ${n(top)}`,
    `H ${n(R + f)}`,
    `A ${f} ${f} 0 0 0 ${n(R)} ${n(top + f)}`,
    `V ${n(bottom - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(R - r)} ${n(bottom)}`,
    `H ${n(L + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(L)} ${n(bottom - r)}`,
    `V ${n(top + f)}`,
    `A ${f} ${f} 0 0 0 ${n(x0)} ${n(top)}`,
    "Z",
  ].join(" ");
  const rim = [
    `M ${n(x0)} ${n(top)}`,
    `A ${f} ${f} 0 0 1 ${n(L)} ${n(top + f)}`,
    `V ${n(bottom - r)}`,
    `A ${n(r)} ${n(r)} 0 0 0 ${n(L + r)} ${n(bottom)}`,
    `H ${n(R - r)}`,
    `A ${n(r)} ${n(r)} 0 0 0 ${n(R)} ${n(bottom - r)}`,
    `V ${n(top + f)}`,
    `A ${f} ${f} 0 0 1 ${n(R + f)} ${n(top)}`,
  ].join(" ");
  return { fill, rim };
}

function roundedRect(w: number, h: number, r: number, x0 = 0, y0 = 0) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  return [
    `M ${n(x0 + r)} ${n(y0)}`,
    `H ${n(x1 - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y0 + r)}`,
    `V ${n(y1 - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x1 - r)} ${n(y1)}`,
    `H ${n(x0 + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x0)} ${n(y1 - r)}`,
    `V ${n(y0 + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x0 + r)} ${n(y0)}`,
    "Z",
  ].join(" ");
}

/** Paths for a notch of `width`×`height` with bottom corner radius `radius` (clamped to what fits). */
export function notchShape(
  width: number,
  height: number,
  radius: number,
  layout: NotchLayout,
  flare = FLARE,
): ShapePaths {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (layout === "attached") {
    const f = Math.min(flare, h / 2);
    // The rim's bottom sits half a stroke inside the window, which ends exactly at the notch's bottom edge.
    const r = Math.max(0, Math.min(radius, h - STROKE / 2 - f, w / 2));
    const fill = attachedOutline(w, h, f, r).fill;
    const rim = attachedOutline(w, h - STROKE / 2, f, r).rim;
    const innerRim = attachedOutline(w - 2 * INNER, h - INNER, f, Math.max(0, r - INNER), INNER).rim;
    return { fill, rim, innerRim, inset: f, width: w + 2 * f, height: h };
  }
  const r = Math.max(0, Math.min(radius, h / 2, w / 2));
  const half = STROKE / 2;
  return {
    fill: roundedRect(w, h, r),
    rim: roundedRect(w - STROKE, h - STROKE, Math.max(0, r - half), half, half),
    innerRim: roundedRect(w - 2 * INNER, h - 2 * INNER, Math.max(0, r - INNER), INNER, INNER),
    inset: 0,
    width: w,
    height: h,
  };
}

/** The native window holds the notch plus the flares on both sides when attached. */
export function windowSizeFor(block: Size, layout: NotchLayout, flare = FLARE): Size {
  return layout === "attached" ? { width: block.width + 2 * flare, height: block.height } : block;
}

/**
 * Height in logical px of the strip sticky mode reserves at the top of the screen (SPEC §15 V4): the collapsed notch,
 * plus its gap when it floats. Alerts and the open panel still overlap the windows below.
 */
export function stickyHeight(collapsed: Size, layout: NotchLayout, topGap: number): number {
  return layout === "attached" ? collapsed.height : collapsed.height + topGap;
}
