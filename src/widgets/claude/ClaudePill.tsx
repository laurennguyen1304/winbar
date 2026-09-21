import { useEffect, useRef } from "react";
import { useShell } from "../../shell/shell-context";
import { ClaudeIcon } from "./ClaudeIcon";
import { phaseLook, pillSession } from "./phase";
import { useClaude } from "./store";
import { pillUsage } from "./usage";
import styles from "./Claude.module.css";

const WIDGET_ID = "claude-sessions";
/** Half of the 48px source art, so the pixel set lands on whole pixels instead of blurring. */
const ICON_SIZE = 24;
const WARN_ALERT_ID = "claude-usage-warning";

/** The alert body. Kept small: the pill is narrow and this competes with whatever else wants it. */
function UsageWarning({ percent }: { percent: number }) {
  return (
    <>
      <span style={{ color: "var(--warn)" }}>▲</span>
      <span>{`Hạn mức 5 giờ còn ${Math.max(0, 100 - percent)}%`}</span>
    </>
  );
}

/**
 * Keeps the widget off the pill while nothing is running (SPEC-claude §5.1).
 *
 * This runs whether or not the panel is open, which is exactly why it does nothing but flip a flag: the session
 * list is already kept up to date by the store, and no timer of its own is needed.
 */
export function ClaudeBackground() {
  const { sessions, usage, options } = useClaude();
  const shell = useShell();
  const hasLive = pillSession(sessions) !== undefined;

  useEffect(() => {
    shell.setHidden(WIDGET_ID, !hasLive);
  }, [shell, hasLive]);

  // One warning per reset window: the same number arriving every two minutes must not keep re-alerting.
  const warnedFor = useRef<string | undefined>(undefined);
  const limit = usage.fiveHour;
  const threshold = options.usageWarnPercent;
  const window = limit?.resetsAt;
  const over = threshold > 0 && limit !== undefined && limit.percent >= threshold;

  useEffect(() => {
    if (!over || limit === undefined) return;
    // Without a reset time there is no window to key on, so warn once per app run instead of not at all.
    const key = window ?? "no-reset-time";
    if (warnedFor.current === key) return;
    warnedFor.current = key;
    const percent = limit.percent;
    shell.alerts.push({
      id: WARN_ALERT_ID,
      source: WIDGET_ID,
      priority: 3,
      Content: () => <UsageWarning percent={percent} />,
    });
  }, [shell, over, window, limit]);

  return null;
}

/** Collapsed pill: the session that matters most, and how much of the five-hour limit is gone. */
export function ClaudePill() {
  const { sessions, icons, usage } = useClaude();
  const session = pillSession(sessions);
  if (!session) return null;

  const look = phaseLook(session);
  const limit = pillUsage(usage);

  return (
    <span className={styles.pill}>
      <ClaudeIcon phase={session.phase} extra={icons} size={ICON_SIZE} />
      <span className={styles.pillPhase} style={{ color: look.color }}>
        {look.label}
      </span>
      {/* The pill is narrow: the project identifies the session, so the worktree gives way first. */}
      <span className={styles.pillProject}>{session.project ?? session.title}</span>
      {limit && <span className={styles.pillLimit}>{limit}</span>}
    </span>
  );
}
