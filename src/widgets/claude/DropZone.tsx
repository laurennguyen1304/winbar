// A file held over the notch, and what became of it once dropped (SPEC-claude-drop §3).
import { useEffect } from "react";
import { useShell } from "../../shell/shell-context";
import { ClaudeIcon } from "./ClaudeIcon";
import { armDrop, onDrop, type DropEvent, type DropRefusal } from "./drop";
import { useClaude } from "./store";
import styles from "./Claude.module.css";

const WIDGET_ID = "claude-sessions";
const ALERT_ID = "claude-drop";
/**
 * Above a permission request (5): the file is in the user's hand right now, and the pill has to say what letting
 * go will do. The request is not answered or lost — it is back on the pill the moment this one leaves.
 */
const PRIORITY = 6;
/** WebView2 creates the window that receives a drag after the page has loaded; attach once more when it has. */
export const REARM_MS = 3000;
export const OPENED_MS = 1200;
export const FAILED_MS = 4000;

const REFUSALS: Record<DropRefusal, string> = {
  network: "Chỉ nhận file trên máy này, không nhận đường dẫn mạng",
  unsupported: "Không mở được loại đường dẫn này",
  "file-type": "Chỉ nhận PDF, ảnh, CSV, Excel và Word",
  "too-many": "Tối đa 10 file mỗi lần thả",
  missing: "File không còn ở đó",
  launch: "Không mở được terminal",
};

function Names({ names, count }: { names: string[]; count: number }) {
  const rest = count - names.length;
  return (
    <span className={styles.dropNames}>
      {names.join(", ")}
      {rest > 0 && ` +${rest}`}
    </span>
  );
}

function DropPill({ event }: { event: DropEvent }) {
  const { icons } = useClaude();
  if (event.kind === "leave") return null;
  const refusal = event.kind === "failed" ? event.reason : event.kind === "enter" ? event.refused : undefined;
  return (
    <span className={styles.dropPill}>
      <ClaudeIcon phase={refusal ? "idle" : "thinking"} extra={icons} size={22} rotateMs={0} />
      {refusal ? (
        <span className={styles.dropRefused}>{REFUSALS[refusal]}</span>
      ) : (
        <>
          <span className={styles.dropVerb}>{event.kind === "opened" ? "Đang mở Claude" : "Thả để hỏi Claude"}</span>
          {event.kind !== "failed" && <Names names={event.names} count={event.count} />}
        </>
      )}
    </span>
  );
}

/**
 * Shows a held file on the pill and the outcome of a drop. Renders nothing; mounted with the Claude widget's
 * background, so the notch only takes files while that widget is on.
 */
export function DropZone() {
  const shell = useShell();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timer);
      shell.alerts.dismiss(ALERT_ID);
    };
    const stop = onDrop((event) => {
      clearTimeout(timer);
      if (event.kind === "leave") {
        shell.alerts.dismiss(ALERT_ID);
        return;
      }
      shell.alerts.push({
        id: ALERT_ID,
        source: WIDGET_ID,
        priority: PRIORITY,
        Content: () => <DropPill event={event} />,
      });
      // A held file stays on the pill until Rust says it left; an outcome takes itself off.
      if (event.kind === "opened") timer = setTimeout(clear, OPENED_MS);
      if (event.kind === "failed") timer = setTimeout(clear, FAILED_MS);
    });

    const arm = () => armDrop(true).catch((err: unknown) => console.error("claude_drop_arm failed", err));
    void arm();
    const rearm = setTimeout(() => void arm(), REARM_MS);

    return () => {
      stop();
      clearTimeout(rearm);
      clear();
      armDrop(false).catch((err: unknown) => console.error("claude_drop_arm failed", err));
    };
  }, [shell]);

  return null;
}
