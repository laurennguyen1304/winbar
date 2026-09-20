import { useEffect, useState } from "react";
import { openTerminal } from "../../command-bar/native";
import { Card, CardLabel } from "../../shell/ui";
import { ClaudeIcon } from "./ClaudeIcon";
import { openDesktop, type ClaudeSession } from "./native";
import { ago, groupSessions, phaseLook, rowTime } from "./phase";
import { refreshHistory, refreshIcons, useClaude } from "./store";
import styles from "./Claude.module.css";

/** How often the relative times are refreshed. */
const TICK_MS = 30_000;
/** Half of the 48px source art, so the pixel set lands on whole pixels instead of blurring. */
const ICON_SIZE = 24;

function useNow(intervalMs = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Row({
  session,
  extra,
  rotateMs,
  now,
  dim,
}: {
  session: ClaudeSession;
  extra: Readonly<Record<string, string[]>>;
  rotateMs: number;
  now: number;
  dim?: boolean;
}) {
  const look = phaseLook(session);
  const isHistory = session.source === "history";
  const status = isHistory ? `${session.turns ?? 0} lượt · ${ago(session.lastActiveAt, now)}` : look.label;

  // Where the session actually lives. A Desktop session is in the Desktop app, not in a terminal, so opening a
  // terminal in its folder was never going to get Lauren back to it (20/09). The `cl` rows do the same.
  const open = () => {
    if (session.source !== "cli") {
      void openDesktop().catch((err: unknown) => console.error("claude_open_desktop failed", err));
    } else if (session.cwd) {
      void openTerminal(session.cwd).catch((err: unknown) => console.error("open_terminal failed", err));
    }
  };

  return (
    <button
      type="button"
      className={dim ? `${styles.row} ${styles.rowDim}` : styles.row}
      onClick={open}
      // A Desktop row needs no folder: it opens the app itself.
      disabled={session.source === "cli" && !session.cwd}
      title={session.source !== "cli" ? "Mở Claude Desktop" : (session.cwd ?? session.title)}
    >
      <ClaudeIcon phase={session.phase} extra={extra} rotateMs={rotateMs} size={ICON_SIZE} />
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>
          {session.project && <span className={styles.project}>{session.project}</span>}
          <span className={styles.worktree}>{session.title}</span>
          <span className={styles.badge}>{session.source === "history" ? "đã xong" : session.source}</span>
        </span>
        {/* Status and time share the second line, so neither line is left with an empty half. */}
        <span className={styles.statusLine}>
          <span className={styles.status} style={{ color: isHistory ? undefined : look.color }}>
            {status}
          </span>
          <span className={styles.time}>{isHistory ? "" : rowTime(session, now)}</span>
        </span>
      </span>
    </button>
  );
}

/** "Phiên Claude" card: what is running now, what has gone quiet, and recent Desktop sessions (SPEC §5.2). */
export function SessionsCard() {
  const { sessions, history: past, icons, options } = useClaude();
  const rotateMs = options.iconRotateSeconds * 1000;
  const now = useNow();
  const { live, quiet } = groupSessions(sessions);
  const history = past;

  // Both only matter while the card is on screen: a file dropped into the icons folder shows up without a
  // restart, and the Desktop history is too expensive to keep up to date behind a closed panel.
  useEffect(() => {
    void refreshIcons();
    void refreshHistory().catch((err: unknown) => console.error("claude_history failed", err));
  }, []);

  return (
    <Card className={styles.card}>
      <CardLabel aside={live.length > 0 ? `${live.length} đang mở` : undefined}>Phiên Claude</CardLabel>
      {sessions.length === 0 ? (
        <p className={styles.empty}>Không có phiên Claude nào đang mở</p>
      ) : (
        <div className={styles.list}>
          {live.map((s) => (
            <Row key={s.id} session={s} extra={icons} rotateMs={rotateMs} now={now} />
          ))}
          {quiet.length > 0 && <p className={styles.groupLabel}>Đã lâu không hoạt động</p>}
          {quiet.map((s) => (
            <Row key={s.id} session={s} extra={icons} rotateMs={rotateMs} now={now} dim />
          ))}
          {history.length > 0 && <p className={styles.groupLabel}>Phiên Desktop gần đây</p>}
          {history.map((s) => (
            <Row key={s.id} session={s} extra={icons} rotateMs={rotateMs} now={now} dim />
          ))}
        </div>
      )}
    </Card>
  );
}
