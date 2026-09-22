import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import { bentoLayout, placeSmalls } from "./layout";
import type { WidgetDefinition } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
import styles from "./Panel.module.css";

interface PanelProps {
  /** Enabled widgets, in Settings order. */
  widgets: WidgetDefinition[];
  onCollapse(): void;
  onOpenSettings?(): void;
}

/**
 * The open panel: every enabled widget at once, in one bento (SPEC-notch-shell §6).
 *
 * There used to be a Core tab and a Claude tab. The owner asked for them merged on 20/09 — with the sessions
 * list trimmed to what is running, everything worth seeing fits in one view, and a tab that hides half of it
 * is one click between you and the thing you opened the notch for.
 */
export function Panel({ widgets, onCollapse, onOpenSettings }: PanelProps) {
  return (
    <>
      <div className={styles.header}>
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
        <Bento widgets={widgets} />
      </div>
    </>
  );
}

/** Matches `gap` on `.bento`. */
const GAP = 10;

function Bento({ widgets }: { widgets: WidgetDefinition[] }) {
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
    if (!grid || !balanced) return;
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
  }, [tiles]);

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

  const tile = (id: string, kind: "large" | "small" | "medium") => {
    const def = byId.get(id);
    if (!def) return null;
    return (
      <div key={id} className={styles.tile} data-tile={kind} data-id={id} style={position.get(id)}>
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
      data-large={large.length}
      data-small={small.length}
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
