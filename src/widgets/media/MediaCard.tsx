import { Icon } from "../../shell/Icon";
import { Card, CardLabel } from "../../shell/ui";
import { Artwork } from "./Artwork";
import { formatTime, positionNow, useNow } from "./progress";
import { artFor, useMedia } from "./store";
import styles from "./Media.module.css";

/** "Đang phát" card (SPEC-media §5.2). Renders nothing without a session; the widget is hidden then anyway. */
export function MediaCard() {
  const media = useMedia();
  const track = media.state.current;
  const ticking = track?.status === "playing" && track.durationMs !== null;
  const now = useNow(ticking);
  if (!track) return null;

  const art = artFor(media);
  const app = media.state.sessions.find((s) => s.id === track.sessionId)?.appName;
  const position = positionNow(track, now);
  const playing = track.status === "playing";

  return (
    <Card className={styles.card}>
      {art && <img className={styles.backdrop} src={art} alt="" />}
      <CardLabel aside={app}>Đang phát</CardLabel>
      <div className={styles.body} key={track.trackKey} data-testid="media-body">
        <Artwork url={art} size={140} radius={16} />
        <div className={styles.info}>
          <span className={styles.title}>{track.title || "Không rõ tên bài"}</span>
          {track.artist && <span className={styles.artist}>{track.artist}</span>}
          {track.album && <span className={styles.album}>{track.album}</span>}
          <span className={styles.grow} />
          {position !== null && track.durationMs !== null && (
            <>
              <div
                className={styles.track}
                role="progressbar"
                aria-label="Tiến độ"
                aria-valuemin={0}
                aria-valuemax={Math.round(track.durationMs / 1000)}
                aria-valuenow={Math.round(position / 1000)}
              >
                <i style={{ width: `${(position / track.durationMs) * 100}%` }} />
              </div>
              <div className={styles.times}>
                <span>{formatTime(position)}</span>
                <span>{formatTime(track.durationMs)}</span>
              </div>
            </>
          )}
          <div className={styles.controls}>
            <button type="button" className={styles.iconButton} disabled={!track.can.previous} aria-label="Bài trước">
              <Icon name="skipPrev" size={18} />
            </button>
            <button
              type="button"
              className={styles.playButton}
              disabled={!track.can.playPause}
              aria-label={playing ? "Tạm dừng" : "Phát"}
            >
              <Icon name={playing ? "pause" : "play"} size={17} />
            </button>
            <button type="button" className={styles.iconButton} disabled={!track.can.next} aria-label="Bài kế">
              <Icon name="skipNext" size={18} />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
