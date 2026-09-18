import { useEffect, useState } from "react";
import { getSystemStats, type SystemStats } from "./native";

/** How often the card refreshes while it is on screen (SPEC-system §5.2). */
export const SAMPLE_MS = 2000;

export interface StatsView {
  stats: SystemStats | undefined;
  /** Set when the last read failed; the previous numbers stay on screen. */
  failed: boolean;
}

/**
 * CPU and memory, refreshed every `intervalMs` for as long as the component is mounted. Nothing runs once the card
 * leaves the screen, so a closed panel costs nothing.
 */
export function useSystemStats(intervalMs = SAMPLE_MS): StatsView {
  const [view, setView] = useState<StatsView>({ stats: undefined, failed: false });

  useEffect(() => {
    let active = true;
    const read = () =>
      getSystemStats()
        .then((stats) => {
          if (active && stats) setView({ stats, failed: false });
        })
        .catch((err: unknown) => {
          console.error("system_stats failed", err);
          if (active) setView((prev) => ({ ...prev, failed: true }));
        });
    void read();
    const id = setInterval(() => void read(), intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return view;
}
