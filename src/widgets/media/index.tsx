// Media widget (SPEC-media): what is playing on Windows, in the card, the pill and the always pill.
import { useEffect } from "react";
import { useShell } from "../../shell/shell-context";
import type { WidgetDefinition } from "../../shell/widget-contract";
import { MediaCard } from "./MediaCard";
import { MediaMidPill, MediaPill } from "./MediaPill";
import { useMedia } from "./store";

/** Keeps the store live while the panel is closed and hides the widget when nothing has a media session (§5.5). */
function MediaBackground() {
  const shell = useShell();
  const none = useMedia().state.current === null;
  useEffect(() => shell.setHidden("media", none), [shell, none]);
  return null;
}

export const mediaWidget: WidgetDefinition = {
  id: "media",
  tab: "core",
  title: "Đang phát",
  description: "Ảnh bìa, tiến độ, điều khiển nhạc",
  layout: { size: "large" },
  Card: MediaCard,
  Pill: MediaPill,
  MidPill: MediaMidPill,
  Background: MediaBackground,
};
