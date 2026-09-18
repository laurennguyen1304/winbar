import { Icon } from "../../shell/Icon";
import { Artwork } from "./Artwork";
import { mediaControl, type MediaAction, type MediaTrack } from "./native";
import { artFor, useMedia } from "./store";
import styles from "./Media.module.css";

const run = (action: MediaAction) => () =>
  mediaControl(action).catch((err: unknown) => console.error(`media ${action} failed`, err));

/**
 * Previous, play-pause and next, right on the collapsed notch (bạn chốt 2026-09-18). Buttons are controls, so the
 * shell never opens the panel when one is clicked.
 */
function Controls({ track, size }: { track: MediaTrack; size: number }) {
  const playing = track.status === "playing";
  return (
    <span className={styles.pillControls}>
      <button
        type="button"
        className={styles.pillButton}
        disabled={!track.can.previous}
        aria-label="Bài trước"
        onClick={run("previous")}
      >
        <Icon name="skipPrev" size={size} />
      </button>
      <button
        type="button"
        className={styles.pillButton}
        disabled={!track.can.playPause}
        aria-label={playing ? "Tạm dừng" : "Phát"}
        onClick={run("playPause")}
      >
        <Icon name={playing ? "pause" : "play"} size={size} />
      </button>
      <button
        type="button"
        className={styles.pillButton}
        disabled={!track.can.next}
        aria-label="Bài kế"
        onClick={run("next")}
      >
        <Icon name="skipNext" size={size} />
      </button>
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
      <Controls track={track} size={15} />
    </>
  );
}

/** Media half of the always pill: artwork, title / artist and the same three controls. */
export function MediaMidPill() {
  const media = useMedia();
  const track = media.state.current;
  if (!track) return null;
  return (
    <>
      <span className={styles.midTrack} key={track.trackKey}>
        <Artwork url={artFor(media)} size={40} radius={9} />
        <span className={styles.midText}>
          <b className={styles.midTitle}>{track.title || "Không rõ tên bài"}</b>
          {track.artist && <span className={styles.midArtist}>{track.artist}</span>}
        </span>
      </span>
      <Controls track={track} size={17} />
    </>
  );
}
