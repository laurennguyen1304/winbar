import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { quitApp } from "../shell/native";
import { ALWAYS_SIZES, NOTCH_OPACITY_RANGE, PANEL_WIDTHS, PILL_SIZES, TOP_GAP_RANGE } from "../shell/notch-sizes";
import { PillPreview } from "../shell/PillPreview";
import { registry } from "../shell/registry";
import { mergeWidgets, moveWidget, notchPropsFrom, type Settings } from "../shell/settings";
import { windowSizeFor } from "../shell/notch-shape";
import { useSettings } from "../shell/use-settings";
import { ClaudeSection } from "./ClaudeSection";
import { ClipboardSection } from "./ClipboardSection";
import { CommandBarSection } from "./CommandBarSection";
import { HotkeySection } from "./HotkeySection";
import type { TabId, WidgetDefinition } from "../shell/widget-contract";
import { Button } from "@/settings/components/ui/button";
import { ScrollArea } from "@/settings/components/ui/scroll-area";
import { Slider } from "@/settings/components/ui/slider";
import { Switch } from "@/settings/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/settings/components/ui/toggle-group";

const SECTIONS = [
  { id: "pill", label: "Pill" },
  { id: "widget", label: "Widget" },
  { id: "font", label: "Cỡ chữ" },
  { id: "hotkey", label: "Phím tắt" },
  { id: "command-bar", label: "Command bar" },
  { id: "clipboard", label: "Clipboard" },
  { id: "claude", label: "Claude" },
  { id: "general", label: "Chung" },
] as const;

