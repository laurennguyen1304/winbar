import { useEffect, useState } from "react";
import { iconAt, iconsFor, shouldRotate } from "./phase";
import type { ClaudePhase } from "./native";
import styles from "./Claude.module.css";

/** How long each image stays before the next one fades in (SPEC-claude §5.4). */
export const ROTATE_MS = 6000;

export interface ClaudeIconProps {
  phase: ClaudePhase;
  /** Extra images per phase from the user's folder. */
  extra: Readonly<Record<string, string[]>>;
  size?: number;
  /** 0 turns rotation off; the first image stays. */
  rotateMs?: number;
}

/**
 * The status picture for a phase, cycling through whatever images that phase has.
 *
 * The timer only exists while this is on screen, and only when there is more than one image to show — a single
 * image costs nothing at all. That is the lesson from the media equaliser, which animated at 60fps behind a
 * closed panel.
 */
export function ClaudeIcon({ phase, extra, size = 26, rotateMs = ROTATE_MS }: ClaudeIconProps) {
  const icons = iconsFor(phase, extra);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!shouldRotate(icons.length, rotateMs)) return;
    const id = setInterval(() => setTick((t) => t + 1), rotateMs);
    return () => clearInterval(id);
  }, [icons.length, rotateMs]);

  // A phase with fewer images must not keep an index that no longer exists.
  const src = iconAt(icons, tick);
  if (!src) return <span className={styles.iconEmpty} style={{ width: size, height: size }} />;
  return (
    <img
      // Re-keying on the source replays the fade, which is what makes the change read as a change.
      key={src}
      className={styles.icon}
      src={src}
      alt=""
      width={size}
      height={size}
    />
  );
}
