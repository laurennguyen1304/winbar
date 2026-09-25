import { useEffect, useState, type ReactNode } from "react";
import type { Settings } from "../shell/settings";
import { checkNow, openChangelog, updateStatus, type UpdateStatus } from "../update/native";
import { Button } from "@/settings/components/ui/button";
import { Switch } from "@/settings/components/ui/switch";

type UpdateSettings = Settings["update"];

function Row({ title, description, children }: { title: ReactNode; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b py-3.5">
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** What the last press of "Kiểm tra ngay" found. */
function outcome(status: UpdateStatus): string {
  if (status.error) return "Không kiểm tra được (mất mạng?)";
  return status.latest ? `Có bản ${status.latest}` : "Đang dùng bản mới nhất";
}

interface Props {
  value: UpdateSettings;
  onChange(next: UpdateSettings): void;
}

/** Settings › Chung › Cập nhật (SPEC-update §5.3). */
export function UpdateSection({ value, onChange }: Props) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let live = true;
    updateStatus()
      .then((s) => live && setStatus(s))
      .catch((err: unknown) => console.error("update_status failed", err));
    return () => {
      live = false;
    };
  }, []);

  const check = () => {
    setChecking(true);
    setResult(null);
    checkNow()
      .then((s) => {
        if (!s) return;
        setStatus(s);
        setResult(outcome(s));
      })
      .catch(() => setResult("Không kiểm tra được (mất mạng?)"))
      .finally(() => setChecking(false));
  };

  const version = (
    <>
      {status ? `Phiên bản ${status.current}` : "Phiên bản"}
      {status?.latest && (
        <>
          {" · "}
          <button
            type="button"
            className="text-[var(--switch-on)] underline-offset-2 hover:underline"
            onClick={() =>
              void openChangelog().catch((err: unknown) => console.error("update_open_changelog failed", err))
            }
          >
            Có bản {status.latest}
          </button>
        </>
      )}
    </>
  );

  return (
    <>
      <Row
        title="Tự kiểm tra bản mới"
        description="Hỏi GitHub một tuần một lần. Tắt thì winbar không tự gọi mạng để kiểm tra."
      >
        <Switch
          aria-label="Tự kiểm tra bản mới"
          checked={value.check}
          className="data-[state=checked]:bg-[var(--switch-on)]"
          onCheckedChange={(check) => onChange({ ...value, check })}
        />
      </Row>
      <Row title={version} description={result ?? "Cập nhật: thoát winbar, git pull, npm install rồi build lại."}>
        <Button variant="outline" size="sm" disabled={checking} onClick={check}>
          {checking ? "Đang kiểm tra…" : "Kiểm tra ngay"}
        </Button>
      </Row>
    </>
  );
}
