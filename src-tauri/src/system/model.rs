//! Pure parts of the system module (SPEC-system §5, §9): CPU maths and the shape sent to the widget.

use serde::Serialize;

/// System-wide processor times in 100 ns ticks, as `GetSystemTimes` reports them (kernel time contains idle time).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Times {
    pub idle: u64,
    pub kernel: u64,
    pub user: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    /// 0–100, whole machine, between the two samples.
    pub cpu_percent: f64,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
}

/// CPU use between two samples, or `None` when the samples cannot be compared (no time passed, or counters went
/// backwards after a clock change).
pub fn cpu_percent(prev: Times, now: Times) -> Option<f64> {
    let total = (now.kernel + now.user).checked_sub(prev.kernel + prev.user)?;
    let idle = now.idle.checked_sub(prev.idle)?;
    if total == 0 {
        return None;
    }
    let busy = total.saturating_sub(idle) as f64;
    Some((100.0 * busy / total as f64).clamp(0.0, 100.0))
}

/// Memory in use: what Windows reports as total minus available.
pub fn ram_used(total_bytes: u64, available_bytes: u64) -> u64 {
    total_bytes.saturating_sub(available_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: u64 = 10_000_000; // one second in 100 ns ticks

    fn times(idle: u64, kernel: u64, user: u64) -> Times {
        Times { idle, kernel, user }
    }

    #[test]
    fn measures_use_between_two_samples() {
        // 12 core-seconds passed, 9 of them idle: 25% busy.
        let prev = times(0, 0, 0);
        assert_eq!(cpu_percent(prev, times(9 * S, 10 * S, 2 * S)), Some(25.0));
        // Fully busy and fully idle.
        assert_eq!(cpu_percent(prev, times(0, 6 * S, 6 * S)), Some(100.0));
        assert_eq!(cpu_percent(prev, times(12 * S, 12 * S, 0)), Some(0.0));
    }

    #[test]
    fn works_from_a_running_machine_not_just_zero() {
        let prev = times(500 * S, 800 * S, 200 * S);
        let now = times(503 * S, 804 * S, 200 * S);
        assert_eq!(cpu_percent(prev, now), Some(25.0));
    }

    #[test]
    fn has_no_answer_without_two_usable_samples() {
        let prev = times(9 * S, 10 * S, 2 * S);
        // No time passed.
        assert_eq!(cpu_percent(prev, prev), None);
        // Counters went backwards.
        assert_eq!(cpu_percent(prev, times(8 * S, 9 * S, S)), None);
        assert_eq!(cpu_percent(prev, times(0, 11 * S, 3 * S)), None);
    }

    #[test]
    fn idle_above_the_total_still_reads_as_zero() {
        // Windows can report slightly more idle than elapsed kernel+user time.
        let prev = times(0, 0, 0);
        assert_eq!(cpu_percent(prev, times(11 * S, 10 * S, 0)), Some(0.0));
    }

    #[test]
    fn used_memory_is_total_minus_available() {
        assert_eq!(ram_used(34_000_000_000, 21_600_000_000), 12_400_000_000);
        assert_eq!(ram_used(0, 8), 0);
    }

    #[test]
    fn stats_serialise_for_the_widget() {
        let v = serde_json::to_value(SystemStats {
            cpu_percent: 23.4,
            ram_used_bytes: 12,
            ram_total_bytes: 32,
        })
        .unwrap();
        assert_eq!(v["cpuPercent"], 23.4);
        assert_eq!(v["ramUsedBytes"], 12);
        assert_eq!(v["ramTotalBytes"], 32);
    }
}
