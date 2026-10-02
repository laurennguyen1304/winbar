import { useEffect, useState } from "react";
import { Button } from "@/settings/components/ui/button";
import {
  hookApply,
  hookPreview,
  hookStatus,
  type ClaudeHookPreview,
  type ClaudeHookStatus,
} from "./claude-hook";

const STATE_TEXT: Record<ClaudeHookStatus["state"], string> = {
  absent:
    "Chưa cài. Cần thêm hook vào settings.json của Claude Code; winbar cho bạn xem phần thay đổi trước khi ghi.",
  installed: "Đã cài. Yêu cầu cấp quyền của Claude Code hiện trên pill, kèm nút Từ chối và Cho phép.",
  stale: "Hook chưa đủ cho bản winbar này, hoặc đang trỏ tới một bản khác (file exe đã đổi chỗ). Cài lại để sửa.",
};

/** Whatever Rust said went wrong, as something to show. Rust's messages are already written for the user. */
const reason = (err: unknown) => (typeof err === "string" ? err : "Không thực hiện được. Thử lại sau.");

function DiffLine({ line }: { line: string }) {
  const tone = line.startsWith("+")
    ? "text-[var(--switch-on)]"
    : line.startsWith("-")
      ? "text-destructive"
      : "text-muted-foreground";
  return <div className={tone}>{line || " "}</div>;
}

/**
 * Settings › Claude › Duyệt quyền trên notch (SPEC-claude-approvals §4.7).
 *
 * The only place in winbar that writes into Claude Code's configuration, so there is no one-click path: every
 * write goes through a preview of exactly what will change, and the write itself is refused by Rust if the file is
 * no longer the one that was previewed.
 */
export function ClaudeHookRow() {
  const [status, setStatus] = useState<ClaudeHookStatus | null>(null);
  const [plan, setPlan] = useState<{ install: boolean; preview: ClaudeHookPreview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    hookStatus()
      .then((s) => live && setStatus(s))
      .catch((err: unknown) => live && setError(reason(err)));
    return () => {
      live = false;
    };
  }, []);

  // Outside the app (tests of the rest of Settings, a plain browser) there is nothing to show.
  if (!status) return error ? <p role="alert">{error}</p> : null;

  const run = (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    work()
      .catch((err: unknown) => setError(reason(err)))
      .finally(() => setBusy(false));
  };

  const look = (install: boolean) =>
    run(async () => {
      setDone(null);
      setPlan({ install, preview: await hookPreview(install) });
    });

  const write = () => {
    if (!plan) return;
    const { install, preview } = plan;
    run(async () => {
      try {
        const backup = await hookApply(install, preview);
        const next = await hookStatus();
        if (next) setStatus(next);
        setPlan(null);
        setDone(
          (install
            ? "Xong. Phiên Claude Code đang mở có thể phải mở lại mới dùng hook mới."
            : "Đã gỡ hook của winbar.") + (backup ? ` Bản cũ: ${backup}` : ""),
        );
      } catch (err) {
        // The usual reason is that the file changed since the preview. Show the new change rather than the old one.
        setPlan({ install, preview: await hookPreview(install) });
        throw err;
      }
    });
  };

  return (
    <div className="border-b py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
        <div className="min-w-0">
          <div className="text-sm">Duyệt quyền trên notch</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{STATE_TEXT[status.state]}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          {status.state !== "installed" && (
            <Button variant="outline" size="sm" disabled={busy || plan !== null} onClick={() => look(true)}>
              {status.state === "stale" ? "Cài lại…" : "Cài hook…"}
            </Button>
          )}
          {status.state !== "absent" && (
            <Button variant="outline" size="sm" disabled={busy || plan !== null} onClick={() => look(false)}>
              Gỡ hook…
            </Button>
          )}
        </div>
      </div>

      {plan && (
        <div className="mt-3 rounded-md border p-3 text-xs" role="group" aria-label="Xem trước thay đổi">
          <div className="text-muted-foreground">
            {plan.install ? "Sẽ thêm vào" : "Sẽ gỡ khỏi"} <span className="break-all">{plan.preview.settingsPath}</span>
          </div>
          {plan.preview.unchanged ? (
            <p className="mt-2">Không có gì cần thay đổi.</p>
          ) : (
            <>
              <pre
                className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed"
                // Focusable so a long diff can be scrolled from the keyboard.
                tabIndex={0}
                aria-label="Phần thay đổi trong settings.json"
              >
                {plan.preview.diff.split("\n").map((line, i) => (
                  <DiffLine key={i} line={line} />
                ))}
              </pre>
              <p className="mt-2 text-muted-foreground">
                {plan.preview.backupPath ? (
                  <>
                    File hiện tại được sao lưu trước tại <span className="break-all">{plan.preview.backupPath}</span>
                  </>
                ) : (
                  "Chưa có settings.json: winbar sẽ tạo file mới."
                )}
              </p>
              {plan.preview.reformats && (
                <p className="mt-1 text-muted-foreground">
                  File này đang được viết khác cách winbar ghi JSON (thụt lề, ký tự thoát, khoá lặp lại), nên winbar sẽ
                  viết lại cả những dòng không hiện ở trên. Claude Code đọc ra vẫn cùng giá trị; bản gốc nằm nguyên trong
                  file sao lưu.
                </p>
              )}
            </>
          )}
          <div className="mt-3 flex gap-2">
            {!plan.preview.unchanged && (
              <Button size="sm" disabled={busy} onClick={write}>
                Ghi vào settings.json
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setPlan(null)}>
              {plan.preview.unchanged ? "Đóng" : "Huỷ"}
            </Button>
          </div>
        </div>
      )}

      {status.state !== "absent" && !status.listening && (
        <p className="mt-2 text-xs text-destructive" role="status">
          winbar không mở được kênh nhận hook (tên kênh đã có chương trình khác giữ), nên chưa có yêu cầu nào tới được
          notch. Thoát hẳn winbar rồi mở lại; nếu vẫn vậy thì có chương trình khác trên máy đang chiếm tên đó.
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {done && <p className="mt-2 text-xs break-all text-muted-foreground">{done}</p>}
    </div>
  );
}
