import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Icon } from "./Icon";
import { bentoLayout, placeSmalls } from "./layout";
import type { WidgetDefinition, WidgetId } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
import styles from "./Panel.module.css";

interface PanelProps {
  /** Enabled widgets, in Settings order. */
  widgets: WidgetDefinition[];
  onCollapse(): void;
  onOpenSettings?(): void;
  /** A widget's own full-panel view, shown instead of the bento (`ShellApi.openWidgetDetail`). */
  detail?: WidgetDefinition;
  onCloseDetail?(): void;
}

/**
 * The open panel: every enabled widget at once, in one bento (SPEC-notch-shell §6).
 *
 * There used to be a Core tab and a Claude tab. The owner asked for them merged on 20/09 — with the sessions
 * list trimmed to what is running, everything worth seeing fits in one view, and a tab that hides half of it
 * is one click between you and the thing you opened the notch for.
 */
export function Panel({ widgets, onCollapse, onOpenSettings, detail, onCloseDetail }: PanelProps) {
  const Detail = detail?.Detail;
  // One widget blown up to the whole panel (the owner, 23/11). Local state: the Panel unmounts when the notch collapses,
  // so a click outside the bar — which collapses it — brings the full bento back on the next opening.
  const [focusedId, setFocusedId] = useState<WidgetId>();
  const focused = focusedId !== undefined && widgets.some((w) => w.id === focusedId) ? focusedId : undefined;
  const zoomed = focused !== undefined && !Detail;
  // Forget a widget that went away (media hides when nothing plays), so it does not zoom again when it comes back.
  if (focusedId !== undefined && focused === undefined) setFocusedId(undefined);

  // A click on bare panel — padding, header, the gap round the tile — puts every widget back.
  useEffect(() => {
    if (!zoomed) return;
    const onClick = (e: globalThis.MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest || target.closest("[data-tile]") || target.closest(CONTROLS)) return;
      setFocusedId(undefined);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [zoomed]);
  return (
    <>
      <div className={styles.header}>
        {Detail && (
          <button type="button" className={styles.backButton} onClick={onCloseDetail}>
            <span aria-hidden="true">‹</span> {detail.title}
          </button>
        )}
        <span className={styles.grow} />
        {onOpenSettings && (
          <button type="button" className={styles.iconButton} aria-label="Cài đặt" onClick={onOpenSettings}>
            <Icon name="settings" size={16} />
          </button>
        )}
        <button type="button" className={styles.iconButton} aria-label="Thu gọn" onClick={onCollapse}>
          <Icon name="collapse" size={16} />
        </button>
      </div>
      <div className={styles.body} role="group">
        {Detail ? (
          // Its own scroller: the panel stops at a share of the screen, and a view taller than that was cut off.
          <div className={styles.detail}>
            <WidgetBoundary title={detail.title}>
              <Detail />
            </WidgetBoundary>
          </div>
        ) : (
          <Bento widgets={widgets} focused={focused} onFocus={setFocusedId} />
        )}
      </div>
    </>
  );
}

/** A widget's own controls: a click on one does its job and never zooms or un-zooms the panel. */
const CONTROLS = "button, a, input, select, textarea, label, [role='button'], [data-own-click]";

/** Matches `gap` on `.bento`. */
const GAP = 10;

interface BentoProps {
  widgets: WidgetDefinition[];
  /** The tile shown alone across the whole panel. */
  focused?: WidgetId;
  onFocus(id: WidgetId): void;
}

function Bento({ widgets, focused, onFocus }: BentoProps) {
  const layout = bentoLayout(widgets);
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const gridRef = useRef<HTMLDivElement>(null);
  // Column of each small tile once measured; until then they stack in the free column, as they always did.
  const [placed, setPlaced] = useState<Record<string, number>>({});

  const { large, small, medium } = layout;
  const columns = large.length > 0 ? large.length + (small.length > 0 ? 1 : 0) : Math.max(1, small.length);
  const balanced = large.length > 0 && small.length > 0;

  // Natural heights do not depend on which column a tile is in (the column widths are fixed), so measuring again
  // after a move gives the same answer and the placement settles instead of flapping.
  const tiles = [...large, ...small].join(" ");
  useLayoutEffect(() => {
    const grid = gridRef.current;
    // Zoomed, the other tiles are not there to measure; un-zooming runs this again.
    if (!grid || !balanced || focused !== undefined) return;
    const measure = () => {
      // Unstretched for one synchronous layout, read, and put back before anything is painted.
      grid.setAttribute("data-measuring", "");
      const heights = new Map<string, number>();
      for (const el of Array.from(grid.children) as HTMLElement[]) {
        if (el.dataset.id) heights.set(el.dataset.id, el.getBoundingClientRect().height);
      }
      grid.removeAttribute("data-measuring");
      const next = placeSmalls(
        large.map((id) => heights.get(id) ?? 0),
        small.map((id) => ({ id, height: heights.get(id) ?? 0 })),
        columns,
        GAP,
      );
      setPlaced((prev) => (sameMap(prev, next) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    for (const el of Array.from(grid.children)) observer.observe(el);
    return () => observer.disconnect();
    // `tiles` stands for large and small, `columns` and `balanced` follow from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, focused]);

  if (widgets.length === 0) {
    return <div className={styles.empty}>Chưa bật widget nào.</div>;
  }

  // Each column is a stack: the large tile on top, then the small ones sent there. The last tile of a column runs to
  // the bottom of the band so no column leaves a hole under it.
  const stacks: string[][] = Array.from({ length: columns }, (_, i) => (i < large.length ? [large[i]] : []));
  small.forEach((id, i) => {
    const column = large.length === 0 ? i : (placed[id] ?? columns - 1);
    stacks[Math.min(column, columns - 1)].push(id);
  });
  const rows = Math.max(1, ...stacks.map((stack) => stack.length));
  const position = new Map<string, CSSProperties>();
  stacks.forEach((stack, column) =>
    stack.forEach((id, row) =>
      position.set(id, {
        gridColumn: column + 1,
        gridRow: row === stack.length - 1 ? `${row + 1} / ${rows + 1}` : row + 1,
      }),
    ),
  );
  medium.forEach((id, i) => position.set(id, { gridColumn: "1 / -1", gridRow: rows + 1 + i }));

  // Clicking a tile anywhere but on one of its own controls zooms it to the whole panel.
  const zoom = (id: string) => (e: MouseEvent<HTMLDivElement>) => {
    if (focused !== undefined || (e.target as Element).closest(CONTROLS)) return;
    onFocus(id);
  };

  const tile = (id: string, kind: "large" | "small" | "medium") => {
    const def = byId.get(id);
    if (!def) return null;
    if (focused !== undefined && id !== focused) return null;
    const style = focused === id ? { gridColumn: "1 / -1", gridRow: 1 } : position.get(id);
    return (
      // Mouse only: the keyboard keeps every tile's controls, and Esc still closes the panel.
      <div key={id} className={styles.tile} data-tile={kind} data-id={id} style={style} onClick={zoom(id)}>
        <WidgetBoundary title={def.title}>
          <def.Card />
        </WidgetBoundary>
      </div>
    );
  };

  return (
    // How many tall and small tiles there are decides how the row is split; CSS cannot count them on its own.
    <div
      ref={gridRef}
      className={styles.bento}
      // Zoomed, the split by tile count no longer applies: one column, the whole width.
      data-large={focused === undefined ? large.length : undefined}
      data-small={focused === undefined ? small.length : undefined}
      data-focused={focused}
      style={{ "--columns": columns } as CSSProperties}
    >
      {large.map((id) => tile(id, "large"))}
      {small.map((id) => tile(id, "small"))}
      {medium.map((id) => tile(id, "medium"))}
    </div>
  );
}

function sameMap(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}
