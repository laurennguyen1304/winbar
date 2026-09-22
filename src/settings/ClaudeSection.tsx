import type { ReactNode } from "react";
import type { Settings } from "../shell/settings";
import { Switch } from "@/settings/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/settings/components/ui/toggle-group";

type ClaudeSettings = Settings["claude"];

const ROTATE: Array<{ value: number; label: string }> = [
  { value: 0, label: "Tắt" },
  { value: 4, label: "4s" },
  { value: 6, label: "6s" },
  { value: 10, label: "10s" },
];

const WARN: Array<{ value: number; label: string }> = [
  { value: 0, label: "Tắt" },
  { value: 80, label: "80%" },
  { value: 90, label: "90%" },
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
  value: ClaudeSettings;
  onChange(next: ClaudeSettings): void;
}

/** Settings › Claude (SPEC-claude §7). */
export function ClaudeSection({ value, onChange }: Props) {
  return (
    <section id="set-claude">
      <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Claude</h2>

      <Row
        title="Bật layout Claude"
        description="Tắt thì winbar không đọc gì về Claude: không theo dõi phiên, không gọi mạng"
      >
        <Switch
          aria-label="Bật layout Claude"
          checked={value.enabled}
          className="data-[state=checked]:bg-[var(--switch-on)]"
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </Row>

      <Row title="Đổi ảnh trạng thái sau" description="Chỉ đổi khi trạng thái đó có nhiều hơn một ảnh">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Thời gian đổi ảnh"
          value={String(value.iconRotateSeconds)}
          onValueChange={(v) => v && onChange({ ...value, iconRotateSeconds: Number(v) })}
        >
          {ROTATE.map((o) => (
            <ToggleGroupItem key={o.value} value={String(o.value)} aria-label={o.label} className="px-3">
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>

      <Row title="Báo khi hạn mức 5 giờ vượt" description="Hiện cảnh báo trên pill, mỗi chu kỳ reset một lần">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Ngưỡng cảnh báo hạn mức"
          value={String(value.usageWarnPercent)}
          onValueChange={(v) => v && onChange({ ...value, usageWarnPercent: Number(v) })}
        >
          {WARN.map((o) => (
            <ToggleGroupItem key={o.value} value={String(o.value)} aria-label={o.label} className="px-3">
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>

      <Row
        title="Hạn mức của mọi tài khoản"
        description="Hỏi công cụ đổi tài khoản nếu máy có; không có thì chỉ hiện tài khoản đang đăng nhập"
      >
        <Switch
          aria-label="Hạn mức của mọi tài khoản"
          checked={value.multiAccount}
          className="data-[state=checked]:bg-[var(--switch-on)]"
          onCheckedChange={(multiAccount) => onChange({ ...value, multiAccount })}
        />
      </Row>
    </section>
  );
}
