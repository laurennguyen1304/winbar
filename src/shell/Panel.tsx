import type { ReactNode } from "react";
import claudeTab from "../assets/claude/clawd-sleeping.png";
import { Icon } from "./Icon";
import { layoutTab } from "./layout";
import type { TabId, WidgetDefinition } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
import styles from "./Panel.module.css";

interface PanelProps {
  /** Enabled widgets, in Settings order. */
  widgets: WidgetDefinition[];
  tab: TabId;
  onTabChange(tab: TabId): void;
  onCollapse(): void;
  onOpenSettings?(): void;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "core", label: "Core" },
  { id: "claude", label: "Claude" },
];

export function Panel({ widgets, tab, onTabChange, onCollapse, onOpenSettings }: PanelProps) {
  const visibleTabs = TABS.filter((t) => t.id === "core" || widgets.some((w) => w.tab === t.id));
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "core";
  const tabWidgets = widgets.filter((w) => w.tab === activeTab);

  return (
    <>
      <div className={styles.header}>
        <div className={styles.tabs} role="tablist">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === activeTab}
              className={t.id === activeTab ? `${styles.tab} ${styles.active}` : styles.tab}
              onClick={() => onTabChange(t.id)}
            >
              {t.id === "claude" && <img src={claudeTab} alt="" width={18} height={18} />}
              {t.label}
            </button>
          ))}
        </div>
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
      {/* key: remount on tab change so the fade (M4) replays */}
      <div key={activeTab} className={styles.body} role="tabpanel">
        <TabBody widgets={tabWidgets} />
      </div>
    </>
  );
}

function TabBody({ widgets }: { widgets: WidgetDefinition[] }) {
  const layout = layoutTab(widgets);
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const card = (id: string): ReactNode => {
    const def = byId.get(id);
    if (!def) return null;
    return (
      <WidgetBoundary key={def.id} title={def.title}>
        <def.Card />
      </WidgetBoundary>
    );
  };

  switch (layout.kind) {
    case "empty":
      return <div className={styles.empty}>Chưa bật widget nào trong tab này.</div>;
    case "grid":
      return <div className={styles.grid}>{layout.ids.map(card)}</div>;
    case "columns": {
      const stack = <div className={styles.stack}>{layout.stack.map(card)}</div>;
      // `stretch` tells the grid this column may fill the panel; its card scrolls inside rather than growing it.
      const tall = <div className={`${styles.stack} ${styles.stretch}`}>{card(layout.tall)}</div>;
      return (
        <div className={styles.grid}>
          {layout.tallFirst ? tall : stack}
          {layout.tallFirst ? stack : tall}
        </div>
      );
    }
  }
}
