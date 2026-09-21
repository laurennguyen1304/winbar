// Reading the usage numbers out loud (SPEC-claude §5.5). Pure, so all of it is tested.
import type { ClaudeUsage, ClaudeWindow, UsageError } from "./native";

/** Above these, the bar changes colour. Same bands as the system widget's meters. */
export const HIGH_PERCENT = 75;
export const CRITICAL_PERCENT = 90;

export type Level = "normal" | "high" | "critical";

export function level(percent: number): Level {
  if (percent >= CRITICAL_PERCENT) return "critical";
  if (percent >= HIGH_PERCENT) return "high";
  return "normal";
}

/**
 * "Reset sau 2h 14m". A reset time that has already passed means the endpoint has not been asked since the window
 * rolled over — say that instead of counting down from a negative number.
 */
export function resetIn(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const minutes = Math.round((at - now) / 60000);
  if (minutes <= 0) return "Đang tính lại";
  if (minutes < 60) return `Reset sau ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `Reset sau ${hours}h` : `Reset sau ${hours}h ${rest}m`;
}

/** "cập nhật 2 phút trước", or nothing when there has never been a successful read. */
export function fetchedAgo(fetchedAt: number, now: number): string {
  if (!fetchedAt) return "";
  const minutes = Math.floor(Math.max(0, now - fetchedAt) / 60000);
  if (minutes < 1) return "vừa cập nhật";
  if (minutes < 60) return `cập nhật ${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  return `cập nhật ${hours} giờ trước`;
}

const ERROR_TEXT: Record<UsageError, string> = {
  auth: "Cần đăng nhập lại Claude Code",
  network: "Không cập nhật được",
  "no-login": "Chưa đăng nhập Claude Code",
};

/**
 * What to say about a failed read, and whether the numbers on screen are still from a real fetch.
 *
 * The distinction matters: after a network blip the old percentages are true-as-of a moment ago and worth showing,
 * while with no login there is nothing behind them at all.
 */
export function errorNote(usage: ClaudeUsage, now: number): { text: string; hasNumbers: boolean } | undefined {
  if (!usage.error) return undefined;
  const hasNumbers = Boolean(usage.fiveHour ?? usage.sevenDay);
  const since = hasNumbers ? ` · số từ ${fetchedAgo(usage.fetchedAt, now).replace(/^cập nhật /, "")}` : "";
  return { text: ERROR_TEXT[usage.error] + since, hasNumbers };
}

/**
 * An account's window as it stands now. Another account's numbers can be hours old; once its reset time has
 * passed, the old percentage is simply wrong, and the window has started again from 0 (SPEC §5.5).
 */
export function windowNow(window: ClaudeWindow | undefined, now: number): ClaudeWindow | undefined {
  if (!window?.resetsAt) return window;
  const at = Date.parse(window.resetsAt);
  return !Number.isNaN(at) && at <= now ? { percent: 0 } : window;
}

/** The short "5h 52%" the pill carries, or nothing when there is no number yet. */
export function pillUsage(usage: ClaudeUsage): string {
  return usage.fiveHour ? `5h ${usage.fiveHour.percent}%` : "";
}
