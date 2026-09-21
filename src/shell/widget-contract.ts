// Widget contract (SPEC-notch-shell.md §6). Widgets depend on this file; the shell never imports a concrete widget.
import type { ComponentType } from "react";

export type WidgetId = string; // kebab-case, same as the module id: "media", "claude-sessions"…
export type TabId = "core" | "claude";

export interface WidgetDefinition {
  id: WidgetId;
  tab: TabId;
  /** Shown in Settings › Widget and in the error card. */
  title: string;
  description: string;
  /** Content of the widget's card in the expanded panel. */
  Card: ComponentType;
  /** Content of the 340×36 pill when this widget has pill priority. */
  Pill?: ComponentType;
  /** Half of the 620×64 always-mode pill. */
  MidPill?: ComponentType;
  /**
   * Always mounted while the widget is enabled, renders nothing visible. Use it for work that must run while the
   * panel is closed, e.g. watching a source and pushing pill alerts.
   */
  Background?: ComponentType;
  /**
   * How much of the panel this widget is worth (SPEC-notch-shell §6).
   *
   * `large` takes a tall tile two rows high, `medium` a full-width row of its own, `small` a single cell in the
   * narrow column. A widget that says nothing is treated as `small`.
   *
   * `inPanel: false` keeps the card out of the notch altogether while the widget stays enabled: its search
   * provider and `Background` keep running. The clipboard lives in the command bar this way (the owner, 21/09).
   */
  layout?: { size?: WidgetSize; inPanel?: boolean };
  /** Collected by the shell for the command bar. */
  searchProvider?: SearchProvider;
  /**
   * A block the command bar shows under its search box while the input is empty (SPEC-command-bar §5).
   *
   * For a widget whose whole card is worth having one keystroke away rather than in the notch — the clipboard,
   * since 21/09. The command bar only shows blocks of enabled widgets, and knows none of them by name.
   */
  CommandBarBlock?: ComponentType;
}

/** Panel weight: how much room a widget's card is worth. */
export type WidgetSize = "large" | "medium" | "small";

export interface PillAlert {
  /** Unique; pushing the same id again replaces the alert. */
  id: string;
  source: WidgetId;
  /** Higher shows first; ties keep arrival order. */
  priority: number;
  /** Draws its own action buttons. */
  Content: ComponentType;
}

export interface ShellApi {
  alerts: { push(alert: PillAlert): void; dismiss(id: string): void };
  openPanel(tab?: TabId): void;
  collapse(): void;
  /** Temporary pill content, e.g. "Copied" (M7). */
  flashPill(content: ComponentType, ms?: number): void;
  /**
   * Hides or shows a widget everywhere (card, pill, always half) without disabling it in Settings; its Background
   * keeps running. Widgets start shown. Used by media when nothing is playing (SPEC-media §6.1).
   */
  setHidden(widgetId: WidgetId, hidden: boolean): void;
}

export interface SearchProvider {
  id: string;
  /** Group heading in the command bar, e.g. "Clipboard". */
  title: string;
  /** e.g. "cb"; typing it (alone or followed by a space) searches only this provider. */
  prefix?: string;
  /** Shown in results without a prefix; false = only reachable through the prefix. Default true. */
  inDefaultResults?: boolean;
  /**
   * Called on every query change (SPEC-command-bar §6). Runs in the command bar window, so read data through Rust
   * commands or events, never from notch React state. Must honour `signal`; slower than 1.5 s counts as failed.
   */
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>;
}

export interface SearchResult {
  /** Stable across searches; used for history and selection. */
  id: string;
  title: string;
  subtitle?: string;
  /** Data URL, image URL, or an icon name from src/shell/Icon.tsx. Without it the row shows the title's first letter. */
  icon?: string;
  /** Verb shown on the selected row: "Mở", "Copy", "Chạy". */
  verb: string;
  /** Higher sorts first inside the provider's group; the command bar does not re-rank across providers. */
  score?: number;
  run(): void | Promise<void>;
  /** Ctrl+Enter; omit when there is no secondary action. */
  runAlt?(): void | Promise<void>;
  /** false = never recorded in "Gần đây" (e.g. clipboard secrets). Default true. */
  remember?: boolean;
}
