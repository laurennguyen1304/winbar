// A permission request on the notch: the pill, and the card that shows all of it (SPEC-claude-approvals §4.5).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Icon } from "../../shell/Icon";
import { useShell } from "../../shell/shell-context";
import { approvalShown, decide, useApprovals, type ClaudeApproval } from "./approvals";
import { ClaudeIcon } from "./ClaudeIcon";
import { useClaude } from "./store";
import styles from "./Claude.module.css";

const WIDGET_ID = "claude-sessions";
/** Above the usage warning (3) and the update notice (1): a session is stopped until this is answered. */
const PRIORITY = 5;
/**
 * How long the pill's buttons ignore clicks after they appear.
 *
 * The pill widens by itself, over whatever is at the top of the screen — a browser's tabs, a title bar. A click
 * already on its way to one of those must not land on "Cho phép". Half a second is longer than a click in flight
 * and shorter than anyone deciding to press.
 */
export const ARM_MS = 500;

const alertId = (id: string) => `claude-approval:${id}`;

/** True once `ARM_MS` has passed since the component appeared. */
function useArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(timer);
  }, []);
  return armed;
}

/**
 * Runs `measure` now and whenever the element changes size. The pill is measured while it is still widening, and
 * the card's text can reflow, so one look at mount is not enough.
 */
function useMeasured(ref: RefObject<HTMLElement | null>, measure: (el: HTMLElement) => void, key: unknown): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure(el);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
    return () => observer.disconnect();
    // `measure` is a fresh closure every render; what it reads only changes with `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, key]);
}

/**
 * The alert pill: who is asking, what for in one line, and the answers.
 *
 * "Cho phép" is only here when the line is the whole request and all of it is on screen (SPEC §4.5). When the
 * request is more than the pill shows — a second line, a file's new contents, a command cut off by the pill's
 * width — the button opens the card instead: the pill never offers to allow something it has not shown.
 */
function ApprovalPill({ id }: { id: string }) {
  const approvals = useApprovals();
  const { icons } = useClaude();
  const shell = useShell();
  const armed = useArmed();
  const approval = approvals.find((a) => a.id === id);
  const line = useRef<HTMLSpanElement>(null);
  // Starts as "cut off": until measured, nothing may be allowed from here.
  const [clipped, setClipped] = useState(true);
  useMeasured(line, (el) => setClipped(el.scrollWidth > el.clientWidth), approval?.summary);

  // Answered a moment ago; the alert is on its way out.
  if (!approval) return null;
  const others = approvals.length - 1;
  const shownInFull = approval.complete && !clipped;

  return (
    <span className={styles.approvalPill}>
      <ClaudeIcon phase="permission" extra={icons} size={22} rotateMs={0} />
      {/* Which session is asking: `git push` means something different in each repository. */}
      <span className={styles.approvalFrom} title="wait for you">
        {approval.project ?? approval.title}
      </span>
      <span ref={line} className={styles.approvalSummary} title="Bấm để xem đầy đủ">
        {approval.summary}
      </span>
      {others > 0 && <span className={styles.badge}>+{others}</span>}
      <button type="button" className={styles.approvalButton} disabled={!armed} onClick={() => decide(id, "deny")}>
        Từ chối
      </button>
      {shownInFull ? (
        <button
          type="button"
          className={`${styles.approvalButton} ${styles.approvalAllow}`}
          disabled={!armed}
          onClick={() => decide(id, "allow")}
        >
          Cho phép
        </button>
      ) : (
        // Opening the card decides nothing, so it needs no arming delay.
        <button
          type="button"
          className={`${styles.approvalButton} ${styles.approvalAllow}`}
          title="Yêu cầu này dài hơn những gì pill hiện được. Mở thẻ để đọc hết rồi duyệt."
          onClick={() => shell.openDetail(alertId(id))}
        >
          Xem…
        </button>
      )}
    </span>
  );
}

/** How close to the end of a scrolling box counts as the end, in px. */
const END_SLACK = 4;

/**
 * The full card: everything the tool was given, and a third way out.
 *
 * Two things can still keep "Cho phép" back here. Content that was cut before it reached winbar cannot be read
 * here at all, so it can only be refused or left to the terminal. And content taller than the box has to be
 * scrolled to its end first: the dangerous line of a long command is as likely to be the last one as the first.
 */
