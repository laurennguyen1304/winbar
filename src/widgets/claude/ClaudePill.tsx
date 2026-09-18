import { useEffect } from "react";
import { useShell } from "../../shell/shell-context";
import { ClaudeIcon } from "./ClaudeIcon";
import { phaseLook, pillSession } from "./phase";
import { useClaude } from "./store";
import { pillUsage } from "./usage";
import styles from "./Claude.module.css";

const WIDGET_ID = "claude-sessions";

/**
 * Keeps the widget off the pill while nothing is running (SPEC-claude §5.1).
 *
 * This runs whether or not the panel is open, which is exactly why it does nothing but flip a flag: the session
 * list is already kept up to date by the store, and no timer of its own is needed.
 */
export function ClaudeBackground() {
  const { sessions } = useClaude();
  const shell = useShell();
  const hasLive = pillSession(sessions) !== undefined;

  useEffect(() => {
    shell.setHidden(WIDGET_ID, !hasLive);
  }, [shell, hasLive]);

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
      <ClaudeIcon phase={session.phase} extra={icons} size={20} />
      <span className={styles.pillText}>
        <span className={styles.pillPhase} style={{ color: look.color }}>
          {look.label}
        </span>
        <span className={styles.pillProject}>
          {/* The pill is narrow: the project is what identifies the session, so the worktree gives way first. */}
          {session.project ?? session.title}
        </span>
      </span>
      {limit && <span className={styles.pillLimit}>{limit}</span>}
    </span>
  );
}
