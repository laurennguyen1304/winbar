//! WinRT side of the media module (SPEC-media §5.1): one thread owns the session manager, subscribes to its events and
//! rebuilds [`MediaState`] when something changes. Event handlers only send a wake-up; all reads happen on this thread.

use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Runtime};
use windows::core::HSTRING;
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackControls as PlaybackControls,
    GlobalSystemMediaTransportControlsSessionTimelineProperties as TimelineProperties,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::model::{self, Controls, MediaSession, MediaState, Track};
use super::{publish, MediaStore, Wake};
use crate::command_bar::apps::AppsState;

/// Changes that arrive together (a track change fires several events) become one rebuild.
const DEBOUNCE: Duration = Duration::from_millis(50);
const RETRY: Duration = Duration::from_secs(10);

pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    let started = std::thread::Builder::new()
        .name("winbar-media".into())
        .spawn(move || run(app));
    if let Err(e) = started {
        eprintln!("winbar media: thread failed to start: {e}");
    }
}

/// A session with the event registrations to undo when it goes away.
struct Watched {
    session: Session,
    tokens: [i64; 3],
}

impl Drop for Watched {
    fn drop(&mut self) {
        let [media, playback, timeline] = self.tokens;
        let _ = self.session.RemoveMediaPropertiesChanged(media);
        let _ = self.session.RemovePlaybackInfoChanged(playback);
        let _ = self.session.RemoveTimelinePropertiesChanged(timeline);
    }
}

fn run<R: Runtime>(app: AppHandle<R>) {
    // SAFETY: initialises COM for this thread only; WinRT objects created here live on this thread.
    let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

    let manager = loop {
        match SessionManager::RequestAsync().and_then(|op| op.get()) {
            Ok(m) => break m,
            Err(e) => {
                eprintln!("winbar media: session manager unavailable ({e}), retrying");
                std::thread::sleep(RETRY);
            }
        }
    };

    let (tx, rx) = channel::<Wake>();
    app.state::<MediaStore>().set_wake(tx.clone());
    let sessions_tx = tx.clone();
    let current_tx = tx.clone();
    let registered = manager
        .SessionsChanged(&TypedEventHandler::new(move |_, _| {
            let _ = sessions_tx.send(Wake::SessionsChanged);
            Ok(())
        }))
        .and_then(|_| {
            manager.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
                let _ = current_tx.send(Wake::SystemPickChanged);
                Ok(())
            }))
        });
    if let Err(e) = registered {
        eprintln!("winbar media: could not subscribe to session changes: {e}");
    }

    let mut watched = watch_all(&manager, &tx);
    publish(&app, snapshot(&app, &manager, &watched));

    loop {
        let Some(wakes) = next_batch(&rx) else {
            return;
        };
        let store = app.state::<MediaStore>();
        if wakes.contains(&Wake::SystemPickChanged) {
            store.set_manual(None);
        }
        if wakes.contains(&Wake::SessionsChanged) {
            watched = watch_all(&manager, &tx);
        }
        publish(&app, snapshot(&app, &manager, &watched));
    }
}

/// Blocks for the next wake-up, then collects whatever else arrives within the debounce window.
fn next_batch(rx: &Receiver<Wake>) -> Option<Vec<Wake>> {
    let mut batch = vec![rx.recv().ok()?];
    loop {
        match rx.recv_timeout(DEBOUNCE) {
            Ok(w) => batch.push(w),
            Err(RecvTimeoutError::Timeout) => return Some(batch),
            Err(RecvTimeoutError::Disconnected) => return None,
        }
    }
}

/// Event handler for any session event: it only wakes the media thread.
fn wake_on_change<A: windows::core::RuntimeType + 'static>(
    tx: Sender<Wake>,
) -> TypedEventHandler<Session, A> {
    TypedEventHandler::new(move |_, _| {
        let _ = tx.send(Wake::Changed);
        Ok(())
    })
}

