import { useEffect, useRef, useState } from "react";
import { Icon } from "../../shell/Icon";
import { Card, CardLabel } from "../../shell/ui";
import { formatPercent, formatRam, level, ramPercent } from "./format";
import { openTaskManager } from "./native";
import { useSystemStats } from "./use-stats";
import styles from "./System.module.css";

/** How long "Đã mở Task Manager" stays. */
const NOTE_MS = 2000;

function Meter({ label, value, percent }: { label: string; value: string; percent: number | undefined }) {
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span className={styles.meterLabel}>{label}</span>
        <span className={styles.meterValue}>{value}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === undefined ? undefined : Math.round(percent)}
      >
        <i data-level={percent === undefined ? undefined : level(percent)} style={{ width: `${percent ?? 0}%` }} />
      </div>
    </div>
  );
}

/** "Core" card: CPU, memory and a Task Manager button (SPEC-system §5). */
export function SystemCard() {
  const { stats, failed } = useSystemStats();
  const [note, setNote] = useState<{ text: string; failed: boolean } | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const showNote = (text: string, isError = false) => {
    clearTimeout(timer.current);
    setNote({ text, failed: isError });
    // An error stays until the next action; a confirmation goes away on its own.
    if (!isError) timer.current = setTimeout(() => setNote(undefined), NOTE_MS);
  };

  const ramShare = stats && ramPercent(stats.ramUsedBytes, stats.ramTotalBytes);
  const openTask = () =>
    openTaskManager().then(
      () => showNote("Đã mở Task Manager"),
      (err: unknown) => {
        console.error("open_task_manager failed", err);
        showNote(`Không mở được Task Manager: ${String(err)}`, true);
      },
    );

  return (
    <Card className={styles.card}>
      <CardLabel
        aside={
          <button type="button" className={styles.button} onClick={openTask}>
            <Icon name="activity" size={14} />
            <span>Task Manager</span>
          </button>
        }
      >
        {/* "Core", not "Hệ thống": in the bento's narrow column the longer word pushed "Task Manager" onto a
            second line (the owner, 21/09). */}
        Core
      </CardLabel>
      <div className={styles.meters}>
        <Meter label="CPU" value={formatPercent(stats?.cpuPercent)} percent={stats?.cpuPercent} />
        <Meter
          label="RAM"
          value={stats ? formatRam(stats.ramUsedBytes, stats.ramTotalBytes) : "—"}
          percent={ramShare}
        />
      </div>
      {(note || failed) && (
        <p className={note?.failed || failed ? `${styles.note} ${styles.noteError}` : styles.note}>
          {note?.text ?? "Không đọc được tình trạng máy"}
        </p>
      )}
    </Card>
  );
}
