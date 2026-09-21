import { useEffect, useState } from "react";
import { Card, CardLabel } from "../../shell/ui";
import { refreshUsage, useClaude } from "./store";
import { errorNote, fetchedAgo, level, resetIn, windowNow } from "./usage";
import type { ClaudeAccountUsage, ClaudeWindow } from "./native";
import styles from "./Claude.module.css";

/** How often the card asks again while it is open. Rust still serves its 120-second cache in between. */
export const REFRESH_MS = 5 * 60_000;
/** How often the countdown redraws. */
const TICK_MS = 30_000;

function useNow(intervalMs = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Meter({ label, window, now }: { label: string; window: ClaudeWindow | undefined; now: number }) {
  const percent = window?.percent;
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span className={styles.meterLabel}>{label}</span>
        <span className={styles.meterValue}>
          {percent === undefined ? "—" : percent}
          <small>%</small>
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <i data-level={percent === undefined ? undefined : level(percent)} style={{ width: `${percent ?? 0}%` }} />
      </div>
      <span className={styles.reset}>{resetIn(window?.resetsAt, now)}</span>
    </div>
  );
}

/** One of the other accounts: a small 5-hour / 7-day pair under its name (SPEC-claude §5.5). */
function OtherAccount({ account, now }: { account: ClaudeAccountUsage; now: number }) {
  return (
    <div className={styles.account}>
      <div className={styles.accountHead}>
        <span className={styles.accountName}>{account.label}</span>
        <span>{account.needsLogin ? "cần đăng nhập lại" : fetchedAgo(account.fetchedAt, now)}</span>
      </div>
      <div className={`${styles.meters} ${styles.accountMeters}`}>
        <Meter label="5 giờ" window={windowNow(account.fiveHour, now)} now={now} />
        <Meter label="7 ngày" window={windowNow(account.sevenDay, now)} now={now} />
      </div>
    </div>
  );
}

/**
 * Asks for the limits and swallows a failure into the log.
 *
 * The command can genuinely reject — at startup the page is alive before Rust has managed its state — and an
 * uncaught rejection here surfaced as an unhandled error in the test run and in the console.
 */
function ask(force = false): void {
  refreshUsage(force).catch((err: unknown) => console.error("claude_usage failed", err));
}

/** "Hạn mức" card: the 5-hour and 7-day windows, plus any per-model limit (SPEC-claude §5.5). */
export function UsageCard() {
  const { usage } = useClaude();
  const now = useNow();

  // Ask once when the card appears, then occasionally while it stays open. Nothing runs behind a closed panel.
  useEffect(() => {
    ask();
    const id = setInterval(ask, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const note = errorNote(usage, now);
  // One account is what the card always showed; the names only earn their space once there is a second.
  const accounts = usage.accounts && usage.accounts.length > 1 ? usage.accounts : [];
  const active = accounts.find((a) => a.active);

  return (
    <Card className={styles.card}>
      <CardLabel
        aside={
          <button
            type="button"
            className={styles.refresh}
            onClick={() => ask(true)}
            aria-label="Cập nhật hạn mức"
          >
            {fetchedAgo(usage.fetchedAt, now) || "chưa có số"}
          </button>
        }
      >
        Hạn mức
      </CardLabel>

      {active && (
        <div className={styles.accountHead}>
          <span className={styles.accountName} data-active="">
            {active.label}
          </span>
        </div>
      )}

      <div className={styles.meters}>
        <Meter label="5 giờ" window={usage.fiveHour} now={now} />
        <Meter label="7 ngày" window={usage.sevenDay} now={now} />
      </div>

      {usage.perModel.length > 0 && (
        <p className={styles.perModel}>{usage.perModel.map((m) => `${m.label} ${m.percent}%`).join(" · ")}</p>
      )}

      {note && <p className={note.hasNumbers ? styles.note : `${styles.note} ${styles.noteError}`}>{note.text}</p>}

      {accounts
        .filter((a) => !a.active)
        .map((a) => (
          <OtherAccount key={a.id} account={a} now={now} />
        ))}
    </Card>
  );
}
