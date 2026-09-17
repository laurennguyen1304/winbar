import { Icon } from "../../shell/Icon";
import { Artwork } from "./Artwork";
import { mediaControl } from "./native";
import { artFor, useMedia } from "./store";
import styles from "./Media.module.css";

/** Four bars that bounce while playing and rest when paused (mockup `.eq`). */
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={styles.eq} data-playing={playing || undefined} data-testid="media-eq" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** Pill content when media is on the pill (SPEC-media §5.2, §5.6). */
export function MediaPill() {
  const media = useMedia();
  const track = media.state.current;
  if (!track) return null;
  return (
    <>
      <span className={styles.pillTrack} key={track.trackKey}>
        <Artwork url={artFor(media)} size={24} radius={6} />
        <span className={styles.pillTitle}>{track.title || "Không rõ tên bài"}</span>
        {track.artist && <span className={styles.pillArtist}>{track.artist}</span>}
      </span>
      <span className={styles.grow} />
      <Equalizer playing={track.status === "playing"} />
    </>
  );
}

/** Media half of the always pill: artwork, title / artist and play-pause (the button never opens the panel). */
export function MediaMidPill() {
  const media = useMedia();
  const track = media.state.current;
  if (!track) return null;
  const playing = track.status === "playing";
  return (
    <>
      <span className={styles.midTrack} key={track.trackKey}>
        <Artwork url={artFor(media)} size={40} radius={9} />
        <span className={styles.midText}>
          <b className={styles.midTitle}>{track.title || "Không rõ tên bài"}</b>
          {track.artist && <span className={styles.midArtist}>{track.artist}</span>}
        </span>
      </span>
      <button
        type="button"
        className={styles.iconButton}
        disabled={!track.can.playPause}
        aria-label={playing ? "Tạm dừng" : "Phát"}
        onClick={() => mediaControl("playPause").catch((err: unknown) => console.error("media play/pause failed", err))}
      >
        <Icon name={playing ? "pause" : "play"} size={16} />
      </button>
    </>
  );
}
