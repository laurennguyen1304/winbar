// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Claude Code runs this exe on every hook event. That branch must not start the app, open a window or touch
    // the single-instance lock: it relays one line and exits (SPEC-claude-approvals §3).
    if winbar_lib::is_claude_hook(std::env::args().nth(1).as_deref()) {
        std::process::exit(winbar_lib::claude_hook());
    }
    winbar_lib::run()
}
