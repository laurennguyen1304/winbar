// System widget (SPEC-system): CPU, memory and Task Manager.
import { scoreName, Tier } from "../../command-bar/rank";
import type { SearchProvider, WidgetDefinition } from "../../shell/widget-contract";
import { openTaskManager } from "./native";
import { SystemCard } from "./SystemCard";

/** Names the command bar matches against, so "task", "quan ly tac vu" and "quản lý tác vụ" all find it. */
export const TASK_MANAGER_NAMES = ["Mở Task Manager", "Task Manager", "quản lý tác vụ", "taskmgr", "tiến trình"];

export const systemSearch: SearchProvider = {
  id: "system",
  title: "Hệ thống",
  search: (query) => {
    const best = TASK_MANAGER_NAMES.map((name) => scoreName(query, name))
      // Two letters at least, and only real word matches: this row must not show up for stray letters.
      .map((s) => (query.trim().length >= 2 && s && s.tier >= Tier.WordPrefix ? s.score : -1))
      .reduce((a, b) => Math.max(a, b), -1);
    if (best < 0) return Promise.resolve([]);
    return Promise.resolve([
      {
        id: "open-task-manager",
        title: "Mở Task Manager",
        subtitle: "winbar · Hệ thống",
        icon: "activity",
        verb: "Mở",
        score: best,
        run: () => openTaskManager(),
      },
    ]);
  },
};

export const systemWidget: WidgetDefinition = {
  id: "system",
  tab: "core",
  title: "Hệ thống",
  description: "CPU, RAM, Task Manager",
  layout: { size: "small" },
  Card: SystemCard,
  searchProvider: systemSearch,
};
