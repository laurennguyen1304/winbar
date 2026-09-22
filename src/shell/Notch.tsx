import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";
import { onOpenNotchRequested, onWindowBlur, openSettings, requestNotchLayout, requestSticky } from "./native";
import type { OpenMode } from "./notch-machine";
import {
  ALWAYS_SIZES,
  DEFAULT_TOP_GAP,
  PANEL_MIN_HEIGHT,
  PANEL_RADIUS,
  PANEL_WIDTHS,
  PILL_SIZES,
  RESIZE_MS,
  alertSize,
  duoSize,
  panelFitWidth,
  panelHeight,
  panelMaxHeight,
  pillRadius,
  type Size,
} from "./notch-sizes";
import { useDevicePixelRatio } from "./use-device-pixel-ratio";
import { useNotchDrag } from "./notch-drag";
import { stickyHeight, windowSizeFor, type NotchLayout, type NotchMaterial } from "./notch-shape";
import { NotchShape } from "./NotchShape";
import { Panel } from "./Panel";
import { pickMidPills, pickPills } from "./pill-content";
import { registry } from "./registry";
import { useShellRuntime } from "./shell-context";
import { useNotchMachine } from "./use-notch-machine";
import type { WidgetDefinition } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
import styles from "./Notch.module.css";

interface NotchProps {
  /** Enabled widgets in Settings order (defaults to every registered widget until Settings exist). */
  widgets?: WidgetDefinition[];
  /** Widget shown first on the pill (Settings › Pill ưu tiên). */
  priorityWidget?: string;
  mode?: OpenMode;
  pillSize?: Size;
  alwaysSize?: Size;
  panelWidth?: number;
  topGap?: number;
  layout?: NotchLayout;
  material?: NotchMaterial;
  /** Solid black behind the material, 0-100. */
  opacity?: number;
  /** Logical px right of the screen centre (Settings › pill.offsetX). */
  offsetX?: number;
  /** A drag along the top edge ended here; the app saves it as pill.offsetX. */
  onOffsetChange?: (offsetX: number) => void;
  /** Reserve the strip above maximised windows (Settings › Sticky). */
  sticky?: boolean;
  /** Settings › Cỡ chữ, 0.85–1.3: scales text and icons inside the notch, not the notch size. */
  fontScale?: number;
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const defaultPill = (
  <>
    <Icon name="sparks" size={18} />
    <span>winbar</span>
    <span className={styles.grow} />
    <span className={styles.faint}>Ctrl+Space</span>
  </>
);

const brokenAlert = (
  <>
    <Icon name="sparks" size={18} />
    <span>Có việc cần bạn xem</span>
  </>
);

/** Clicks on a widget's own controls (buttons, links, inputs) must not also open the panel. */
const fromControl = (e: MouseEvent | KeyboardEvent) =>
  e.target !== e.currentTarget && (e.target as HTMLElement).closest("button, a, input, select, textarea") !== null;

export function Notch({
  widgets = registry.all(),
  priorityWidget,
  mode = "hover",
  pillSize = PILL_SIZES.m,
  alwaysSize = ALWAYS_SIZES.m,
  panelWidth: wantedPanelWidth = PANEL_WIDTHS.m,
  topGap = DEFAULT_TOP_GAP,
  layout = "attached",
  material = "liquid",
  opacity = 0,
  offsetX = 0,
  onOffsetChange,
  sticky = false,
  fontScale = 1,
}: NotchProps) {
  const { shell, snapshot } = useShellRuntime();
  const panelWidth = panelFitWidth(wantedPanelWidth, window.screen.width);
  // Windows text size makes CSS px bigger than the monitor's logical px; the native window is sized by this instead.
  const pixelRatio = useDevicePixelRatio();
  const { alert, flash } = snapshot;
  const { visual, dispatch } = useNotchMachine(mode, alert !== undefined);
  const expanded = visual === "expanded";
  // Widgets that hid themselves (ShellApi.setHidden) leave the pill and the panel; their Background keeps running.
  const shown = snapshot.hidden.size === 0 ? widgets : widgets.filter((w) => !snapshot.hidden.has(w.id));
  // Up to two: a Claude session and music playing at the same time widen the pill rather than hiding one.
  const pills = pickPills(shown, priorityWidget);
  const midPills = pickMidPills(shown, priorityWidget);

  // Let widgets open/collapse the panel through ShellApi. The panel shows everything at once now, so the tab a
  // caller asks for no longer picks anything — it is kept only so the tray and the command bar still compile.
  useEffect(() => {
    shell.bindNotch({
      open: () => {
        dispatch({ type: "clickPill" });
      },
      collapse: () => dispatch({ type: "close", reason: "collapseButton" }),
    });
    return () => shell.bindNotch(undefined);
  }, [shell, dispatch]);

  // Tray › "Mở notch".
  useEffect(
    () =>
      onOpenNotchRequested(() => {
        dispatch({ type: "clickPill" });
      }),
    [dispatch],
  );

  // Alerts from widgets that are no longer enabled go away.
  const enabledIds = widgets.map((w) => w.id).join("\n");
  useEffect(() => {
    shell.retainSources(new Set(enabledIds ? enabledIds.split("\n") : []));
  }, [shell, enabledIds]);

  // Panel height follows its content.
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(PANEL_MIN_HEIGHT);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!expanded || !el) return;
    // Visual height, so the font zoom is included.
    const measure = () => setContentHeight(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, fontScale]);

  const collapsed =
    visual === "always" || (expanded && mode === "always")
      ? alwaysSize
      : visual === "alert"
        ? alertSize(pillSize)
        : pills.length > 1
          ? duoSize(pillSize)
          : pillSize;
  const panel: Size = { width: panelWidth, height: panelHeight(contentHeight, window.screen.height) };
  const block = expanded ? panel : collapsed;
  const radius = expanded ? PANEL_RADIUS : pillRadius(collapsed);

  const drag = useNotchDrag({
    offsetX,
    windowWidth: windowSizeFor(block, layout).width,
    onPress: () => dispatch({ type: "pointerDown" }),
    onCommit: (x) => onOffsetChange?.(x),
  });

  // Native window: grow to the target before the CSS morph; shrink only after the morph finishes (SPEC R2).
  const firstLayout = useRef(true);
  const lastTarget = useRef<Size | undefined>(undefined);
  useEffect(() => {
    const target = expanded ? panel : collapsed;
    const growing =
      lastTarget.current === undefined ||
      target.width >= lastTarget.current.width ||
      target.height >= lastTarget.current.height;
    const delay = growing || firstLayout.current || prefersReducedMotion() ? 0 : RESIZE_MS;
    firstLayout.current = false;
    lastTarget.current = target;
    const timer = setTimeout(() => {
      // Attached: flush with the top edge, window wider by the flares (SPEC §15).
      requestNotchLayout(
        windowSizeFor(target, layout),
        layout === "attached" ? 0 : topGap,
        drag.offsetX,
        pixelRatio,
      ).catch((err: unknown) => console.error("notch_layout failed", err));
    }, delay);
    return () => clearTimeout(timer);
    // Depend on the numbers, not the object identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expanded,
    panel.width,
    panel.height,
    collapsed.width,
    collapsed.height,
    topGap,
    layout,
    drag.offsetX,
    pixelRatio,
  ]);

  // Sticky: reserve the collapsed notch's strip; the shell only re-lays out windows when the height changes.
  const reserve = sticky ? stickyHeight(mode === "always" ? alwaysSize : pillSize, layout, topGap) : null;
  // The strip is measured with the page's scale too, so it is asked for again when that changes.
  useEffect(() => {
    requestSticky(reserve).catch((err: unknown) => console.error("notch_sticky failed", err));
  }, [reserve, pixelRatio]);

  // Esc and clicks elsewhere close the panel.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "close", reason: "escape" });
    };
    window.addEventListener("keydown", onKey);
    const unlisten = onWindowBlur(() => dispatch({ type: "close", reason: "clickOutside" }));
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten();
    };
  }, [expanded, dispatch]);

  const openFromPill = (e: MouseEvent | KeyboardEvent) => {
    if (fromControl(e)) return;
    dispatch({ type: "clickPill" });
  };

  let pillContent: ReactNode;
  if (alert) {
    pillContent = (
      <WidgetBoundary key={alert.id} title={alert.source} fallback={brokenAlert}>
        <alert.Content />
      </WidgetBoundary>
    );
  } else if (flash) {
    pillContent = (
      <span key={flash.key} className={styles.flash}>
        <flash.Content />
      </span>
    );
  } else if (visual === "always" && midPills.length > 0) {
    pillContent = midPills.map((w, i) => {
      const Mid = w.MidPill as NonNullable<typeof w.MidPill>;
      return (
        <Fragment key={w.id}>
          {i > 0 && <span className={styles.divider} aria-hidden data-testid="mid-divider" />}
          <span className={styles.midBlock} data-testid={`mid-${w.id}`}>
            <WidgetBoundary title={w.title} fallback={<span>{w.title}</span>}>
              <Mid />
            </WidgetBoundary>
          </span>
        </Fragment>
      );
    });
  } else if (pills.length > 0) {
    pillContent = pills.map((w, i) => {
      const Pill = w.Pill as NonNullable<typeof w.Pill>;
      return (
        <Fragment key={w.id}>
          {i > 0 && <span className={styles.divider} aria-hidden data-testid="pill-divider" />}
          <span className={styles.midBlock} data-testid={`pill-${w.id}`}>
            <WidgetBoundary title={w.title} fallback={defaultPill}>
              <Pill />
            </WidgetBoundary>
          </span>
        </Fragment>
      );
    });
  } else {
    pillContent = defaultPill;
  }

  const pillClass = [styles.pill, visual === "always" ? styles.large : "", alert ? styles.alert : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.stage}>
      <div
        className={styles.notch}
        data-testid="notch"
        data-state={visual}
        data-layout={layout}
        data-dragging={drag.dragging || undefined}
        {...drag.handlers}
        style={{ width: block.width, height: block.height }}
        onMouseEnter={() => dispatch({ type: "pointerEnter" })}
        onMouseLeave={() => dispatch({ type: "pointerLeave" })}
      >
        <NotchShape
          layout={layout}
          material={material}
          opacity={opacity}
          targetHeight={block.height}
          radius={radius}
        />
        <div
          className={styles.body}
          style={{ borderRadius: layout === "attached" ? `0 0 ${radius}px ${radius}px` : radius }}
        >
          {expanded ? (
            <div
              className={styles.panel}
              ref={contentRef}
              // The zoom divides both: the measurement below is in visual px, but these are the zoomed units.
              style={{
                width: panelWidth / fontScale,
                maxHeight: panelMaxHeight(window.screen.height) / fontScale,
                zoom: fontScale,
              }}
            >
              <Panel
                widgets={shown}
                onCollapse={() => dispatch({ type: "close", reason: "collapseButton" })}
                onOpenSettings={() => void openSettings()}
              />
            </div>
          ) : (
            <div
              className={pillClass}
              style={{ zoom: fontScale }}
              role="button"
              tabIndex={0}
              aria-label={alert ? "Thông báo trên pill" : "Mở notch"}
              onClick={openFromPill}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !fromControl(e)) {
                  e.preventDefault();
                  openFromPill(e);
                }
              }}
            >
              {pillContent}
            </div>
          )}
        </div>
      </div>

      {/* Widgets' background work keeps running while the panel is closed. */}
      <div hidden>
        {widgets.map(
          (w) =>
            w.Background && (
              <WidgetBoundary key={w.id} title={w.title} fallback={null}>
                <w.Background />
              </WidgetBoundary>
            ),
        )}
      </div>
    </div>
  );
}
