# Runs the real winbar.exe hook branch against a stand-in server on the real pipe name.
# Usage: claude-relay-check.ps1 -Exe <path to a built winbar.exe>
# Needs winbar itself not to be serving the pipe: quit it first, or the stand-in server cannot take the name.
# Touches no window and sends no input: one named pipe, one child process, stdin and stdout.
param([Parameter(Mandatory = $true)][string]$Exe)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Exe)) { throw "no exe at $Exe" }

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$pipeName = "winbar-claude-$sid"

function Start-Relay([string]$json) {
    $psi = [System.Diagnostics.ProcessStartInfo]::new($Exe, '--winbar-claude-hook')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $p = [System.Diagnostics.Process]::Start($psi)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $p.StandardInput.Close()
    [pscustomobject]@{ Process = $p; Out = $p.StandardOutput.ReadToEndAsync(); Err = $p.StandardError.ReadToEndAsync(); Watch = $watch }
}

function Complete-Relay($r) {
    if (-not $r.Process.WaitForExit(15000)) { $r.Process.Kill(); throw 'relay did not exit within 15 s' }
    $r.Watch.Stop()
    [pscustomobject]@{ Code = $r.Process.ExitCode; Out = $r.Out.Result.Trim(); Err = $r.Err.Result.Trim(); Ms = $r.Watch.ElapsedMilliseconds }
}

function Start-Server {
    $server = [System.IO.Pipes.NamedPipeServerStream]::new(
        $pipeName, [System.IO.Pipes.PipeDirection]::InOut, 1,
        [System.IO.Pipes.PipeTransmissionMode]::Byte, [System.IO.Pipes.PipeOptions]::Asynchronous)
    [pscustomobject]@{ Server = $server; Task = $server.WaitForConnectionAsync() }
}

# Reads the relay's line, answers with $answer (or nothing), and returns the line.
function Complete-Server($s, [string]$answer) {
    if (-not $s.Task.Wait(5000)) { $s.Server.Dispose(); return '<no connection>' }
    $reader = [System.IO.StreamReader]::new($s.Server, [System.Text.Encoding]::UTF8, $false, 65536, $true)
    $lineTask = $reader.ReadLineAsync()
    $line = if ($lineTask.Wait(5000)) { $lineTask.Result } else { '<no line>' }
    if ($answer) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($answer + "`n")
        $s.Server.Write($bytes, 0, $bytes.Length)
        $s.Server.Flush()
        try { $s.Server.WaitForPipeDrain() } catch {}
    }
    $s.Server.Dispose()
    $line
}

$ask = '{"session_id":"s-check","cwd":"C:\\work\\shop","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_use_id":"toolu_check","tool_input":{"command":"git push origin main"},"transcript_path":"C:\\secret\\t.jsonl"}'
$prompt = '{"session_id":"s-check","hook_event_name":"UserPromptSubmit","prompt":"hunter2 is my password"}'
$results = @()

# 1. Nobody serving the pipe: exit 0, nothing printed, fast.
$r = Complete-Relay (Start-Relay $ask)
$results += [pscustomobject]@{ Case = 'no server'; Pass = ($r.Code -eq 0 -and $r.Out -eq '' -and $r.Err -eq ''); Detail = "exit=$($r.Code) out='$($r.Out)' err='$($r.Err)' $($r.Ms)ms" }

# 2. Garbage on stdin: exit 0, nothing printed.
$r = Complete-Relay (Start-Relay 'not json at all')
$results += [pscustomobject]@{ Case = 'garbage stdin'; Pass = ($r.Code -eq 0 -and $r.Out -eq '' -and $r.Err -eq ''); Detail = "exit=$($r.Code) out='$($r.Out)' $($r.Ms)ms" }

# 3-6. A server that answers allow / deny / nothing / a word that is not an answer.
foreach ($case in @(
        @{ Name = 'allow'; Answer = 'allow'; Expect = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}' },
        @{ Name = 'deny'; Answer = 'deny'; Expect = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied by the user from winbar."}}}' },
        @{ Name = 'nothing'; Answer = ''; Expect = '' },
        @{ Name = 'always'; Answer = 'always'; Expect = '' })) {
    $s = Start-Server
    $relay = Start-Relay $ask
    $line = Complete-Server $s $case.Answer
    $r = Complete-Relay $relay
    $leaked = $line -match 'transcript|secret'
    $ok = $r.Code -eq 0 -and $r.Out -eq $case.Expect -and $r.Err -eq '' -and -not $leaked -and $line -match '"tool":"Bash"'
    $results += [pscustomobject]@{ Case = "server says $($case.Name)"; Pass = $ok; Detail = "exit=$($r.Code) out='$($r.Out)' $($r.Ms)ms" }
    $lastLine = $line
}

# 7. A prompt: the server must not see its text.
$s = Start-Server
$relay = Start-Relay $prompt
$line = Complete-Server $s ''
$r = Complete-Relay $relay
$results += [pscustomobject]@{ Case = 'prompt text stays in the relay'; Pass = ($r.Code -eq 0 -and $r.Out -eq '' -and $line -notmatch 'hunter2' -and $line -match 'UserPromptSubmit'); Detail = "exit=$($r.Code) line=$line $($r.Ms)ms" }

$results | Format-Table -AutoSize -Wrap | Out-String -Width 200
"line the server saw for a permission request: $lastLine"
if ($results | Where-Object { -not $_.Pass }) { exit 1 }
