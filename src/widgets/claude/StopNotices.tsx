// Says on the pill that a session's turn just ended (SPEC-claude-notices §3).
import { useEffect, useRef } from "react";
import { useShell } from "../../shell/shell-context";
import { useNotices, type ClaudeNotice } from "./approvals";
import { reasonLabel } from "./phase";
import { useClaude } from "./store";
import styles from "./Claude.module.css";

const WIDGET_ID = "claude-sessions";
const ALERT_ID = "claude-notice";
/** A turn shorter than this finishing is not news: the person who asked is still looking at the terminal. */
export const LONG_TURN_MS = 30_000;
/** A notice older than this when its moment comes is dropped: it describes something that is no longer "just now". */
export const FRESH_MS = 30_000;
/** Two seconds more than at first: five was gone before the line had been read (the owner, 02/10). */
export const FINISHED_MS = 7_000;
export const FAILED_MS = 10_000;
/** Under a permission request (5), so a finished turn never covers something waiting for an answer. */
const PRIORITY = { failed: 4, finished: 2 } as const;
/** More than this waiting their turn is a burst nobody will read one by one. */
const MAX_QUEUED = 8;

/** Which session: the project and its worktree, as on the sessions card, or the folder alone outside Orca. */
function sessionName(notice: ClaudeNotice): string {
  return notice.project && notice.project !== notice.title ? `${notice.project} / ${notice.title}` : notice.title;
}

function NoticePill({ notice }: { notice: ClaudeNotice }) {
  const failed = notice.kind === "failed";
  return (
    <span className={styles.noticePill}>
      <span className={styles.noticeMark} data-kind={notice.kind}>
        {failed ? "▲" : "✓"}
      </span>
      <span className={styles.noticeFrom}>{sessionName(notice)}</span>
      <span className={styles.noticeWhat} data-kind={notice.kind}>
        {failed ? `· dừng: ${reasonLabel(notice.reason)}` : "· xong"}
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
        // No buttons, only a name and a sentence: the wider pill is what lets both be read whole.
        wide: true,
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
