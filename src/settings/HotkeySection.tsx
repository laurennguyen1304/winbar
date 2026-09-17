import { useEffect, useState } from "react";
import { getHotkeyStatus, onHotkeyStatus, retryHotkey, type HotkeyStatus } from "../shell/native";
import { Button } from "@/settings/components/ui/button";

const PROBLEM_TEXT: Record<NonNullable<HotkeyStatus["problem"]>, string> = {
  "in-use":
    "Phím tắt đang bị app khác dùng. Nếu đang chạy yasb, tắt phím tắt Quick Launch (Ctrl+Space) trong config yasb, rồi bấm Thử lại.",
  invalid: "Phím tắt trong file cài đặt không hợp lệ.",
  failed: "Không đăng ký được phím tắt.",
};

/** Settings › Phím tắt: shows whether the command-bar shortcut is active and why not (SPEC criterion 8). */
export function HotkeySection() {
  const [status, setStatus] = useState<HotkeyStatus | undefined>();
  const [retrying, setRetrying] = useState(false);

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

  const retry = () => {
    setRetrying(true);
    retryHotkey()
      .then((s) => s && setStatus(s))
      .catch((err: unknown) => console.error("retry_hotkey failed", err))
      .finally(() => setRetrying(false));
  };

  return (
    <section id="set-hotkey">
      <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Phím tắt</h2>
      <div className="flex items-center justify-between gap-6 border-b py-3.5">
        <div className="min-w-0">
          <div className="text-sm">Mở command bar</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Dùng được ở mọi app</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <kbd className="rounded-md border bg-secondary px-2 py-1 font-mono text-xs">
            {status?.accelerator ?? "Ctrl+Space"}
          </kbd>
          {status === undefined ? (
            <span className="text-xs text-muted-foreground">Đang kiểm tra…</span>
          ) : status.registered ? (
            <span className="text-xs text-[var(--ok)]">Đang hoạt động</span>
          ) : (
            <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
              Thử lại
            </Button>
          )}
        </div>
      </div>
      {status && !status.registered && status.problem && (
        <div role="alert" className="mt-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2.5 text-xs">
          {PROBLEM_TEXT[status.problem]}
          {status.message && <div className="mt-1 font-mono text-[11px] text-muted-foreground">{status.message}</div>}
        </div>
      )}
    </section>
  );
}
