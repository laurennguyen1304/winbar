import { Icon } from "../../shell/Icon";
import styles from "./Media.module.css";

/**
 * Album art at `size` px. `null` = the app gave none (gradient + note, as in the mockup); `undefined` = still loading,
 * shown as the bare tile so nothing flashes.
 */
export function Artwork({ url, size, radius }: { url: string | null | undefined; size: number; radius: number }) {
  const box = { width: size, height: size, borderRadius: radius };
  if (url) return <img className={styles.art} style={box} src={url} alt="" />;
  return (
    <span className={styles.art} style={box} data-testid="art-placeholder">
      {url === null && <Icon name="music" size={Math.round(size * 0.4)} />}
    </span>
  );
}
