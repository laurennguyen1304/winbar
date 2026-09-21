param([string]$Title = 'winbar test track', [string]$Artist = 'winbar test artist', [string]$Album = 'winbar test album', [int]$Seconds = 120, [switch]$Artwork)
# Test media session for SPEC-media: plays a silent WAV, muted, through Windows.Media.Playback.MediaPlayer so a
# Windows media session exists without touching the user's own music. Stop it by killing this process.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Playback.MediaPlayer, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Media.Core.MediaSource, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Media.Playback.MediaPlaybackItem, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaPlaybackType, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.RandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

# Silent 16-bit mono 8 kHz WAV of $Seconds seconds.
$wav = Join-Path $env:TEMP "winbar-silence-$Seconds.wav"
if (-not (Test-Path $wav)) {
  $rate = 8000; $samples = $rate * $Seconds; $data = $samples * 2
  $fs = [IO.File]::Create($wav); $w = New-Object IO.BinaryWriter($fs)
  $w.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $w.Write([int](36 + $data)); $w.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
  $w.Write([int]16); $w.Write([int16]1); $w.Write([int16]1); $w.Write([int]$rate); $w.Write([int]($rate * 2)); $w.Write([int16]2); $w.Write([int16]16)
  $w.Write([Text.Encoding]::ASCII.GetBytes('data')); $w.Write([int]$data); $w.Write((New-Object byte[] $data)); $w.Close()
}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($wav)) ([Windows.Storage.StorageFile])
$item = [Windows.Media.Playback.MediaPlaybackItem]::new([Windows.Media.Core.MediaSource]::CreateFromStorageFile($file))
$props = $item.GetDisplayProperties()
$props.Type = [Windows.Media.MediaPlaybackType]::Music
$props.MusicProperties.Title = $Title
$props.MusicProperties.Artist = $Artist
$props.MusicProperties.AlbumTitle = $Album
if ($Artwork) {
  # 600x600 test artwork (gradient with a light circle) so scaling to 280 px is exercised.
  $png = Join-Path $env:TEMP 'winbar-test-artwork.png'
  if (-not (Test-Path $png)) {
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 600, 600
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $rect = New-Object System.Drawing.Rectangle 0, 0, 600, 600
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 236, 92, 70)), ([System.Drawing.Color]::FromArgb(255, 60, 40, 140)), 45
    $g.FillRectangle($brush, $rect)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 255, 220, 150))), 330, 90, 170, 170)
    $g.Dispose(); $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  }
  $artFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($png)) ([Windows.Storage.StorageFile])
  $props.Thumbnail = [Windows.Storage.Streams.RandomAccessStreamReference]::CreateFromFile($artFile)
}
$item.ApplyDisplayProperties($props)

$player = [Windows.Media.Playback.MediaPlayer]::new()
$player.IsMuted = $true
$player.Volume = 0
$player.Source = $item
$player.Play()
"playing '$Title' pid=$PID"
while ($true) { Start-Sleep -Seconds 1 }
