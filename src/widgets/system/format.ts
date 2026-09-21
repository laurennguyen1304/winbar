// Numbers on the system card (SPEC-system §5.1). Pure, so the card only renders.

const GB = 1024 ** 3;

/** Memory as `12.4 / 31.7 GB`, one decimal. */
export function formatRam(usedBytes: number, totalBytes: number): string {
  const one = (bytes: number) => (Math.max(0, bytes) / GB).toFixed(1);
  return `${one(usedBytes)} / ${one(totalBytes)} GB`;
}

/** Whole percent, clamped; `—` when there is nothing to show. */
export function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(Math.min(Math.max(value, 0), 100))}%`;
}

export type Level = "normal" | "high" | "critical";

/** Bar colour band: 90% and up is critical, 75–89% high (SPEC-system §5.1). */
export function level(percent: number): Level {
  if (percent >= 90) return "critical";
  if (percent >= 75) return "high";
  return "normal";
}

/** Share of memory in use, 0–100; 0 when the total is unknown. */
export function ramPercent(usedBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.max(0, (usedBytes / totalBytes) * 100));
}
