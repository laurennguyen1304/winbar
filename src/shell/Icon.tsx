import { Search, Settings, Sparks } from "iconoir-react";
import type { ComponentType, SVGProps } from "react";

// The only place that imports iconoir-react, so the icon set can be swapped in one file.
const ICONS = {
  sparks: Sparks,
  search: Search,
  settings: Settings,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      width={size}
      height={size}
      strokeWidth={1.8}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
