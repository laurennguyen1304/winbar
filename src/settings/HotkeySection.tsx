import { useEffect, useState } from "react";
import { getHotkeyStatus, onHotkeyStatus, retryHotkey, type HotkeyStatus } from "../shell/native";
import { DEFAULT_SETTINGS } from "../shell/settings";
import { acceleratorFromKey } from "./accelerator";
import { Button } from "@/settings/components/ui/button";

const DEFAULT_HOTKEY = DEFAULT_SETTINGS.hotkeys.commandBar;

const PROBLEM_TEXT: Record<NonNullable<HotkeyStatus["problem"]>, string> = {
  "in-use":
    "Phím tắt đang bị app khác dùng (ví dụ YASB Quick Launch). Đổi sang phím khác, hoặc tắt phím ở app kia rồi bấm Thử lại.",
  invalid: "Phím tắt trong file cài đặt không hợp lệ.",
  failed: "Không đăng ký được phím tắt.",
};

interface Props {
  /** Stored shortcut (settings.hotkeys.commandBar). */
  accelerator: string;
  onChange(accelerator: string): void;
}

/** Settings › Phím tắt: change the command-bar shortcut and see whether Windows accepted it (SPEC criterion 8). */
export function HotkeySection({ accelerator, onChange }: Props) {
  const [status, setStatus] = useState<HotkeyStatus | undefined>();
  const [retrying, setRetrying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    const unlisten = onHotkeyStatus((s) => active && setStatus(s));
    getHotkeyStatus()
      .then((s) => active && s && setStatus(s))
      .catch((err: unknown) => console.error("get_hotkey_status failed", err));
    return () => {
      active = false;
      unlisten();
    };
  }, []);

  // While recording, the next complete key combination becomes the shortcut.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const result = acceleratorFromKey(e);
      if (result.kind === "waiting") return;
      if (result.kind === "invalid") {
        setHint(result.reason);
        return;
      }
      setRecording(false);
      setHint(undefined);
      if (result.kind === "done" && result.accelerator !== accelerator) onChange(result.accelerator);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, accelerator, onChange]);

  const retry = () => {
    setRetrying(true);
    retryHotkey()
      .then((s) => s && setStatus(s))
      .catch((err: unknown) => console.error("retry_hotkey failed", err))
      .finally(() => setRetrying(false));
  };

  // Only trust the status when it is about the stored shortcut (an event for the new one may still be on its way).
  const current = status?.accelerator === accelerator ? status : undefined;

  return (
    <section id="set-hotkey">
      <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Phím tắt</h2>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b py-3.5">
        <div className="min-w-0">
          <div className="text-sm">Mở command bar</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {recording ? (hint ?? "Nhấn tổ hợp phím mới… (Esc để hủy)") : "Dùng được ở mọi app"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <kbd
            aria-label="Phím tắt hiện tại"
            className={`rounded-md border px-2 py-1 font-mono text-xs ${recording ? "border-ring bg-accent" : "bg-secondary"}`}
          >
            {recording ? "…" : accelerator}
          </kbd>
          {current === undefined ? (
            <span className="text-xs text-muted-foreground">Đang kiểm tra…</span>
          ) : current.registered ? (
            <span className="text-xs text-[var(--ok)]">Đang hoạt động</span>
          ) : (
            <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
              Thử lại
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setHint(undefined);
              setRecording((r) => !r);
            }}
          >
            {recording ? "Hủy" : "Đổi phím"}
          </Button>
          {!recording && accelerator !== DEFAULT_HOTKEY && (
            <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_HOTKEY)}>
              Mặc định
            </Button>
          )}
        </div>
      </div>
      {current && !current.registered && current.problem && (
        <div role="alert" className="mt-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2.5 text-xs">
          {PROBLEM_TEXT[current.problem]}
          {current.message && <div className="mt-1 font-mono text-[11px] text-muted-foreground">{current.message}</div>}
        </div>
      )}
    </section>
  );
}
