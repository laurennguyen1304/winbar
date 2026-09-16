// Shared card chrome for widgets, matching the mockup's glass cards.
import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function Card({ children, grow = false }: { children: ReactNode; grow?: boolean }) {
  return <section className={grow ? `${styles.card} ${styles.grow}` : styles.card}>{children}</section>;
}

export function CardLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className={styles.label}>
      <span>{children}</span>
      {aside !== undefined && <span className={styles.aside}>{aside}</span>}
    </header>
  );
}
