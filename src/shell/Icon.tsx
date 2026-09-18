import {
  Activity,
  Calculator,
  Check,
  Code,
  EmptyPage,
  Eye,
  EyeClosed,
  Folder,
  Globe,
  Link,
  LogOut,
  MediaImage,
  MusicDoubleNote,
  NavArrowLeft,
  NavArrowRight,
  NavArrowUp,
  PauseSolid,
  Pin,
  PinSolid,
  PlaySolid,
  Search,
  Settings,
  SkipNextSolid,
  SkipPrevSolid,
  Sparks,
  Text,
  Trash,
  WarningTriangle,
  Xmark,
} from "iconoir-react";
import type { ComponentType, SVGProps } from "react";

/** Six-dot drag handle from the mockup; Iconoir has no 2×3 grip. */
function Grip(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 12 18" fill="currentColor" {...props} strokeWidth={undefined}>
      {[3, 9, 15].map((cy) => [3, 9].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.5} />))}
    </svg>
  );
}

// The only place that imports iconoir-react, so the icon set can be swapped in one file.
const ICONS = {
  sparks: Sparks,
  activity: Activity,
  search: Search,
  settings: Settings,
  collapse: NavArrowUp,
  grip: Grip,
  calculator: Calculator,
  check: Check,
  file: EmptyPage,
  folder: Folder,
  globe: Globe,
  eye: Eye,
  eyeClosed: EyeClosed,
  logOut: LogOut,
  warning: WarningTriangle,
  music: MusicDoubleNote,
  play: PlaySolid,
  pause: PauseSolid,
  skipNext: SkipNextSolid,
  skipPrev: SkipPrevSolid,
  previous: NavArrowLeft,
  next: NavArrowRight,
  text: Text,
  link: Link,
  code: Code,
  image: MediaImage,
  pin: Pin,
  pinSolid: PinSolid,
  trash: Trash,
  close: Xmark,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

export const isIconName = (name: string): name is IconName => Object.hasOwn(ICONS, name);

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
