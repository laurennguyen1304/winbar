import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { seekByKey, seekFromPointer } from "./controls";
import { formatTime } from "./progress";
import styles from "./Media.module.css";

interface SeekBarProps {
  positionMs: number;
  durationMs: number;
  canSeek: boolean;
  onSeek(positionMs: number): void;
}

/**
 * Progress bar that seeks (SPEC-media §5.4): click to jump, drag to scrub (sent on release), ← → for 5 s.
 * Without seek support it only shows progress.
 */
export function SeekBar({ positionMs, durationMs, canSeek, onSeek }: SeekBarProps) {
  const [dragMs, setDragMs] = useState<number | null>(null);
  const shown = dragMs ?? positionMs;

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return seekFromPointer(e.clientX, r.left, r.width, durationMs);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canSeek || e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // The pointer is already gone; release still ends the drag.
    }
    setDragMs(at(e));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragMs !== null) setDragMs(at(e));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragMs === null) return;
    setDragMs(null);
    onSeek(at(e));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const target = seekByKey(e.key, shown, durationMs);
    if (target === null) return;
    e.preventDefault();
    onSeek(target);
  };

  return (
    <>
      <div
        className={canSeek ? `${styles.track} ${styles.seekable}` : styles.track}
        role="slider"
        aria-label="Tiến độ"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(shown / 1000)}
        aria-valuetext={`${formatTime(shown)} / ${formatTime(durationMs)}`}
        aria-disabled={!canSeek}
        tabIndex={canSeek ? 0 : -1}
        data-dragging={dragMs !== null || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragMs(null)}
        onKeyDown={onKeyDown}
      >
        <i style={{ width: `${durationMs > 0 ? (shown / durationMs) * 100 : 0}%` }} />
      </div>
      <div className={styles.times}>
        <span>{formatTime(shown)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </>
  );
}
