// "Hành động" group (SPEC-command-bar §2): winbar's own actions. Matched on the Vietnamese title and on English
// keywords, so "settings", "quit" or "claude" work as well as "cài đặt" or "thoát".
import type { IconName } from "../../shell/Icon";
import type { SearchProvider, SearchResult } from "../../shell/widget-contract";
import { notchHidden, openNotch, openWinbarSettings, quitWinbar, setNotchHidden } from "../native";
import { scoreName, Tier } from "../rank";

export interface ActionsNative {
  openNotch(tab?: "core" | "claude"): Promise<void>;
  notchHidden(): Promise<boolean>;
  setNotchHidden(hidden: boolean): Promise<void>;
  openSettings(): Promise<void>;
  quit(): Promise<void>;
}

interface Action {
  id: string;
  title: string;
  keywords: string[];
  icon: IconName;
  remember?: boolean;
  run(): Promise<void>;
}

function actions(native: ActionsNative, hidden: boolean): Action[] {
  return [
    { id: "open-notch", title: "Mở notch", keywords: ["notch", "panel", "open"], icon: "sparks", run: () => native.openNotch() },
    {
      id: "open-notch-claude",
      title: "Mở notch · tab Claude",
      keywords: ["claude", "notch claude"],
      icon: "sparks",
      run: () => native.openNotch("claude"),
    },
    {
      id: "settings",
      title: "Cài đặt winbar",
      keywords: ["settings", "preferences", "winbar settings"],
      icon: "settings",
      run: () => native.openSettings(),
    },
    hidden
      ? { id: "show-notch", title: "Hiện notch", keywords: ["show notch", "notch"], icon: "eye", run: () => native.setNotchHidden(false) }
      : {
          id: "hide-notch",
          title: "Ẩn notch",
          keywords: ["hide notch", "notch"],
          icon: "eyeClosed",
          run: () => native.setNotchHidden(true),
        },
    { id: "quit", title: "Thoát winbar", keywords: ["quit", "exit", "close winbar"], icon: "logOut", remember: false, run: () => native.quit() },
  ];
}

export function createActionsProvider(
  native: ActionsNative = {
    openNotch,
    notchHidden,
    setNotchHidden,
    openSettings: openWinbarSettings,
    quit: quitWinbar,
  },
): SearchProvider {
  return {
    id: "winbar-actions",
    title: "Hành động",
    async search(query) {
      const hidden = await native.notchHidden();
      return actions(native, hidden).flatMap((action): SearchResult[] => {
        const best = [action.title, ...action.keywords]
          .map((name) => scoreName(query, name))
          // Fixed commands should not pop up for loose matches: "a" or letters scattered through a title.
          .map((s) => (query.trim().length >= 2 && s && s.tier >= Tier.WordPrefix ? s.score : -1))
          .reduce((a, b) => Math.max(a, b), -1);
        if (best < 0) return [];
        return [
          {
            id: action.id,
            title: action.title,
            subtitle: "winbar",
            icon: action.icon,
            verb: "Chạy",
            score: best,
            remember: action.remember,
            run: () => action.run(),
          },
        ];
      });
    },
  };
}
