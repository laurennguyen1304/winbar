# Runs the hook command the way Claude Code does — through Git Bash — from a folder whose name would break a
# careless quoting: a space, a dollar sign, a backtick and a single quote.
# Usage: claude-hook-bash-check.ps1 -Exe <path to a built winbar.exe>
# Needs winbar itself not to be serving the pipe: quit it first, or the stand-in server cannot take the name.
# Touches no window and sends no input: one named pipe, one child process, stdin and stdout.
param([Parameter(Mandatory = $true)][string]$Exe)

$ErrorActionPreference = 'Stop'
$bash = 'C:\Program Files\Git\bin\bash.exe'
if (-not (Test-Path $bash)) { throw 'Git Bash not found' }

# A copy of the exe under the temp folder, in a directory named to be awkward. Removed at the end.
$root = Join-Path $env:TEMP "winbar-hook-check-$PID"
$odd = Join-Path $root 'odd $HOME `id` it''s dir'
New-Item -ItemType Directory -Force -Path $odd | Out-Null
$copy = Join-Path $odd 'winbar.exe'
Copy-Item $Exe $copy -Force

# Exactly what install.rs writes: forward slashes, single quotes, ' -> '\''
$command = "'" + ($copy -replace '\\', '/' -replace "'", "'\''") + "' --winbar-claude-hook"
"command written to settings.json: $command"

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$server = [System.IO.Pipes.NamedPipeServerStream]::new(
    "winbar-claude-$sid", [System.IO.Pipes.PipeDirection]::InOut, 1,
    [System.IO.Pipes.PipeTransmissionMode]::Byte, [System.IO.Pipes.PipeOptions]::Asynchronous)
$connected = $server.WaitForConnectionAsync()

$psi = [System.Diagnostics.ProcessStartInfo]::new($bash)
$psi.ArgumentList.Add('-c')
$psi.ArgumentList.Add($command)
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$p = [System.Diagnostics.Process]::Start($psi)
$json = '{"session_id":"s-bash","cwd":"C:\\work","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_use_id":"t","tool_input":{"command":"echo hi"}}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$p.StandardInput.Close()
$out = $p.StandardOutput.ReadToEndAsync()
$err = $p.StandardError.ReadToEndAsync()

$line = '<no connection>'
if ($connected.Wait(8000)) {
    $reader = [System.IO.StreamReader]::new($server, [System.Text.Encoding]::UTF8, $false, 65536, $true)
    $read = $reader.ReadLineAsync()
    if ($read.Wait(5000)) { $line = $read.Result }
    $answer = [System.Text.Encoding]::UTF8.GetBytes("allow`n")
    $server.Write($answer, 0, $answer.Length)
    $server.Flush()
    try { $server.WaitForPipeDrain() } catch {}
}
$server.Dispose()
if (-not $p.WaitForExit(15000)) { $p.Kill(); throw 'bash did not exit' }

"exit code : $($p.ExitCode)"
"stdout    : $($out.Result.Trim())"
"stderr    : $($err.Result.Trim())"
"server saw: $line"
Remove-Item -Recurse -Force $root
$expected = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
if ($p.ExitCode -eq 0 -and $out.Result.Trim() -eq $expected -and $line -match '"command":"echo hi"') { 'PASS' } else { 'FAIL'; exit 1 }
