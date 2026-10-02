// Says on the pill that a session's turn just ended (SPEC-claude-notices §3).
import { useEffect, useRef } from "react";
import { useShell } from "../../shell/shell-context";
import { useNotices, type ClaudeNotice } from "./approvals";
import { useClaude } from "./store";
import styles from "./Claude.module.css";

const WIDGET_ID = "claude-sessions";
const ALERT_ID = "claude-notice";
/** A turn shorter than this finishing is not news: the person who asked is still looking at the terminal. */
export const LONG_TURN_MS = 30_000;
/** A notice older than this when its moment comes is dropped: it describes something that is no longer "just now". */
export const FRESH_MS = 30_000;
export const FINISHED_MS = 5_000;
export const FAILED_MS = 8_000;
/** Under a permission request (5), so a finished turn never covers something waiting for an answer. */
const PRIORITY = { failed: 4, finished: 2 } as const;
/** More than this waiting their turn is a burst nobody will read one by one. */
const MAX_QUEUED = 8;

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

function NoticePill({ notice }: { notice: ClaudeNotice }) {
  const failed = notice.kind === "failed";
  return (
    <span className={styles.noticePill}>
      <span className={styles.noticeMark} data-kind={notice.kind}>
        {failed ? "▲" : "✓"}
      </span>
      <span className={styles.noticeFrom}>{notice.project ?? notice.title}</span>
      <span className={styles.noticeWhat} data-kind={notice.kind}>
        {failed ? `· dừng: ${REASONS[notice.reason ?? ""] ?? "lỗi không rõ"}` : "· xong"}
      </span>
      {!failed && notice.summary && <span className={styles.noticeSummary}>— {notice.summary}</span>}
    </span>
  );
}

/** Whether this notice is worth the pill at all. */
function worthShowing(notice: ClaudeNotice): boolean {
  if (notice.kind === "failed") return true;
  // Unknown length means winbar did not see the turn start; saying "done" about it would be a guess.
  return notice.turnMs !== undefined && notice.turnMs >= LONG_TURN_MS;
}

/**
 * Puts the notices Rust collects on the pill, one at a time. Renders nothing; mounted with the Claude widget's
 * background, so it runs while the panel is closed.
 */
export function StopNotices() {
  const notices = useNotices();
  const { options } = useClaude();
  const shell = useShell();
  const enabled = options.stopNotice;
  // Everything this page has already looked at, shown or not: a notice gets one chance.
  const seen = useRef<Set<string>>(new Set());
  const queue = useRef<ClaudeNotice[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const next = () => {
      timer.current = undefined;
      const now = Date.now();
      const notice = queue.current.find((n) => now - n.at <= FRESH_MS);
      queue.current = notice ? queue.current.slice(queue.current.indexOf(notice) + 1) : [];
      if (!notice) {
        shell.alerts.dismiss(ALERT_ID);
        return;
      }
      // The same id each time, so the next notice replaces the last instead of the pill closing in between.
      shell.alerts.push({
        id: ALERT_ID,
        source: WIDGET_ID,
        priority: PRIORITY[notice.kind],
        Content: () => <NoticePill notice={notice} />,
      });
      timer.current = setTimeout(next, notice.kind === "failed" ? FAILED_MS : FINISHED_MS);
    };

    for (const notice of notices) {
      if (seen.current.has(notice.id)) continue;
      seen.current.add(notice.id);
      if (enabled && worthShowing(notice)) queue.current.push(notice);
    }
    queue.current = queue.current.slice(-MAX_QUEUED);
    if (timer.current === undefined && queue.current.length > 0) next();
  }, [shell, notices, enabled]);

  // Switched off in Settings, or the widget is going away: nothing of ours stays on the pill or waits to be.
  useEffect(() => {
    if (enabled) return;
    queue.current = [];
    clearTimeout(timer.current);
    timer.current = undefined;
    shell.alerts.dismiss(ALERT_ID);
  }, [shell, enabled]);

  useEffect(() => {
    const ids = seen.current;
    return () => {
      queue.current = [];
      clearTimeout(timer.current);
      timer.current = undefined;
      shell.alerts.dismiss(ALERT_ID);
      // Forgotten too, so a remount (React's strict mode does one on purpose) shows a notice that is still fresh
      // instead of believing it already has. `FRESH_MS` keeps old ones from coming back.
      ids.clear();
    };
  }, [shell]);

  return null;
}
