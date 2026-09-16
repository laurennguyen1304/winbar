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
  /** e.g. "cb" */
  prefix?: string;
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>;
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  run(): void | Promise<void>;
}
