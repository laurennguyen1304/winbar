// Pure helpers for seeking and switching apps (SPEC-media §5.3, §5.4).
import type { MediaSession } from "./native";

/** Arrow keys move this far on the seek bar. */
export const SEEK_STEP_MS = 5000;

/** Position under the pointer on a bar spanning `left`…`left + width`, clamped to the track. */
export function seekFromPointer(clientX: number, left: number, width: number, durationMs: number): number {
  if (width <= 0) return 0;
  const ratio = Math.min(Math.max((clientX - left) / width, 0), 1);
  return Math.round(ratio * durationMs);
}

/** Target of a key on the seek bar, or `null` when the key does not seek. */
export function seekByKey(key: string, positionMs: number, durationMs: number): number | null {
  const clamp = (ms: number) => Math.min(Math.max(ms, 0), durationMs);
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(positionMs - SEEK_STEP_MS);
    case "ArrowRight":
    case "ArrowUp":
      return clamp(positionMs + SEEK_STEP_MS);
    case "Home":
      return 0;
    case "End":
      return durationMs;
    default:
      return null;
  }
}

/** The session before (-1) or after (+1) the shown one, wrapping around; `undefined` with fewer than two. */
export function neighbourSession(
  sessions: readonly MediaSession[],
  currentId: string,
  step: 1 | -1,
): string | undefined {
  if (sessions.length < 2) return undefined;
  const at = Math.max(
    0,
    sessions.findIndex((s) => s.id === currentId),
  );
  return sessions[(at + step + sessions.length) % sessions.length].id;
}