function ApprovalCard({ id }: { id: string }) {
  const approvals = useApprovals();
  const { icons } = useClaude();
  const shell = useShell();
  const approval = approvals.find((a) => a.id === id);
  const box = useRef<HTMLPreElement>(null);
  const [seenAll, setSeenAll] = useState(false);
  const check = (el: HTMLElement) => {
    // Once the end has been seen it stays seen: scrolling back up to re-read must not lock the button again.
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= END_SLACK) setSeenAll(true);
  };
  useMeasured(box, check, approval?.detail);

  if (!approval) return null;
  const others = approvals.length - 1;

  return (
    <div className={styles.approvalCard}>
      <header className={styles.approvalHead}>
        <ClaudeIcon phase="permission" extra={icons} size={28} rotateMs={0} />
        <span className={styles.approvalWho}>
          <b>{approval.project ?? approval.title}</b>
          {approval.project && <span>· {approval.title}</span>}
          <span className={styles.approvalAsks}>xin dùng {approval.tool}</span>
        </span>
        <button type="button" className={styles.approvalIcon} aria-label="Thu về pill" onClick={() => shell.collapse()}>
          <Icon name="collapse" size={16} />
        </button>
      </header>
      <pre
        ref={box}
        className={styles.approvalDetail}
        // Focusable so it can be scrolled from the keyboard.
        tabIndex={0}
        onScroll={(e) => check(e.currentTarget)}
      >
        {approval.detail || "(tool này không nhận tham số nào)"}
      </pre>
      {approval.truncated ? (
        <p className={styles.approvalNote}>
          Nội dung dài đã bị cắt bớt ở đây, nên không duyệt được từ winbar. Xem đầy đủ và trả lời trong terminal.
        </p>
      ) : (
        !seenAll && <p className={styles.approvalNote}>Cuộn hết nội dung để bật Cho phép.</p>
      )}
      <footer className={styles.approvalFoot}>
        <button type="button" className={styles.approvalButton} onClick={() => decide(id, "deny")}>
          Từ chối
        </button>
        {!approval.truncated && (
          <button
            type="button"
            className={`${styles.approvalButton} ${styles.approvalAllow}`}
            disabled={!seenAll}
            onClick={() => decide(id, "allow")}
          >
            Cho phép
          </button>
        )}
        <span className={styles.approvalRest}>{others > 0 ? `còn ${others} yêu cầu khác` : ""}</span>
        <button type="button" className={styles.approvalLink} onClick={() => decide(id, "release")}>
          Để terminal hỏi
        </button>
      </footer>
    </div>
  );
}

function alertFor(approval: ClaudeApproval) {
  const { id } = approval;
  return {
    id: alertId(id),
    source: WIDGET_ID,
    priority: PRIORITY,
    // Both read the store themselves, so the alert is pushed once and never needs replacing.
    Content: () => <ApprovalPill id={id} />,
    Detail: () => <ApprovalCard id={id} />,
  };
}

/**
 * Keeps the pill's alerts in step with the requests Rust holds. Renders nothing; mounted with the Claude widget's
 * background, so it runs while the panel is closed.
 */
export function ApprovalAlerts() {
  const approvals = useApprovals();
  const shell = useShell();
  const shown = useRef<Set<string>>(new Set());

  useEffect(() => {
    const waiting = new Set(approvals.map((a) => a.id));
    for (const id of shown.current) {
      if (!waiting.has(id)) shell.alerts.dismiss(alertId(id));
    }
    for (const approval of approvals) {
      if (shown.current.has(approval.id)) continue;
      shell.alerts.push(alertFor(approval));
      approvalShown(approval.id).catch((err: unknown) => console.error("claude_approval_shown failed", err));
    }
    // The same Set object throughout, so the cleanup below sees what is on the pill now, not what was at mount.
    shown.current.clear();
    waiting.forEach((id) => shown.current.add(id));
  }, [shell, approvals]);

  // The widget was turned off, or the page is going away: nothing of ours stays on the pill. The set is emptied
  // too, so a remount (React's strict mode does one on purpose) puts the alerts back instead of thinking they are
  // still up.
  useEffect(() => {
    const ids = shown.current;
    return () => {
      ids.forEach((id) => shell.alerts.dismiss(alertId(id)));
      ids.clear();
    };
  }, [shell]);

  return null;
}
