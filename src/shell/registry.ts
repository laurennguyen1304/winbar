import type { TabId, WidgetDefinition } from "./widget-contract";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface WidgetRegistry {
  register(def: WidgetDefinition): void;
  all(): WidgetDefinition[];
  byTab(tab: TabId): WidgetDefinition[];
}

export function createRegistry(): WidgetRegistry {
  const widgets: WidgetDefinition[] = [];
  return {
    register(def) {
      if (!KEBAB.test(def.id)) throw new Error(`widget id "${def.id}" must be kebab-case`);
      if (widgets.some((w) => w.id === def.id)) throw new Error(`widget "${def.id}" is already registered`);
      widgets.push(def);
    },
    all: () => [...widgets],
    byTab: (tab) => widgets.filter((w) => w.tab === tab),
  };
}

/** App-wide registry; widgets register themselves from src/widgets/index.ts. */
export const registry = createRegistry();
export const registerWidget = (def: WidgetDefinition) => registry.register(def);
