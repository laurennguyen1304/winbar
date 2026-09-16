import { useEffect } from "react";
import { Icon } from "./Icon";
import { requestNotchLayout } from "./native";
import { DEFAULT_TOP_GAP, PILL_SIZES, pillRadius, type Size } from "./notch-sizes";
import styles from "./Notch.module.css";

interface NotchProps {
  size?: Size;
  topGap?: number;
}

// Task 3: static pill only. States, widgets and settings arrive in later tasks.
export function Notch({ size = PILL_SIZES.m, topGap = DEFAULT_TOP_GAP }: NotchProps) {
  useEffect(() => {
    requestNotchLayout(size, topGap).catch((err: unknown) => console.error("notch_layout failed", err));
  }, [size, topGap]);

  return (
    <div className={styles.notch} style={{ borderRadius: pillRadius(size) }} data-testid="notch" data-state="pill">
      <div className={styles.pill}>
        <Icon name="sparks" size={18} />
        <span>winbar</span>
        <span className={styles.grow} />
        <span className={styles.faint}>Ctrl+Space</span>
      </div>
    </div>
  );
}
