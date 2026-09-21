import { useEffect } from "react";
import { Icon } from "../../shell/Icon";
import { startRowDrag } from "./drag";
import { relativeTime } from "./filter";
import type { ClipItem } from "./native";
import { requestThumb } from "./store";
import styles from "./Clipboard.module.css";

const KIND_ICON = { text: "text", link: "link", code: "code", image: "image" } as const;

export interface ClipRowProps {
  item: ClipItem;
  /** Data URL of the thumbnail, once it has been fetched. */
  thumb: string | undefined;
  now: number;
  copied: boolean;
  onCopy: () => void;
  onPin: () => void;
  onRemove: () => void;
}

/**
 * One line of the history: click to copy it back, pin and delete on hover (SPEC-clipboard §5.3).
 *
 * Only a picture can be dragged out. WebView2 does not hand an HTML5 text drag to Windows, so a text row that
 * announced itself as draggable simply did nothing when you dragged it — and `draggable` can swallow the click
 * that was the point of the row. The owner does not need text drag (20/09), so the offer is gone.
 */
export function ClipRow({ item, thumb, now, copied, onCopy, onPin, onRemove }: ClipRowProps) {
  const isImage = item.kind === "image";
  useEffect(() => {
    if (isImage) requestThumb(item.id);
  }, [isImage, item.id]);

  return (
    <div className={copied ? `${styles.row} ${styles.rowCopied}` : styles.row}>
      <button
        type="button"
        className={styles.rowBody}
        onClick={onCopy}
        title={item.preview}
        draggable={isImage}
        onDragStart={isImage ? (e) => startRowDrag(e.nativeEvent, item) : undefined}
      >
        {isImage ? (
          thumb ? (
            <img className={styles.thumb} src={thumb} alt="" />
          ) : (
            <span className={styles.thumbEmpty} />
          )
        ) : (
          <span className={styles.kindIcon}>
            <Icon name={KIND_ICON[item.kind]} size={15} />
          </span>
        )}
        <span className={styles.texts}>
          <span className={item.kind === "code" ? `${styles.preview} ${styles.mono}` : styles.preview}>
            {item.preview}
          </span>
          {(item.app || item.truncated) && (
            <span className={styles.meta}>
              {[item.app, item.truncated ? "đã cắt bớt" : undefined].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        {item.pinned && (
          <span className={styles.pinned}>
            <Icon name="pinSolid" size={13} />
          </span>
        )}
        {copied ? (
          <span className={styles.copied}>
            <Icon name="check" size={13} />
            Đã copy
          </span>
        ) : (
          <span className={styles.time}>{relativeTime(item.at, now)}</span>
        )}
      </button>
      <span className={styles.rowActions}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={item.pinned ? "Bỏ ghim" : "Ghim"}
          aria-pressed={item.pinned}
          onClick={onPin}
        >
          <Icon name={item.pinned ? "pinSolid" : "pin"} size={14} />
        </button>
        <button type="button" className={styles.iconButton} aria-label="Xóa item" onClick={onRemove}>
          <Icon name="trash" size={14} />
        </button>
      </span>
    </div>
  );
}
