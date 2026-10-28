// Where the limits are heading at the current pace (SPEC-claude §5.5b). Pure, so all of it is tested.
import type { ClaudeWindow, UsageSample } from "./native";

export type WindowKind = "fiveHour" | "sevenDay";

/** How often Rust samples usage on its own (`SAMPLE_EVERY` in claude/mod.rs). */
export const SAMPLE_MINUTES = 10;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Window length, and how far back "the recent rate" looks. */
export const WINDOWS: Record<WindowKind, { length: number; lookback: number }> = {
  fiveHour: { length: 5 * HOUR, lookback: HOUR },
  sevenDay: { length: 7 * DAY, lookback: DAY },
};

export interface Forecast {
  start: number;
  reset: number;
  /** When `current` was true: the last fetch, never later than the clock. */
  now: number;
  current: number;
  /** Percentage points per ms. */
  rate: number;
  /** `recent` over the lookback; `average` since the window started, while there is less history than that. */
  rateSource: "recent" | "average";
  /** Utilisation at the reset at this pace. Can pass 100. */
  projected: number;
  /** When 100% is reached, if that comes before the reset. */
  hitAt?: number;
  /** Where an even 0 → 100% pace would be now. */
  evenNow: number;
  /** The used-so-far line, oldest first, ending at (`now`, `current`). */
  points: Array<[number, number]>;
}

/** Points ahead (+) or under (−) an even pace. */
export function paceDelta(f: Forecast): number {
  return f.current - f.evenNow;
}

function valueAt(points: Array<[number, number]>, t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1];
    const [t1, v1] = points[i];
    if (t <= t1) return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return points[points.length - 1][1];
}

/**
 * The forecast for one window, or nothing when there is no reset time to forecast to, or the window has already
 * rolled over (the numbers on screen are then from the previous one).
 */
export function forecast(
  kind: WindowKind,
  window: ClaudeWindow | undefined,
  history: UsageSample[],
  fetchedAt: number,
  clock: number,
): Forecast | undefined {
  if (!window?.resetsAt) return undefined;
  const reset = Date.parse(window.resetsAt);
  if (Number.isNaN(reset) || reset <= clock) return undefined;
  const { length, lookback } = WINDOWS[kind];
  const start = reset - length;
  const now = fetchedAt > start && fetchedAt <= clock ? fetchedAt : clock;
  const current = window.percent;

  // Only this window's samples: the ones before `start` belong to the previous cycle.
  const points: Array<[number, number]> = history
    .filter((s) => s[kind] !== undefined && s.t >= start && s.t < now)
    .map((s): [number, number] => [s.t, s[kind] as number])
    .sort((a, b) => a[0] - b[0]);
  points.push([now, current]);

  const elapsed = Math.max(now - start, 1);
  const recent = points[0][0] <= now - lookback;
  const rate = Math.max(0, recent ? (current - valueAt(points, now - lookback)) / lookback : current / elapsed);
  const projected = current + rate * (reset - now);
  const hitAt = current >= 100 ? now : rate > 0 && projected >= 100 ? now + (100 - current) / rate : undefined;

  return {
    start,
    reset,
    now,
    current,
    rate,
    rateSource: recent ? "recent" : "average",
    projected,
    hitAt,
    evenNow: 100 * Math.min(elapsed / length, 1),
    points,
  };
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "17:30" today, otherwise "T2 13:00". Local time, 24-hour. */
export function clockAt(t: number, now: number): string {
  const d = new Date(t);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date(now).toDateString() ? time : `${WEEKDAYS[d.getDay()]} ${time}`;
}

/** "29m", "4h 12m", "4d 19h" — or "40h 58m" with `days` off. */
export function span(ms: number, days = true): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  if (days && hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}

/** Ticks under the chart: each whole hour for the 5-hour window, each day (at noon) for the 7-day one. */
export function ticks(kind: WindowKind, start: number, reset: number): Array<{ t: number; label: string }> {
  const out: Array<{ t: number; label: string }> = [];
  if (kind === "fiveHour") {
    const first = new Date(start);
    first.setMinutes(0, 0, 0);
    for (let t = first.getTime() + HOUR; t < reset; t += HOUR) {
      const d = new Date(t);
      out.push({ t, label: `${pad(d.getHours())}:00` });
    }
  } else {
    const day = new Date(start);
    day.setHours(12, 0, 0, 0);
    for (; day.getTime() <= reset; day.setDate(day.getDate() + 1)) {
      if (day.getTime() >= start) out.push({ t: day.getTime(), label: WEEKDAYS[day.getDay()] });
    }
  }
  return out;
}
