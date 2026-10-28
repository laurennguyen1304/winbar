import { describe, expect, it } from "vitest";
import { clockAt, forecast as maybeForecast, paceDelta, span, ticks, type Forecast } from "./forecast";
import type { UsageSample } from "./native";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-28T10:00:00Z");
const iso = (t: number) => new Date(t).toISOString();

/** The forecast, failing the test when there is none. */
function forecast(...args: Parameters<typeof maybeForecast>): Forecast {
  const f = maybeForecast(...args);
  if (!f) throw new Error("expected a forecast");
  return f;
}

describe("forecast", () => {
  it("carries the last hour's rate to the reset for the 5-hour window", () => {
    // Window 07:30 → 12:30; 10 points over the last hour, 2.5 h left.
    const history: UsageSample[] = [
      { t: NOW - 2 * HOUR, fiveHour: 5 },
      { t: NOW - HOUR, fiveHour: 10 },
      { t: NOW - 30 * MIN, fiveHour: 15 },
    ];
    const f = forecast("fiveHour", { percent: 20, resetsAt: iso(NOW + 150 * MIN) }, history, NOW, NOW);
    expect(f.rateSource).toBe("recent");
    expect(f.projected).toBeCloseTo(45);
    expect(f.hitAt).toBeUndefined();
    // Even pace: 2.5 h of 5 h gone = 50%, so 30 points under.
    expect(paceDelta(f)).toBeCloseTo(-30);
  });

  it("falls back to the window's average while there is less history than the lookback", () => {
    // 7-day window that started 2 days ago, only a few hours of samples.
    const reset = NOW + 5 * DAY;
    const history: UsageSample[] = [{ t: NOW - 3 * HOUR, sevenDay: 30 }];
    const f = forecast("sevenDay", { percent: 40, resetsAt: iso(reset) }, history, NOW, NOW);
    expect(f.rateSource).toBe("average");
    expect(f.rate).toBeCloseTo(40 / (2 * DAY));
    // 20 points a day reaches 100% in 3 days, two days before the reset.
    expect(f.hitAt).toBeCloseTo(NOW + 3 * DAY, -3);
    expect(paceDelta(f)).toBeCloseTo(40 - (100 * 2) / 7);
  });

  it("ignores samples from the previous window", () => {
    const history: UsageSample[] = [
      { t: NOW - 6 * HOUR, fiveHour: 90 },
      { t: NOW - 70 * MIN, fiveHour: 2 },
    ];
    const f = forecast("fiveHour", { percent: 4, resetsAt: iso(NOW + 3 * HOUR) }, history, NOW, NOW);
    expect(f.points.map(([, v]) => v)).toEqual([2, 4]);
  });

  it("says the limit is reached rather than forecasting past it", () => {
    const f = forecast("fiveHour", { percent: 100, resetsAt: iso(NOW + HOUR) }, [], NOW, NOW);
    expect(f.hitAt).toBe(NOW);
  });

  it("never forecasts a falling line", () => {
    const history: UsageSample[] = [{ t: NOW - 2 * HOUR, fiveHour: 30 }];
    const f = forecast("fiveHour", { percent: 20, resetsAt: iso(NOW + HOUR) }, history, NOW, NOW);
    expect(f.rate).toBe(0);
    expect(f.projected).toBe(20);
  });

  it("has nothing to say without a reset time, or once the window has rolled over", () => {
    expect(maybeForecast("fiveHour", { percent: 20 }, [], NOW, NOW)).toBeUndefined();
    expect(maybeForecast("fiveHour", { percent: 20, resetsAt: iso(NOW - MIN) }, [], NOW, NOW)).toBeUndefined();
    expect(maybeForecast("fiveHour", undefined, [], NOW, NOW)).toBeUndefined();
  });

  it("anchors the forecast at the fetch, not at the clock", () => {
    const f = forecast("fiveHour", { percent: 20, resetsAt: iso(NOW + HOUR) }, [], NOW - 5 * MIN, NOW);
    expect(f.now).toBe(NOW - 5 * MIN);
  });
});

describe("labels", () => {
  it("spans read the way the mockup writes them", () => {
    expect(span(29 * MIN)).toBe("29m");
    expect(span(4 * HOUR + 12 * MIN)).toBe("4h 12m");
    expect(span(4 * DAY + 19 * HOUR + 5 * MIN)).toBe("4d 19h");
    expect(span(40 * HOUR + 58 * MIN, false)).toBe("40h 58m");
    expect(span(-5)).toBe("0m");
  });

  it("a time today has no weekday, another day does", () => {
    const today = new Date(NOW);
    today.setHours(17, 30, 0, 0);
    expect(clockAt(today.getTime(), today.getTime())).toBe("17:30");
    const later = new Date(today);
    later.setDate(later.getDate() + 1);
    expect(clockAt(later.getTime(), today.getTime())).toMatch(/^(CN|T[2-7]) 17:30$/);
  });

  it("ticks: whole hours for 5 hours, one per day for 7 days", () => {
    const start = new Date(NOW);
    start.setHours(12, 30, 0, 0);
    const five = ticks("fiveHour", start.getTime(), start.getTime() + 5 * HOUR);
    expect(five.map((t) => t.label)).toEqual(["13:00", "14:00", "15:00", "16:00", "17:00"]);
    const seven = ticks("sevenDay", start.getTime(), start.getTime() + 7 * DAY);
    expect(seven).toHaveLength(7);
  });
});
