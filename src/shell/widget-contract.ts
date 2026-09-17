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
  /** Content of the 340×40 pill when this widget has pill priority. */
  Pill?: ComponentType;
  /** Half of the 620×64 always-mode pill. */
  MidPill?: ComponentType;
  /**
   * Always mounted while the widget is enabled, renders nothing visible. Use it for work that must run while the
   * panel is closed, e.g. watching a source and pushing pill alerts.
   */
  Background?: ComponentType;
  /** `tall`: takes a whole column (e.g. clipboard). */
  layout?: { tall?: boolean };
  /** Collected by the shell for the command bar. */
  searchProvider?: SearchProvider;
}

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
