// Playback position maths (SPEC-media §5.1, §5.2). Pure, so the card only renders.
import { useEffect, useState } from "react";
import type { MediaTrack } from "./native";

type Timeline = Pick<MediaTrack, "status" | "positionMs" | "durationMs" | "positionAt" | "rate">;

/** Estimated playback position now, clamped to the track; `null` without a usable length. */
export function positionNow(t: Timeline, now: number): number | null {
  if (t.positionMs === null || t.durationMs === null) return null;
  const moved = t.status === "playing" ? Math.max(0, now - t.positionAt) * t.rate : 0;
  return Math.min(Math.max(t.positionMs + moved, 0), t.durationMs);
}

/** `m:ss`, or `h:mm:ss` from one hour. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Current time, refreshed every `intervalMs` while `active` (the card is on screen and the track plays). The value can
 * be up to one interval old, which `positionNow` tolerates (SPEC-media §11: ≤ 1 s drift).
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
