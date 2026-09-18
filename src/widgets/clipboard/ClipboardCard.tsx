import { useEffect, useRef, useState } from "react";
import { Icon } from "../../shell/Icon";
import { useShell } from "../../shell/shell-context";
import { Card, CardLabel } from "../../shell/ui";
import { ClipRow } from "./ClipRow";
import { CHIPS, emptyMessage, filterClips, type Chip } from "./filter";
import { clearClips, copyClip, pauseClipboard, pinClip, removeClip } from "./native";
import { clearSkipped, refresh, useClipboard } from "./store";
import styles from "./Clipboard.module.css";

/** How long a row says "Đã copy" (SPEC-clipboard §5.3). */
const COPIED_MS = 1200;
/** How long the "skipped something sensitive" line stays (SPEC §5.4). */
const SKIPPED_MS = 3000;
/** How often the relative times are refreshed. */
const TICK_MS = 30_000;

const SKIP_TEXT = {
  "app-flag": "Đã bỏ qua một mục nhạy cảm",
  secret: "Đã bỏ qua một mục nhạy cảm",
  "ignored-app": "Đã bỏ qua một mục từ app trong danh sách bỏ qua",
  paused: "Đang tạm dừng nên không lưu",
};

/** What the collapsed pill says after a copy (SPEC-clipboard §5.3, SPEC-notch-shell M7). */
function CopiedPill() {
  return (
    <>
      <Icon name="check" size={14} />
      <span>Đã copy</span>
    </>
  );
}

/** A clock that only ticks while the card is on screen, so a closed panel costs nothing. */
function useNow(intervalMs = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "Clipboard" card: the history with a search box, filter chips, pinning and deleting (SPEC-clipboard §5.3). */
export function ClipboardCard() {
  const { items, paused, skipped, thumbs } = useClipboard();
  const [chip, setChip] = useState<Chip>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | undefined>(undefined);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const now = useNow();
  const shell = useShell();
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // The skipped note says its piece and goes.
  useEffect(() => {
    if (!skipped) return;
    const id = setTimeout(clearSkipped, SKIPPED_MS);
    return () => clearTimeout(id);
  }, [skipped]);

  const fail = (what: string) => (err: unknown) => {
    console.error(`${what} failed`, err);
    setError(`Không ${what} được`);
  };

  const onCopy = (id: string) => {
    setError(undefined);
    copyClip(id).then(() => {
      clearTimeout(copiedTimer.current);
      setCopied(id);
      copiedTimer.current = setTimeout(() => setCopied(undefined), COPIED_MS);
      // The panel is usually about to close, so the pill says it too.
      shell.flashPill(CopiedPill);
    }, fail("copy"));
  };

  const shown = filterClips(items, chip, query);

  return (
    <Card grow className={styles.card}>
      <CardLabel
        aside={
          <button
            type="button"
            className={paused ? `${styles.pauseButton} ${styles.pauseOn}` : styles.pauseButton}
            aria-pressed={paused}
            onClick={() => pauseClipboard(!paused).then(refresh, fail("đổi trạng thái"))}
          >
            <Icon name={paused ? "play" : "pause"} size={13} />
            <span>{paused ? "Đang tạm dừng" : "Tạm dừng"}</span>
          </button>
        }
      >
        Clipboard
      </CardLabel>

      <div className={styles.search}>
        <Icon name="search" size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm trong clipboard…"
          aria-label="Tìm trong clipboard"
          spellCheck={false}
        />
        {query && (
          <button type="button" className={styles.iconButton} aria-label="Xóa ô tìm" onClick={() => setQuery("")}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div className={styles.chips} role="group" aria-label="Lọc theo loại">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={chip === c.id ? `${styles.chip} ${styles.chipOn}` : styles.chip}
            aria-pressed={chip === c.id}
            onClick={() => setChip(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {shown.length === 0 ? (
          <p className={styles.empty}>{emptyMessage(items.length)}</p>
        ) : (
          shown.map((item) => (
            <ClipRow
              key={item.id}
              item={item}
              thumb={thumbs[item.id]}
              now={now}
              copied={copied === item.id}
              onCopy={() => onCopy(item.id)}
              onPin={() => void pinClip(item.id, !item.pinned).catch(fail("ghim"))}
              onRemove={() => void removeClip(item.id).catch(fail("xóa"))}
            />
          ))
        )}
      </div>

      {skipped && <p className={styles.note}>{SKIP_TEXT[skipped.reason]}</p>}
      {error && <p className={`${styles.note} ${styles.noteError}`}>{error}</p>}

      <div className={styles.footer}>
        {confirmClear ? (
          <>
            <span className={styles.note}>Xóa hết, trừ mục đã ghim?</span>
            <button type="button" className={styles.textButton} onClick={() => setConfirmClear(false)}>
              Hủy
            </button>
            <button
              type="button"
              className={`${styles.textButton} ${styles.danger}`}
              onClick={() => {
                setConfirmClear(false);
                void clearClips().catch(fail("xóa tất cả"));
              }}
            >
              Xóa tất cả
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.textButton}
            disabled={items.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            Xóa tất cả
          </button>
        )}
      </div>
    </Card>
  );
}
