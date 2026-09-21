//! System module (SPEC-system): CPU and memory for the "Hệ thống" card, and opening Task Manager.

pub mod model;
mod stats;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Runtime};

use model::{SystemStats, Times};

/// A sample this old is no use for a CPU reading, so a fresh pair is taken instead.
const STALE_AFTER: Duration = Duration::from_secs(10);
/// How long the fresh pair is apart when there is no usable previous sample.
const QUICK_SAMPLE: Duration = Duration::from_millis(150);

#[derive(Default)]
pub struct SystemState {
    /// When the last processor times were read, and what they were.
    last: Mutex<Option<(Instant, Times)>>,
}

/// CPU and memory right now (SPEC-system §5.2). The widget calls this every 2 s while its card is on screen.
#[tauri::command]
pub async fn system_stats<R: Runtime>(app: AppHandle<R>) -> Result<SystemStats, String> {
    tauri::async_runtime::spawn_blocking(move || read(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn read<R: Runtime>(app: &AppHandle<R>) -> Result<SystemStats, String> {
    let state = app.state::<SystemState>();
    let mut last = state.last.lock().map_err(|e| e.to_string())?;
    let usable = last.filter(|(at, _)| at.elapsed() < STALE_AFTER);

    let (prev, now) = match usable {
        Some((_, prev)) => (prev, stats::times()?),
        None => {
            // First call after the card opens: measure a short slice so there is a number right away.
            let prev = stats::times()?;
            std::thread::sleep(QUICK_SAMPLE);
            (prev, stats::times()?)
        }
    };
    *last = Some((Instant::now(), now));
    drop(last);

    let (total, available) = stats::memory()?;
    Ok(SystemStats {
        cpu_percent: model::cpu_percent(prev, now).unwrap_or(0.0),
        ram_used_bytes: model::ram_used(total, available),
        ram_total_bytes: total,
    })
}

/// Opens Task Manager; Windows brings an existing window forward instead of opening a second one.
#[tauri::command]
pub async fn open_task_manager() -> Result<(), String> {
    crate::command_bar::launch::open_shell_target("taskmgr.exe")
}
