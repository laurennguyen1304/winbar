import { useEffect, useState, type ReactNode } from "react";
import { getFileSearchStatus, type FileSearchStatus } from "../command-bar/native";
import type { Settings } from "../shell/settings";
import { Button } from "@/settings/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/settings/components/ui/toggle-group";

type CommandBarSettings = Settings["commandBar"];

const FILE_SOURCES: Array<{ value: CommandBarSettings["fileSearch"]; label: string }> = [
  { value: "auto", label: "Tự động" },
  { value: "everything", label: "Everything" },
  { value: "windows", label: "Windows Search" },
  { value: "off", label: "Tắt" },
];

const WEB_ENGINES: Array<{ value: CommandBarSettings["webSearch"]; label: string; hint: string }> = [
  { value: "google", label: "Google", hint: "/g" },
  { value: "youtube", label: "YouTube", hint: "/y" },
  { value: "reddit", label: "Reddit", hint: "/r" },
  { value: "x", label: "X", hint: "/x" },
];

/** The line under "Tìm file": what searches use right now, or why nothing does. */
export function fileStatusText(mode: CommandBarSettings["fileSearch"], status: FileSearchStatus | undefined): string {
  if (mode === "off") return "Command bar không tìm file";
  if (!status) return "Đang kiểm tra nguồn tìm file…";
  if (status.active === "everything") return "Đang dùng Everything · tìm trên mọi ổ";
  if (status.active === "windows") {
    const note = mode === "auto" ? " (Everything không chạy)" : "";
    return `Đang dùng Windows Search${note} · chỉ thư mục người dùng đã được index`;
  }
  if (mode === "everything") return "Không có nguồn file: Everything đang không chạy";
  if (mode === "windows") return "Không có nguồn file: Windows Search không phản hồi";
  return "Không có nguồn file: Everything không chạy và Windows Search không phản hồi";
}

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b py-3.5">
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface Props {
  value: CommandBarSettings;
  onChange(next: CommandBarSettings): void;
}

/** Settings › Command bar (SPEC-command-bar §7): file source, preferred web engine, reset position. */
export function CommandBarSection({ value, onChange }: Props) {
  const [status, setStatus] = useState<FileSearchStatus | undefined>();

  // Ask again whenever the mode changes: Rust answers for the stored mode.
  useEffect(() => {
    let active = true;
    getFileSearchStatus()
      .then((s) => active && setStatus(s))
      .catch((err: unknown) => console.error("file_search_status failed", err));
    return () => {
      active = false;
    };
  }, [value.fileSearch]);

  return (
    <section id="set-command-bar">
      <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Command bar</h2>
      <Row title="Tìm file" description={fileStatusText(value.fileSearch, status)}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Nguồn tìm file"
          value={value.fileSearch}
          onValueChange={(v) => {
            if (!v) return;
            setStatus(undefined);
            onChange({ ...value, fileSearch: v as CommandBarSettings["fileSearch"] });
          }}
        >
          {FILE_SOURCES.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} aria-label={o.label} className="px-3">
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>
      <Row title="Tìm trên web bằng" description="Đứng đầu khi gõ ? và khi không có kết quả nào khác">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Trang tìm web ưu tiên"
          value={value.webSearch}
          onValueChange={(v) => v && onChange({ ...value, webSearch: v as CommandBarSettings["webSearch"] })}
        >
          {WEB_ENGINES.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} aria-label={o.label} className="px-3">
              {o.label}
              <span className="ml-1.5 font-mono text-[11px] opacity-60">{o.hint}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>
      <Row
        title="Vị trí command bar"
        description={value.position ? "Mở ở chỗ bạn đã kéo tới" : "Giữa màn hình có con trỏ, cách đỉnh 1/4"}
      >
        <Button variant="outline" size="sm" disabled={!value.position} onClick={() => onChange({ ...value, position: null })}>
          Đặt lại vị trí
        </Button>
      </Row>
    </section>
  );
}
