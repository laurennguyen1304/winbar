import { Icon } from "../../shell/Icon";
import styles from "./Media.module.css";

/** A filled cover never shrinks below this, so a short tile still shows a picture rather than a sliver. */
export const MIN_FILL_HEIGHT = 120;

interface ArtworkProps {
  url: string | null | undefined;
  /** Square side in px. Ignored with `fill`. */
  size: number;
  radius: number;
  /**
   * Fill the width of the card and whatever height is left in it, cropping the cover to fit.
   *
   * The card's own art used to be a fixed square, which left the rest of its row empty once the card became a
   * tall bento tile (the owner, 21/09). The pill keeps its fixed squares: there the size is the whole point.
   */
  fill?: boolean;
}

/**
 * Album art. `null` = the app gave none (gradient + note, as in the mockup); `undefined` = still loading, shown as
 * the bare tile so nothing flashes.
 */
export function Artwork({ url, size, radius, fill = false }: ArtworkProps) {
  const box = fill
    ? // Basis 0, not auto: an <img> would otherwise size itself from the cover's own square shape and push
      // the whole panel taller. From zero it only takes what the row leaves over, and crops to fit.
      { width: "100%", flex: "1 1 0", minHeight: MIN_FILL_HEIGHT, borderRadius: radius }
    : { width: size, height: size, borderRadius: radius };
  if (url) return <img className={styles.art} style={box} src={url} alt="" />;
  return (
    <span className={styles.art} style={box} data-testid="art-placeholder">
      {url === null && <Icon name="music" size={fill ? 44 : Math.round(size * 0.4)} />}
    </span>
  );
}
