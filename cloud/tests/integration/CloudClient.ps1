$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot '../../../src/WorldSync2.ps1'
$argsForClient = @{
    ApiBaseUrl = $env:WORLDSYNC_TEST_URL
    ApiToken = $env:WORLDSYNC_TEST_TOKEN
    WorldId = 'worldsynctest'
    ConfigPath = (Join-Path $PSScriptRoot 'nonexistent-test-config.json')
    CloudHostName = 'synthetic-host'
    MachineId = 'synthetic-machine'
}
$session = & $entry -Action CloudAcquire @argsForClient
if (-not $session.acquired -or -not $session.sessionId) { throw 'CloudAcquire did not create a session.' }
$rejected = $false
try { & $entry -Action CloudAcquire @argsForClient | Out-Null }
catch { if ($_.Exception.Message -match 'WORLD_BUSY') { $rejected = $true } else { throw } }
if (-not $rejected) { throw 'Second CloudAcquire was not rejected.' }
$status = & $entry -Action CloudStatus @argsForClient
Start-Sleep -Milliseconds 100
# Use the one-shot function underlying CloudHeartbeat, whose CLI intentionally loops.
$beat = Update-CloudWorldHeartbeat -ApiBaseUrl $argsForClient.ApiBaseUrl -WorldId $argsForClient.WorldId -ApiToken $argsForClient.ApiToken -SessionId $session.sessionId
if (-not $beat.heartbeat -or [datetime]$beat.lastHeartbeatUtc -le [datetime]$status.session.lastHeartbeatUtc) { throw 'Heartbeat did not advance.' }
@{sessionId=$session.sessionId; secondAcquireRejected=$rejected; heartbeat=$beat.heartbeat} | ConvertTo-Json -Compress
