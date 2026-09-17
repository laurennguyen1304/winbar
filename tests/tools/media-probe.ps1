# Lists Windows media sessions (read only): app id, title, artist, status, position/duration.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$current = $mgr.GetCurrentSession()
foreach ($s in $mgr.GetSessions()) {
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
  "{0}{1} | '{2}' - '{3}' | {4} | {5:N0}s/{6:N0}s | thumb={7}" -f ($(if ($current -and $current.SourceAppUserModelId -eq $s.SourceAppUserModelId) { '* ' } else { '  ' })), $s.SourceAppUserModelId, $p.Title, $p.Artist, $info.PlaybackStatus, $tl.Position.TotalSeconds, $tl.EndTime.TotalSeconds, ($null -ne $p.Thumbnail)
}
"sessions: " + @($mgr.GetSessions()).Count
