import { useRef, type WheelEvent } from "react";
import { Icon } from "../../shell/Icon";
import { Card, CardLabel } from "../../shell/ui";
import { Artwork } from "./Artwork";
import { neighbourSession } from "./controls";
import { mediaControl, mediaSeek, mediaSelect } from "./native";
import { positionNow, useNow } from "./progress";
import { SeekBar } from "./SeekBar";
import { artFor, seekLocally, useMedia } from "./store";
import styles from "./Media.module.css";

/** One app switch per wheel gesture. */
const WHEEL_GAP_MS = 400;

const report = (what: string) => (err: unknown) => console.error(`media ${what} failed`, err);

/** "Đang phát" card (SPEC-media §5.2–§5.4). Renders nothing without a session; the widget is hidden then anyway. */
export function MediaCard() {
  const media = useMedia();
  const track = media.state.current;
  const ticking = track?.status === "playing" && track.durationMs !== null;
  const now = useNow(ticking);
  const lastWheel = useRef(0);
  if (!track) return null;

  const { sessions } = media.state;
  const art = artFor(media);
  const app = sessions.find((s) => s.id === track.sessionId)?.appName;
  const position = positionNow(track, now);
  const playing = track.status === "playing";

  const switchApp = (step: 1 | -1) => {
    const id = neighbourSession(sessions, track.sessionId, step);
    if (id) mediaSelect(id).catch(report("select"));
  };
  const onWheel = (e: WheelEvent) => {
    if (sessions.length < 2 || e.deltaY === 0 || e.timeStamp - lastWheel.current < WHEEL_GAP_MS) return;
    lastWheel.current = e.timeStamp;
    switchApp(e.deltaY > 0 ? 1 : -1);
  };
  const seek = (ms: number) => {
    seekLocally(ms);
    mediaSeek(ms).catch(report("seek"));
  };

  const aside =
    sessions.length < 2 ? (
      app
    ) : (
      <span className={styles.switcher}>
        <button type="button" className={styles.switchButton} aria-label="App trước" onClick={() => switchApp(-1)}>
          <Icon name="previous" size={14} />
        </button>
        <span>{app}</span>
        <button type="button" className={styles.switchButton} aria-label="App kế" onClick={() => switchApp(1)}>
          <Icon name="next" size={14} />
        </button>
      </span>
    );

  return (
    <Card className={styles.card}>
      <div className={styles.wheelArea} onWheel={onWheel} data-testid="media-card">
        {art && <img className={styles.backdrop} src={art} alt="" />}
        <CardLabel aside={aside}>Đang phát</CardLabel>
        <div className={styles.body} key={track.trackKey} data-testid="media-body">
          <Artwork url={art} size={132} radius={16} fill />
          <div className={styles.info}>
            <span className={styles.title}>{track.title || "Không rõ tên bài"}</span>
            {track.artist && <span className={styles.artist}>{track.artist}</span>}
            {track.album && <span className={styles.album}>{track.album}</span>}
            <span className={styles.grow} />
            {position !== null && track.durationMs !== null && (
              <SeekBar positionMs={position} durationMs={track.durationMs} canSeek={track.can.seek} onSeek={seek} />
            )}
            <div className={styles.controls}>
              <button
                type="button"
                className={styles.iconButton}
                disabled={!track.can.previous}
                aria-label="Bài trước"
                onClick={() => mediaControl("previous").catch(report("previous"))}
              >
                <Icon name="skipPrev" size={18} />
              </button>
              <button
                type="button"
                className={styles.playButton}
                disabled={!track.can.playPause}
                aria-label={playing ? "Tạm dừng" : "Phát"}
                onClick={() => mediaControl("playPause").catch(report("play/pause"))}
              >
                <Icon name={playing ? "pause" : "play"} size={17} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                disabled={!track.can.next}
                aria-label="Bài kế"
                onClick={() => mediaControl("next").catch(report("next"))}
              >
                <Icon name="skipNext" size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
