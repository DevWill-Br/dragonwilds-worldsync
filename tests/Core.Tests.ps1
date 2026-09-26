# Dependency-free integration tests. Only synthetic saves in an isolated temporary directory.
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot '../src/WorldSync.Core.psm1') -Force
$scratch=Join-Path $PSScriptRoot ('.scratch/'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$script:checks=0
function Assert($condition,[string]$message) {
    if (-not $condition) { throw "FAIL: $message" }; $script:checks++
}
function Reject([scriptblock]$action,[string]$message) {
    $failed=$false
    try { & $action | Out-Null } catch { $failed=$true }
    Assert $failed $message
}
$install=Join-Path $scratch 'server'
$saves=Join-Path $install 'RSDragonwilds/Saved/Savegames'
[IO.Directory]::CreateDirectory($saves) | Out-Null
$source=Join-Path $saves 'Test.sav'
[IO.File]::WriteAllText($source,'synthetic world one')
$original=Get-WorldFingerprint $source
$config=Get-DedicatedServerConfig $install
Assert ($config.DedicatedServerSaveFolder -eq [IO.Path]::GetFullPath($saves)) 'Dedicated path resolution'
Reject { Get-DedicatedServerConfig $scratch } 'Missing dedicated installation rejected'
$store=Join-Path $scratch 'store'
Initialize-WorldStore $store
Reject { Initialize-WorldStore $store } 'No implicit migration'
$one=Start-WorldSession $store 'test'
Assert ($one.worldRevision -eq 0) 'Initial base revision'
Reject { Start-WorldSession $store 'competitor' } 'Second session blocked'
Reject { Update-WorldHeartbeat $store ([guid]::NewGuid().ToString()) } 'Foreign heartbeat blocked'
$sessionPath=Join-Path $store 'session.json'
$expired=Get-Content $sessionPath -Raw | ConvertFrom-Json
$expired.lastHeartbeatUtc=[datetime]::UtcNow.AddMinutes(-5).ToString('o')
$expired | ConvertTo-Json | Set-Content $sessionPath
Assert ((Get-WorldSessionStatus $store).stale) 'Stale heartbeat detected'
Reject { Start-WorldSession $store 'takeover' } 'Stale session never stolen'
Update-WorldHeartbeat $store $one.sessionId
Assert (-not (Get-WorldSessionStatus $store).stale) 'Heartbeat refreshed'
Reject { Publish-WorldRevision $store 'wrong-owner' $source } 'Foreign publication blocked'
$guard=[IO.File]::Open((Join-Path $store 'store.guard'),'Open','ReadWrite','None')
try { Reject { Update-WorldHeartbeat $store $one.sessionId } 'Concurrent store operation blocked' } finally { $guard.Dispose() }
$writer=[IO.File]::Open($source,'Open','Write','ReadWrite')
try { Reject { Publish-WorldRevision $store $one.sessionId $source } 'Save with active writer rejected' } finally { $writer.Dispose() }
Assert (Test-Path $sessionPath) 'Failure preserves session'
Assert (-not (Test-Path (Join-Path $store 'latest.json'))) 'Failure preserves uninitialized latest'
$r1=Publish-WorldRevision $store $one.sessionId $source
Assert ($r1.worldRevision -eq 1 -and $r1.sha256 -eq $original.sha256) 'Revision one verified'
Assert (-not (Test-Path $sessionPath)) 'Session archived after success'
Assert ((Get-WorldFingerprint $source).sha256 -eq $original.sha256) 'Original untouched'
$two=Start-WorldSession $store 'test'
Assert ($two.sourceHash -eq $r1.sha256) 'Session anchored to latest hash'
$changed=Get-Content $sessionPath -Raw | ConvertFrom-Json
$changed.worldRevision=0
$changed | ConvertTo-Json | Set-Content $sessionPath
Reject { Publish-WorldRevision $store $two.sessionId $source } 'Stale revision rejected'
$two | ConvertTo-Json | Set-Content $sessionPath
[IO.File]::WriteAllText($source,'synthetic world two')
$r2=Publish-WorldRevision $store $two.sessionId $source
Assert ($r2.worldRevision -eq 2) 'Monotonic revisions'
Assert ((Get-WorldFingerprint (Join-Path "$store/revisions" $r1.fileName)).sha256 -eq $original.sha256) 'Prior save retained'
Assert (@(Get-ChildItem $store -Filter 'latest.json.*.backup').Count -eq 1) 'Prior manifest backed up'
[IO.File]::WriteAllText((Join-Path "$store/revisions" $r2.fileName),'corrupted')
Reject { Start-WorldSession $store 'test' } 'Corrupt revision blocks hosting'
$failureStore=Join-Path $scratch 'failure-store'
Initialize-WorldStore $failureStore
$failureSession=Start-WorldSession $failureStore 'test'
# Inject failure at the pointer commit, after the immutable save has been staged.
[IO.Directory]::CreateDirectory((Join-Path $failureStore 'latest.json')) | Out-Null
Reject { Publish-WorldRevision $failureStore $failureSession.sessionId $source } 'Pointer commit failure surfaced'
Assert (Test-Path (Join-Path $failureStore 'session.json')) 'Commit failure retains session'
Assert (@(Get-ChildItem (Join-Path $failureStore 'revisions') -Filter '*.sav').Count -eq 1) 'Interrupted publication retains recoverable snapshot'
$empty=Join-Path $saves 'Empty.sav'
[IO.File]::WriteAllText($empty,'')
Reject { Publish-WorldRevision $failureStore $failureSession.sessionId $empty } 'Empty save rejected'
$concurrentStore=Join-Path $scratch 'concurrent-store'
Initialize-WorldStore $concurrentStore
$modulePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src/WorldSync.Core.psm1'))
$jobs=@(1..2 | ForEach-Object {
    Start-Job -ArgumentList $modulePath,$concurrentStore -ScriptBlock {
        param($module,$store)
        Import-Module $module
        try { Start-WorldSession $store 'racer' | Out-Null; 'acquired' } catch { 'blocked' }
    }
})
$outcomes=@($jobs | Wait-Job | Receive-Job)
$jobs | Remove-Job
Assert (@($outcomes | Where-Object { $_ -eq 'acquired' }).Count -eq 1) 'Exactly one process acquires session'
Assert (@($outcomes | Where-Object { $_ -eq 'blocked' }).Count -eq 1) 'Competing process rejected'
Write-Host "PASS: $script:checks checks. Synthetic fixtures retained at $scratch"
