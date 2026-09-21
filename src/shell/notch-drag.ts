// Dragging the notch along the top edge (SPEC-notch-shell §15 V3).
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** Pointer travel before a press counts as a drag, so a click still opens the notch. */
export const DRAG_THRESHOLD = 6;
export const OFFSET_RANGE = { min: -4000, max: 4000 } as const;

/** Offset (logical px from the screen centre) that keeps a window of `windowWidth` on a screen of `screenWidth`. */
export function clampOffset(offset: number, screenWidth: number, windowWidth: number): number {
  const half = Math.max(0, Math.floor((screenWidth - windowWidth) / 2));
  const bounded = Math.min(Math.max(Math.round(offset), -half), half);
  return Math.min(Math.max(bounded, OFFSET_RANGE.min), OFFSET_RANGE.max);
}

/** Whether a press that has moved `dx` px sideways has become a drag. */
export function passedThreshold(dx: number): boolean {
  return Math.abs(dx) >= DRAG_THRESHOLD;
}

/** Presses on a widget's own controls never start a drag. */
const onControl = (target: EventTarget) =>
  target instanceof Element && target.closest("button, a, input, select, textarea, [role=slider]") !== null;

interface Press {
  pointerId: number;
  startScreenX: number;
  startOffset: number;
  dragging: boolean;
}

/**
 * Horizontal drag for the notch. Returns the offset to lay the window out at and the handlers for the notch element.
 * `onPress` runs on every press (the notch cancels its hover timer); `onCommit` gets the offset when a drag ends.
 */
export function useNotchDrag({
  offsetX,
  windowWidth,
  onPress,
  onCommit,
}: {
  offsetX: number;
  windowWidth: number;
  onPress: () => void;
  onCommit: (offsetX: number) => void;
}) {
  const press = useRef<Press | undefined>(undefined);
  const swallowClick = useRef(false);
  const [live, setLive] = useState<number | undefined>(undefined);
  // Shown after the drop until the saved setting comes back (avoids a jump back to the old spot). Any later change
  // of `offsetX`, such as Settings › Về giữa, wins.
  const [dropped, setDropped] = useState<number | undefined>(undefined);
  const [seenOffset, setSeenOffset] = useState(offsetX);
  if (seenOffset !== offsetX) {
    setSeenOffset(offsetX);
    setDropped(undefined);
  }

  const current = live ?? dropped ?? offsetX;

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    swallowClick.current = false;
    if (e.button !== 0 || onControl(e.target)) return;
    press.current = { pointerId: e.pointerId, startScreenX: e.screenX, startOffset: current, dragging: false };
    onPress();
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const dx = e.screenX - p.startScreenX;
    if (!p.dragging) {
      if (!passedThreshold(dx)) return;
      p.dragging = true;
      try {
        // Keeps the moves coming while the window catches up with the pointer.
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // The pointer is already gone; the drag still ends on pointerup/cancel.
      }
      window.getSelection()?.removeAllRanges();
    }
    setLive(clampOffset(p.startOffset + dx, window.screen.width, windowWidth));
  };

  const finish = (e: PointerEvent<HTMLElement>, commit: boolean) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    press.current = undefined;
    if (!p.dragging) return;
    swallowClick.current = true;
    const value = clampOffset(p.startOffset + e.screenX - p.startScreenX, window.screen.width, windowWidth);
    setLive(undefined);
    if (commit) {
      setDropped(value);
      onCommit(value);
    }
  };

  // The click that ends a drag must not open the panel.
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  return {
    offsetX: current,
    dragging: live !== undefined,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: PointerEvent<HTMLElement>) => finish(e, true),
      onPointerCancel: (e: PointerEvent<HTMLElement>) => finish(e, false),
      onClickCapture,
    },
  };
}