const TAB_LABEL: Record<TabId, string> = { core: "Tab Core", claude: "Tab Claude" };

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    // Wraps in a narrow window: the control drops under its title instead of running off the right edge.
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b py-3.5">
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange(value: T): void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} aria-label={o.label} className="px-3">
          {o.label}
          {/* The sizes are a nicety; below 768px they would push the group past the edge. */}
          {o.hint && <span className="ml-1.5 font-mono text-[11px] opacity-60 max-md:hidden">{o.hint}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Widest thing in the preview, flares included: the always pill, or the pill carrying two widgets. */
function previewWidth(settings: Settings, registered: readonly WidgetDefinition[]): number {
  const { alwaysSize, pillSize, layout } = notchPropsFrom(settings, registered);
  return Math.max(windowSizeFor(alwaysSize, layout).width, windowSizeFor(pillSize, layout).width);
}

/**
 * Scales its content down to the space it has, never up.
 *
 * The preview draws the notch at its real size — 700px for the large always pill — which is wider than the whole
 * page in a small window, and used to push everything to its right out of view.
 */
function FitWidth({ width, children }: { width: number; children: ReactNode }) {
  const [room, setRoom] = useState(width);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRoom(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = room > 0 ? Math.min(1, room / width) : 1;
  return (
    <div ref={ref} className="flex w-full min-w-0 justify-center overflow-hidden">
      <div style={{ zoom: scale }}>{children}</div>
    </div>
  );
}

export function SettingsApp({ registered = registry.all() }: { registered?: WidgetDefinition[] }) {
  const { settings, update } = useSettings(registered);
  // While a slider is being dragged the preview follows the draft; the value is saved when the drag ends.
  const [draft, setDraft] = useState<Settings | null>(null);
  const view = draft ?? settings;

  const save = (next: Settings) => {
    setDraft(null);
    void update(next);
  };
  const setPill = (patch: Partial<Settings["pill"]>) => save({ ...view, pill: { ...view.pill, ...patch } });

  const widgets = mergeWidgets(view.widgets, registered);
  const byId = new Map(registered.map((w) => [w.id, w]));
  const pillCapable = registered.filter((w) => w.Pill || w.MidPill);

  return (
    <div className="flex h-full">
      <aside className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r px-3.5 py-5 md:w-52">
        <h1 className="mx-2 mb-3 text-base font-semibold">Cài đặt</h1>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#set-${s.id}`}
            className="rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
        <span className="grow" />
        <Button variant="outline" onClick={() => void quitApp()}>
          Thoát winbar
        </Button>
      </aside>

      <ScrollArea className="min-w-0 grow">
        <main className="flex flex-col gap-6 px-5 pt-5 pb-7 md:px-7">
          <section
            aria-label="Xem trước"
            className="flex flex-col items-center gap-3.5 rounded-2xl border bg-[radial-gradient(60%_70%_at_18%_25%,#5f86b8_0%,transparent_60%),radial-gradient(50%_60%_at_85%_15%,#b58cab_0%,transparent_60%),linear-gradient(160deg,#2c3a52,#182130)] p-4"
          >
            <div className="flex w-full justify-between text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <span>Xem trước</span>
              <span className="font-normal normal-case">Pill thường · Pill always</span>
            </div>
            <FitWidth width={previewWidth(view, registered)}>
              <div className="flex flex-col items-center gap-3.5">
                <PillPreview settings={view} registered={registered} variant="pill" />
                <PillPreview settings={view} registered={registered} variant="always" />
              </div>
            </FitWidth>
          </section>

          <section id="set-pill">
            <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Pill</h2>
            <Row title="Kích thước pill" description="Pill thu gọn ở chế độ hover / click">
              <Choice
                label="Kích thước pill"
                value={view.pill.size}
                onChange={(size) => setPill({ size })}
                options={[
                  { value: "s", label: "Nhỏ", hint: `${PILL_SIZES.s.width}×${PILL_SIZES.s.height}` },
                  { value: "m", label: "Vừa", hint: `${PILL_SIZES.m.width}×${PILL_SIZES.m.height}` },
                  { value: "l", label: "Lớn", hint: `${PILL_SIZES.l.width}×${PILL_SIZES.l.height}` },
                ]}
              />
            </Row>
            <Row title="Kích thước pill always" description="Pill lớn hiện cùng lúc hai widget">
              <Choice
                label="Kích thước pill always"
                value={view.pill.alwaysSize}
                onChange={(alwaysSize) => setPill({ alwaysSize })}
                options={[
                  { value: "m", label: "Vừa", hint: `${ALWAYS_SIZES.m.width}×${ALWAYS_SIZES.m.height}` },
                  { value: "l", label: "Lớn", hint: `${ALWAYS_SIZES.l.width}×${ALWAYS_SIZES.l.height}` },
                ]}
              />
            </Row>
            <Row title="Độ rộng khi mở rộng" description="Chiều cao tự theo nội dung">
              <Choice
                label="Độ rộng khi mở rộng"
                value={view.pill.panelWidth}
                onChange={(panelWidth) => setPill({ panelWidth })}
                options={[
                  { value: "s", label: "Hẹp", hint: `${PANEL_WIDTHS.s}` },
                  { value: "m", label: "Vừa", hint: `${PANEL_WIDTHS.m}` },
                  { value: "l", label: "Rộng", hint: `${PANEL_WIDTHS.l}` },
                ]}
              />
            </Row>
            <Row title="Kiểu notch" description="Giọt nước: dính mép trên, loe cong vào mép · Pill nổi: cách mép trên">
              <Choice
                label="Kiểu notch"
                value={view.pill.layout}
                onChange={(layout) => setPill({ layout })}
                options={[
                  { value: "attached", label: "Giọt nước" },
                  { value: "float", label: "Pill nổi" },
                ]}
              />
            </Row>
            <Row title="Nền notch" description="Liquid glass: trong hơn, có vệt sáng · Đặc: dễ đọc trên trang sáng">
              <Choice
                label="Nền notch"
                value={view.pill.material}
                onChange={(material) => setPill({ material })}
                options={[
                  { value: "liquid", label: "Liquid glass" },
                  { value: "dense", label: "Đặc" },
                ]}
              />
            </Row>
            <Row
              title="Độ đục nền"
              description="0%: giữ nguyên độ trong của chất liệu · 100%: nền đen kín, không nhìn xuyên qua được"
            >
              <div className="flex w-64 items-center gap-3">
                <Slider
                  aria-label="Độ đục nền"
                  min={NOTCH_OPACITY_RANGE.min}
                  max={NOTCH_OPACITY_RANGE.max}
                  step={NOTCH_OPACITY_RANGE.step}
                  value={[view.pill.opacity]}
                  onValueChange={([opacity]) => setDraft({ ...view, pill: { ...view.pill, opacity } })}
                  onValueCommit={([opacity]) => setPill({ opacity })}
                />
                <output className="w-10 text-right font-mono text-xs text-muted-foreground">
                  {view.pill.opacity}%
                </output>
              </div>
            </Row>
            <Row title="Vị trí ngang" description="Nhấn giữ notch rồi kéo sang trái/phải dọc mép trên">
              <div className="flex items-center gap-3">
                <output className="font-mono text-xs text-muted-foreground">
                  {view.pill.offsetX === 0 ? "giữa" : `${view.pill.offsetX > 0 ? "+" : ""}${view.pill.offsetX}px`}
                </output>
                <Button variant="outline" disabled={view.pill.offsetX === 0} onClick={() => setPill({ offsetX: 0 })}>
                  Về giữa
                </Button>
              </div>
            </Row>
            <Row title="Màn hình" description="Máy nhiều màn hình: chỉ một notch ở màn chính, hoặc mỗi màn một notch">
              <Choice
                label="Màn hình"
                value={view.pill.monitor}
                onChange={(monitor) => setPill({ monitor })}
                options={[
                  { value: "primary", label: "Màn chính" },
                  { value: "all", label: "Cả 2 màn" },
                ]}
              />
            </Row>
            <Row
              title="Sticky"
              description="Notch nằm trong dải giữ chỗ phía trên, cửa sổ phóng to bắt đầu dưới dải. Có YASB ở cạnh trên thì dải và notch nằm ngay dưới YASB"
            >
              <Switch
                aria-label="Sticky"
                checked={view.pill.sticky}
                className="data-[state=checked]:bg-[var(--switch-on)]"
                onCheckedChange={(sticky) => setPill({ sticky })}
              />
            </Row>
            <Row
              title="Cách mép trên màn hình"
              description="Chỉ dùng cho pill nổi. Tăng lên ~40 nếu dùng cùng thanh yasb"
            >
              <div className="flex w-64 items-center gap-3">
                <Slider
                  aria-label="Cách mép trên màn hình"
                  min={TOP_GAP_RANGE.min}
                  max={TOP_GAP_RANGE.max}
                  step={1}
                  value={[view.pill.topGap]}
                  onValueChange={([topGap]) => setDraft({ ...view, pill: { ...view.pill, topGap } })}
                  onValueCommit={([topGap]) => setPill({ topGap })}
                />
                <output className="w-10 text-right font-mono text-xs text-muted-foreground">
                  {view.pill.topGap}px
                </output>
              </div>
            </Row>
            <Row title="Cách mở" description="hover: rê chuột · click: bấm · always: pill lớn luôn hiện">
              <Choice
                label="Cách mở"
                value={view.pill.openMode}
                onChange={(openMode) => setPill({ openMode })}
                options={[
                  { value: "hover", label: "hover" },
                  { value: "click", label: "click" },
                  { value: "always", label: "always" },
                ]}
              />
            </Row>
            <Row title="Pill ưu tiên hiện" description="Nội dung pill thu gọn; cảnh báo cấp quyền luôn chen lên trước">
              <Choice
                label="Pill ưu tiên hiện"
                value={view.pill.priorityWidget ?? ""}
                onChange={(priorityWidget) => setPill({ priorityWidget })}
                options={pillCapable.map((w) => ({ value: w.id, label: w.title }))}
              />
            </Row>
          </section>

          <section id="set-widget">
            <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Widget</h2>
            <p className="mb-2 text-xs text-muted-foreground">Bật/tắt và sắp xếp thứ tự hiển thị trong panel.</p>
            {(["core", "claude"] as const).map((tab) => {
              const rows = widgets.filter((w) => byId.get(w.id)?.tab === tab);
              if (rows.length === 0) return null;
              return (
                <div key={tab} className="mt-4">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                    {TAB_LABEL[tab]}
                  </span>
                  {rows.map((row, i) => {
                    const def = byId.get(row.id) as WidgetDefinition;
                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-3 border-b py-2.5"
                        data-testid={`widget-row-${row.id}`}
                      >
                        <div className="flex gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Đưa ${def.title} lên`}
                            disabled={i === 0}
                            onClick={() => save({ ...view, widgets: moveWidget(widgets, row.id, -1, registered) })}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Đưa ${def.title} xuống`}
                            disabled={i === rows.length - 1}
                            onClick={() => save({ ...view, widgets: moveWidget(widgets, row.id, 1, registered) })}
                          >
                            ↓
                          </Button>
                        </div>
                        <div className="min-w-0 grow">
                          <div className="text-sm">{def.title}</div>
                          <div className="text-xs text-muted-foreground">{def.description}</div>
                        </div>
                        <Switch
                          aria-label={`Bật ${def.title}`}
                          checked={row.enabled}
                          className="data-[state=checked]:bg-[var(--switch-on)]"
                          onCheckedChange={(enabled) =>
                            save({ ...view, widgets: widgets.map((w) => (w.id === row.id ? { ...w, enabled } : w)) })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>

          <section id="set-font">
            <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Cỡ chữ</h2>
            <Row title="Cỡ chữ trong pill và panel" description="Áp dụng cho chữ và biểu tượng bên trong notch">
              <div className="flex w-64 items-center gap-3">
                <Slider
                  aria-label="Cỡ chữ"
                  min={85}
                  max={130}
                  step={5}
                  value={[view.fontScale]}
                  onValueChange={([fontScale]) => setDraft({ ...view, fontScale })}
                  onValueCommit={([fontScale]) => save({ ...view, fontScale })}
                />
                <output className="w-10 text-right font-mono text-xs text-muted-foreground">{view.fontScale}%</output>
              </div>
            </Row>
          </section>

          <HotkeySection
            accelerator={view.hotkeys.commandBar}
            onChange={(commandBar) => save({ ...view, hotkeys: { ...view.hotkeys, commandBar } })}
          />

          <CommandBarSection value={view.commandBar} onChange={(commandBar) => save({ ...view, commandBar })} />

          <ClipboardSection value={view.clipboard} onChange={(clipboard) => save({ ...view, clipboard })} />

          <ClaudeSection value={view.claude} onChange={(claude) => save({ ...view, claude })} />

          <section id="set-general">
            <h2 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Chung</h2>
            <Row
              title="Khởi động cùng Windows"
              description="Tự mở winbar khi đăng nhập (chỉ bản cài đặt, không áp dụng khi chạy dev)"
            >
              <Switch
                aria-label="Khởi động cùng Windows"
                checked={view.launchAtStartup}
                className="data-[state=checked]:bg-[var(--switch-on)]"
                onCheckedChange={(launchAtStartup) => save({ ...view, launchAtStartup })}
              />
            </Row>
          </section>
        </main>
      </ScrollArea>
    </div>
  );
}
