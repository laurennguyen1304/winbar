//! Windows side of the system module (SPEC-system §3): processor times and memory, read on a blocking thread.

use super::model::Times;

#[cfg(windows)]
pub fn times() -> Result<Times, String> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::GetSystemTimes;

    let (mut idle, mut kernel, mut user) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    // SAFETY: three owned FILETIMEs that outlive the call.
    unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }
        .map_err(|e| e.to_string())?;
    let ticks = |t: FILETIME| ((t.dwHighDateTime as u64) << 32) | t.dwLowDateTime as u64;
    Ok(Times {
        idle: ticks(idle),
        kernel: ticks(kernel),
        user: ticks(user),
    })
}

/// Total and available physical memory in bytes.
#[cfg(windows)]
pub fn memory() -> Result<(u64, u64), String> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // SAFETY: `status` is initialised with its own size, as the API requires.
    unsafe { GlobalMemoryStatusEx(&mut status) }.map_err(|e| e.to_string())?;
    Ok((status.ullTotalPhys, status.ullAvailPhys))
}

#[cfg(not(windows))]
pub fn times() -> Result<Times, String> {
    Err("system stats need Windows".into())
}

#[cfg(not(windows))]
pub fn memory() -> Result<(u64, u64), String> {
    Err("system stats need Windows".into())
}
