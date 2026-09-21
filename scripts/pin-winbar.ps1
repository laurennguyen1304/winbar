# Makes a Start Menu shortcut for winbar, so it can be pinned to the taskbar.
#
# winbar's own windows are `skip_taskbar(true)` — a notch and a command bar have no business owning a taskbar
# button — so there is nothing to right-click there. A shortcut is the thing you pin instead. Clicking it when
# winbar is already running does not start a second copy: the single-instance plugin brings the notch back if it
# was hidden and opens Settings, which is where the "Khởi động cùng Windows" switch lives.
#
# Re-run this after moving the worktree or rebuilding somewhere else: the shortcut points at one exact exe.
# ASCII only: PowerShell 5.1 reads a UTF-8 script without a BOM as ANSI.
[CmdletBinding()]
param(
  # Which build to point at. Empty means the release build beside this script.
  [string]$Exe = "",
  # Also drop one on the Desktop.
  [switch]$Desktop,
  # Take it back out of the Start Menu (and the Desktop) again.
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
# $PSScriptRoot is not set while the param defaults are evaluated, so the fallback lives here.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Exe) { $Exe = Join-Path $root '..\src-tauri\target\release\winbar.exe' }
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\winbar.lnk'
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'winbar.lnk'

if ($Remove) {
  foreach ($p in @($startMenu, $desktopLnk)) {
    if (Test-Path $p) { Remove-Item $p -Force; "removed $p" } else { "not there: $p" }
  }
  'Unpin it from the taskbar by hand: right-click the button, "Unpin from taskbar".'
  return
}

$Exe = (Resolve-Path $Exe -ErrorAction SilentlyContinue).Path
if (-not $Exe) {
  throw "No winbar.exe there. Build it first: npm run tauri build -- --no-bundle"
}

$shell = New-Object -ComObject WScript.Shell
foreach ($path in @($startMenu) + $(if ($Desktop) { @($desktopLnk) } else { @() })) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $Exe
  $lnk.WorkingDirectory = Split-Path -Parent $Exe
  $lnk.Description = 'winbar - notch cho Windows 11'
  # The icon is the one compiled into the exe, so it never goes stale against the build.
  $lnk.IconLocation = "$Exe,0"
  $lnk.Save()
  "created $path"
}

''
'Now pin it: open Start, find "winbar", right-click -> Ghim vao thanh tac vu (Pin to taskbar).'
'Windows 11 does not let a program pin itself, so that last click is yours.'
