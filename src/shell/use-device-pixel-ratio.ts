import { useEffect, useState } from "react";

const current = () => (window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);

/**
 * Physical px per CSS px for this page, kept live.
 *
 * On Windows it is the monitor's DPI scale times the text size set under Accessibility, so it is the number to size a
 * native window by, not the monitor's scale alone. It changes when the window moves to a screen with another DPI or
 * the text size is changed, and whoever sized a window from it has to do so again.
 */
export function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(current);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    // A resolution query only reports leaving the value it was made for, so a new one is made after each change.
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    if (typeof query?.addEventListener !== "function") return;
    const onChange = () => setRatio(current());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [ratio]);
  return ratio;
}
