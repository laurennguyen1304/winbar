// "Có bản winbar 0.2.0" on the pill (SPEC-update §5.2). Not a widget: it has no card and takes no tile.
import { useEffect } from "react";
import { useShell } from "../shell/shell-context";
import type { ShellApi } from "../shell/widget-contract";
import { dismissUpdate, onUpdateAvailable, openChangelog, updateStatus } from "./native";
import styles from "./Update.module.css";

export const ALERT_ID = "winbar-update";
/** Below the Claude usage warning (3): something happening right now matters more than a new version. */
const PRIORITY = 1;

function report(what: string) {
  return (err: unknown) => console.error(`${what} failed`, err);
}

/** Puts the notice for `version` on the pill. Pushing again with the same id replaces it, so repeats are harmless. */
export function announce(shell: ShellApi, version: string): void {
  const close = () => {
    shell.alerts.dismiss(ALERT_ID);
    dismissUpdate(version).catch(report("update_dismiss"));
  };
  shell.alerts.push({
    id: ALERT_ID,
    source: "winbar",
    priority: PRIORITY,
    Content: () => (
      <>
        <span className={styles.arrow}>↑</span>
        <span className={styles.text}>{`Có bản winbar ${version}`}</span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            openChangelog().catch(report("update_open_changelog"));
            close();
          }}
        >
          Xem
        </button>
        <button type="button" className={styles.button} onClick={close}>
          Để sau
        </button>
      </>
    ),
  });
}

/** Brings back a notice nobody answered yet, then waits for the weekly check to find a new one. */
export function UpdateNotice() {
  const shell = useShell();
  useEffect(() => {
    let live = true;
    updateStatus()
      .then((status) => live && status?.pending && announce(shell, status.pending))
      .catch(report("update_status"));
    const stop = onUpdateAvailable((version) => announce(shell, version));
    return () => {
      live = false;
      stop();
    };
  }, [shell]);
  return null;
}
