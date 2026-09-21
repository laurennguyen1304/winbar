//! Where the command bar opens (SPEC-command-bar §5.3). Pure functions over physical-pixel monitor geometry.

/// A monitor's work area (screen minus taskbar) in physical px, and its scale factor.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

impl WorkArea {
    fn contains(&self, px: i32, py: i32) -> bool {
        px >= self.x
            && py >= self.y
            && i64::from(px) < i64::from(self.x) + i64::from(self.width)
            && i64::from(py) < i64::from(self.y) + i64::from(self.height)
    }

    fn bottom(&self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }
}

/// Horizontally centred, top edge at 25% of the work area's height.
pub fn default_position(area: WorkArea, width_logical: f64) -> (i32, i32) {
    let width = (width_logical * area.scale).round() as i32;
    let x = area.x + (area.width as i32 - width) / 2;
    let y = area.y + (f64::from(area.height) * 0.25).round() as i32;
    (x, y)
}

/// The work area that holds the middle of the bar's top edge, if any. Each monitor is tried with its own scale.
pub fn area_for_saved(
    saved: (i32, i32),
    width_logical: f64,
    areas: &[WorkArea],
) -> Option<WorkArea> {
    areas.iter().copied().find(|a| {
        let half = (width_logical * a.scale / 2.0).round() as i32;
        a.contains(saved.0.saturating_add(half), saved.1)
    })
}

/// Saved position when it is still on a screen, otherwise the default on the monitor under the cursor. The saved
/// value itself is never cleared here, so plugging the monitor back in brings the old spot back.
pub fn open_position(
    saved: Option<(i32, i32)>,
    width_logical: f64,
    areas: &[WorkArea],
    cursor_area: WorkArea,
) -> (i32, i32) {
    match saved {
        Some(pos) if area_for_saved(pos, width_logical, areas).is_some() => pos,
        _ => default_position(cursor_area, width_logical),
    }
}

/// Logical px from the bar's top edge to the bottom of its work area, minus a small margin. The page caps its
/// results so the bar never runs off the bottom of the screen.
pub fn max_height(top: i32, area: WorkArea) -> f64 {
    const MARGIN: f64 = 16.0;
    ((area.bottom() - i64::from(top)) as f64 / area.scale - MARGIN).max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const W: f64 = 660.0;

    fn area(x: i32, y: i32, width: u32, height: u32, scale: f64) -> WorkArea {
        WorkArea {
            x,
            y,
            width,
            height,
            scale,
        }
    }

    #[test]
    fn default_is_centred_a_quarter_down_at_each_scale() {
        // 1920×1200 panel, taskbar 48 logical px at the bottom.
        assert_eq!(default_position(area(0, 0, 1920, 1152, 1.0), W), (630, 288));
        assert_eq!(
            default_position(area(0, 0, 1920, 1140, 1.25), W),
            (547, 285)
        );
        assert_eq!(default_position(area(0, 0, 1920, 1128, 1.5), W), (465, 282));
    }

    #[test]
    fn default_follows_a_monitor_left_of_or_above_the_primary() {
        assert_eq!(
            default_position(area(-2560, -200, 2560, 1400, 1.0), W),
            (-1610, 150)
        );
    }

    #[test]
    fn keeps_a_saved_position_that_is_still_on_a_screen() {
        let primary = area(0, 0, 1920, 1140, 1.25);
        let left = area(-2560, 0, 2560, 1400, 1.0);
        assert_eq!(
            open_position(Some((-2000, 400)), W, &[primary, left], primary),
            (-2000, 400)
        );
        // Top-left hangs off the left edge but the middle of the top edge is still on the screen.
        assert_eq!(
            open_position(Some((-200, 10)), W, &[primary], primary),
            (-200, 10)
        );
    }

    #[test]
    fn falls_back_to_the_cursor_monitor_when_the_saved_spot_is_gone() {
        let primary = area(0, 0, 1920, 1140, 1.25);
        let right = area(1920, 0, 2560, 1400, 1.0);
        // The monitor on the left was unplugged.
        assert_eq!(
            open_position(Some((-2000, 400)), W, &[primary, right], right),
            (2870, 350)
        );
        // Top edge below the work area (e.g. behind the taskbar).
        assert_eq!(
            open_position(Some((500, 1150)), W, &[primary], primary),
            (547, 285)
        );
        assert_eq!(
            open_position(None, W, &[primary, right], primary),
            (547, 285)
        );
    }

    #[test]
    fn saved_position_is_checked_with_the_scale_of_each_monitor() {
        let small = area(0, 0, 1000, 800, 2.0);
        // At scale 2 the bar is 1320 px wide: the middle of its top edge is at x = 900 + 660 = 1560, off the monitor.
        assert_eq!(area_for_saved((900, 10), W, &[small]), None);
        assert_eq!(area_for_saved((100, 10), W, &[small]), Some(small));
    }

    #[test]
    fn max_height_is_the_room_left_below_the_top_edge() {
        let a = area(0, 0, 1920, 1140, 1.25);
        assert_eq!(max_height(285, a), (1140.0 - 285.0) / 1.25 - 16.0);
        assert_eq!(max_height(1139, a), 0.0);
        let offset = area(0, -1200, 1920, 1152, 1.0);
        assert_eq!(max_height(-1000, offset), 952.0 - 16.0);
    }
}