/// Subscribes to every current session. Old registrations are removed when the previous list is dropped.
fn watch_all(manager: &SessionManager, tx: &Sender<Wake>) -> Vec<Watched> {
    let Ok(sessions) = manager.GetSessions() else {
        return Vec::new();
    };
    sessions
        .into_iter()
        .filter_map(|session| {
            let media = session
                .MediaPropertiesChanged(&wake_on_change(tx.clone()))
                .ok()?;
            let playback = session
                .PlaybackInfoChanged(&wake_on_change(tx.clone()))
                .ok()?;
            let timeline = session
                .TimelinePropertiesChanged(&wake_on_change(tx.clone()))
                .ok()?;
            Some(Watched {
                session,
                tokens: [media, playback, timeline],
            })
        })
        .collect()
}

fn snapshot<R: Runtime>(
    app: &AppHandle<R>,
    manager: &SessionManager,
    watched: &[Watched],
) -> MediaState {
    let aumids: Vec<String> = watched
        .iter()
        .map(|w| {
            w.session
                .SourceAppUserModelId()
                .map(|s| s.to_string())
                .unwrap_or_default()
        })
        .collect();
    let ids = model::unique_ids(&aumids);
    let apps = app.state::<AppsState>().current();
    let sessions = ids
        .iter()
        .zip(&aumids)
        .map(|(id, aumid)| MediaSession {
            id: id.clone(),
            app_name: model::app_name(aumid, &apps),
        })
        .collect();

    let system = manager
        .GetCurrentSession()
        .and_then(|s| s.SourceAppUserModelId())
        .ok()
        .map(|s| s.to_string());
    let manual = app.state::<MediaStore>().manual();
    let current = model::pick_session(&ids, system.as_deref(), manual.as_deref())
        .and_then(|id| ids.iter().position(|i| i == id))
        .and_then(|i| read_track(&watched[i].session, &ids[i]));

    MediaState { sessions, current }
}

fn text(value: windows::core::Result<HSTRING>) -> String {
    value.map(|s| s.to_string()).unwrap_or_default()
}

/// Reads one session. `None` only when the session is gone; missing fields become empty or unknown.
fn read_track(session: &Session, id: &str) -> Option<Track> {
    let info = session.GetPlaybackInfo().ok()?;
    // Apps that are still starting can fail here; show what the other calls return.
    let props = session
        .TryGetMediaPropertiesAsync()
        .and_then(|op| op.get())
        .ok();
    let (title, artist, album) = match &props {
        Some(p) => (text(p.Title()), text(p.Artist()), text(p.AlbumTitle())),
        None => Default::default(),
    };

    let status = model::status_name(info.PlaybackStatus().map(|s| s.0).unwrap_or(0));
    let rate = info
        .PlaybackRate()
        .and_then(|r| r.Value())
        .ok()
        .filter(|r| *r > 0.0)
        .unwrap_or(1.0);
    let controls = info.Controls().ok();
    let flag = |f: &dyn Fn(&PlaybackControls) -> windows::core::Result<bool>| {
        controls.as_ref().and_then(|c| f(c).ok()).unwrap_or(false)
    };

    let timeline = session.GetTimelineProperties().ok();
    let ticks =
        |f: fn(&TimelineProperties) -> windows::core::Result<windows::Foundation::TimeSpan>| {
            timeline
                .as_ref()
                .and_then(|t| f(t).ok())
                .map(|t| t.Duration)
                .unwrap_or(0)
        };
    let (start, end, position) = (
        ticks(|t| t.StartTime()),
        ticks(|t| t.EndTime()),
        ticks(|t| t.Position()),
    );
    let duration_ms = model::duration_ms(start, end);
    let reported_at = timeline
        .as_ref()
        .and_then(|t| t.LastUpdatedTime().ok())
        .map(|t| model::filetime_to_epoch_ms(t.UniversalTime))
        .filter(|ms| *ms > 0)
        .unwrap_or_else(now_ms);

    Some(Track {
        session_id: id.to_string(),
        track_key: model::track_key(id, &title, &artist, &album),
        title,
        artist,
        album,
        status,
        position_ms: model::position_ms(start, position, duration_ms),
        duration_ms,
        position_at: reported_at,
        rate,
        can: Controls {
            play_pause: flag(&|c| c.IsPlayPauseToggleEnabled()),
            next: flag(&|c| c.IsNextEnabled()),
            previous: flag(&|c| c.IsPreviousEnabled()),
            seek: duration_ms.is_some() && flag(&|c| c.IsPlaybackPositionEnabled()),
        },
    })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
