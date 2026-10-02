// What each session phase reads as, and the small time strings on a row (SPEC-claude §5.1, §5.2). Pure, so tested.
import claudeFu from "../../assets/claude/claude-fu-transparent.gif";
import angry from "../../assets/claude/clawd-angry.png";
import sleeping from "../../assets/claude/clawd-sleeping.png";
import sparkles from "../../assets/claude/clawd-sparkles.png";
import thinkingIcon from "../../assets/claude/clawd-thinking.png";
import working from "../../assets/claude/working.gif";
import type { ClaudeApproval, ClaudeNotice } from "./approvals";
import type { ClaudePhase, ClaudeSession } from "./native";

export interface PhaseLook {
  /** Short label for the pill and the row. */
  label: string;
  /** A CSS variable name, so the theme keeps control of the actual colour. */
  color: string;
}

const LOOKS: Record<ClaudePhase, PhaseLook> = {
  idle: { label: "idle", color: "var(--text-faint)" },
  thinking: { label: "Thinking", color: "var(--claude)" },
  tool: { label: "Cooking", color: "var(--claude)" },
  permission: { label: "wait for you", color: "var(--warn)" },
};

/** Label and colour for a session; `tool` names the tool it is running. */
export function phaseLook(session: Pick<ClaudeSession, "phase" | "tool">): PhaseLook {
  const look = LOOKS[session.phase];
  if (session.phase === "tool" && session.tool) {
    return { ...look, label: `${look.label} · ${session.tool}` };
  }
  return look;
}

/** Claude Code's error types, in words. The code itself is never drawn. */
const REASONS: Record<string, string> = {
  rate_limit: "chạm giới hạn dùng",
  overloaded: "máy chủ Claude đang lỗi",
  server_error: "máy chủ Claude đang lỗi",
  authentication_failed: "cần đăng nhập lại",
  oauth_org_not_allowed: "cần đăng nhập lại",
  cloud_credential_error: "cần đăng nhập lại",
  account_on_hold: "tài khoản có vấn đề thanh toán",
  billing_error: "tài khoản có vấn đề thanh toán",
  max_output_tokens: "câu trả lời quá dài",
};

/** Why a turn stopped, in words; a code this page does not know is never drawn. */
export function reasonLabel(reason: string | undefined): string {
  return REASONS[reason ?? ""] ?? "lỗi không rõ";
}

export interface RowStatus extends PhaseLook {
  /**
   * What the label is about, in words that came from outside: a line of Claude's reply, or the tool call a
   * request is for. Already made safe to draw; only ever read, never something to press.
   */
  text?: string;
  /** Epoch ms the status dates from, when that says more than how long the session has been open. */
  at?: number;
}

/**
 * What a session's row says under its name (SPEC-claude-notices §4b): what it is waiting for, how its last turn
 * ended, or — while it works — the phase, as before.
 *
 * @param approval the session's request waiting on the notch, if any
 * @param outcome how the session's last turn ended; Rust forgets it when the next turn starts
 */
export function rowStatus(
  session: Pick<ClaudeSession, "phase" | "tool">,
  approval?: Pick<ClaudeApproval, "summary">,
  outcome?: Pick<ClaudeNotice, "kind" | "summary" | "reason" | "at">,
): RowStatus {
  if (approval) return { label: "Chờ duyệt:", color: "var(--warn)", text: approval.summary };
  // Only an idle session is described by how its last turn ended: one that is working again has moved on, even
  // if the prompt that started it never reached winbar.
  if (session.phase !== "idle" || !outcome) return phaseLook(session);
  if (outcome.kind === "failed") {
    return { label: `Dừng: ${reasonLabel(outcome.reason)}`, color: "var(--warn)", at: outcome.at };
  }
  return outcome.summary
    ? { label: "Xong —", color: "var(--ok)", text: outcome.summary, at: outcome.at }
    : { label: "Xong", color: "var(--ok)", at: outcome.at };
}

/**
 * Images for a phase: the ones bundled with the app, then anything added to the user folder.
 *
 * The clawd pixel set is what Lauren chose per phase (2026-09-19): sleeping and angry for idle, sparkles while
 * working, thinking while waiting on you. The two gifs stay in the rotation; the 256px headstone illustration is
 * out, because at 24px next to 48px pixel art it was the one image that read as a different app (Lauren, 20/09).
 */
export const BUILT_IN_ICONS: Record<ClaudePhase, string[]> = {
  idle: [sleeping, angry],
  thinking: [sparkles, claudeFu, working],
  tool: [sparkles, claudeFu, working],
  permission: [thinkingIcon, claudeFu],
};

export function iconsFor(phase: ClaudePhase, extra: Readonly<Record<string, string[]>>): string[] {
  return [...BUILT_IN_ICONS[phase], ...(extra[phase] ?? [])];
}

/**
 * Whether the icon should run a timer at all.
 *
 * Every bundled phase now ships more than one image, so in practice this is about the setting — but one image
 * must never start a timer either, which is what a user folder could still produce.
 */
export function shouldRotate(iconCount: number, rotateMs: number): boolean {
  return iconCount > 1 && rotateMs > 0;
}

/** Which image to show right now, given how many ticks have passed. Wraps, and never divides by zero. */
export function iconAt(icons: readonly string[], tick: number): string | undefined {
  if (icons.length === 0) return undefined;
  return icons[((tick % icons.length) + icons.length) % icons.length];
}

/** "vừa xong", "5 phút", "2 giờ", "3 ngày" — the same shape the clipboard rows use. */
export function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "vừa xong";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

/** How long a session has been running, when the hook recorded a start at all. */
export function runningFor(session: Pick<ClaudeSession, "startedAt">, now: number): string | undefined {
  if (!session.startedAt) return undefined;
  const minutes = Math.floor(Math.max(0, now - session.startedAt) / 60000);
  if (minutes < 1) return "vừa mở";
  if (minutes < 60) return `đã chạy ${minutes}m`;
  return `đã chạy ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

/** The right-hand column of a row: how long it has been running, or when it last said anything. */
export function rowTime(session: ClaudeSession, now: number): string {
  return runningFor(session, now) ?? ago(session.lastActiveAt, now);
}

/** The session the pill speaks for: the list is already ordered, so it is the first one that is not stale. */
export function pillSession(sessions: readonly ClaudeSession[]): ClaudeSession | undefined {
  return sessions.find((s) => s.source !== "history" && !s.stale) ?? undefined;
}

/** Live sessions above, the ones that have been quiet for ages below, past Desktop sessions last. */
export function groupSessions(sessions: readonly ClaudeSession[]): {
  live: ClaudeSession[];
  quiet: ClaudeSession[];
  history: ClaudeSession[];
} {
  return {
    live: sessions.filter((s) => s.source !== "history" && !s.stale),
    quiet: sessions.filter((s) => s.source !== "history" && s.stale),
    history: sessions.filter((s) => s.source === "history"),
  };
}
