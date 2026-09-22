import { useState, type ReactNode } from "react";
import { clearClips } from "../widgets/clipboard/native";
import { DEFAULT_IGNORED_APPS, type Settings } from "../shell/settings";
import { Button } from "@/settings/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/settings/components/ui/toggle-group";

type ClipboardSettings = Settings["clipboard"];

const RETENTIONS: Array<{ value: ClipboardSettings["retentionDays"]; label: string }> = [
  { value: 1, label: "1 ngày" },
  { value: 2, label: "2 ngày" },
];

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
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

interface Props {
  value: ClipboardSettings;
  onChange(next: ClipboardSettings): void;
}

/** Settings › Clipboard (SPEC-clipboard §7): how long to keep, which apps to skip, and wiping the history. */
export function ClipboardSection({ value, onChange }: Props) {
  const [newApp, setNewApp] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<number | undefined>(undefined);

  const addApp = () => {
    const name = newApp.trim().toLowerCase();
    if (!name || value.ignoredApps.includes(name)) {
      setNewApp("");
      return;
    }
    onChange({ ...value, ignoredApps: [...value.ignoredApps, name] });
    setNewApp("");
  };

  const isDefaultList =
    value.ignoredApps.length === DEFAULT_IGNORED_APPS.length &&
    value.ignoredApps.every((a, i) => a === DEFAULT_IGNORED_APPS[i]);

  return (
    <section id="set-clipboard">
      <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Clipboard</h2>

      <Row title="Giữ lịch sử trong" description="Mục đã ghim thì giữ mãi, không bị dọn theo thời gian">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Thời gian giữ lịch sử"
          value={String(value.retentionDays)}
          onValueChange={(v) =>
            v && onChange({ ...value, retentionDays: Number(v) as ClipboardSettings["retentionDays"] })
          }
        >
          {RETENTIONS.map((o) => (
            <ToggleGroupItem key={o.value} value={String(o.value)} aria-label={o.label} className="px-3">
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>

      <Row title="Ghi lại" description="Tắt thì winbar không lưu gì cho tới khi bật lại">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={value.paused}
          onClick={() => onChange({ ...value, paused: !value.paused })}
        >
          {value.paused ? "Đang tạm dừng" : "Đang ghi"}
        </Button>
      </Row>

      <div className="border-b py-3.5">
        <div className="text-sm">Không lưu gì copy từ</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Theo tên file chạy, không phân biệt hoa thường. Mặc định là các trình quản lý mật khẩu.
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {value.ignoredApps.map((app) => (
            <li key={app} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
              <span>{app}</span>
              <button
                type="button"
                aria-label={`Bỏ ${app}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange({ ...value, ignoredApps: value.ignoredApps.filter((a) => a !== app) })}
              >
                ×
              </button>
            </li>
          ))}
          {value.ignoredApps.length === 0 && <li className="text-xs text-muted-foreground">Danh sách đang trống</li>}
        </ul>
        <div className="mt-2.5 flex gap-2">
          <input
            className="h-8 w-56 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Thêm app vào danh sách bỏ qua"
            placeholder="ví dụ: keepassxc"
            value={newApp}
            onChange={(e) => setNewApp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addApp();
            }}
          />
          <Button variant="outline" size="sm" disabled={!newApp.trim()} onClick={addApp}>
            Thêm
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDefaultList}
            onClick={() => onChange({ ...value, ignoredApps: [...DEFAULT_IGNORED_APPS] })}
          >
            Đặt lại mặc định
          </Button>
        </div>
      </div>

      <Row
        title="Xóa toàn bộ lịch sử"
        description={cleared === undefined ? "Xóa hết, trừ mục đã ghim. Không lấy lại được." : `Đã xóa ${cleared} mục.`}
      >
        {confirmClear ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmClear(false);
                clearClips().then(setCleared, (err: unknown) => console.error("clipboard_clear failed", err));
              }}
            >
              Xóa hết
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
            Xóa toàn bộ
          </Button>
        )}
      </Row>
    </section>
  );
}
