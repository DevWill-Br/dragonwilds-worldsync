#requires -Version 5.1
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot
$root=Join-Path $repo ('tests/.scratch/lifecycle/process-guard-'+[guid]::NewGuid().ToString('N'))
foreach($dir in @('saves','staging','backups')){New-Item -ItemType Directory -Path (Join-Path $root $dir) -Force | Out-Null}
[IO.File]::WriteAllText((Join-Path $root 'saves/synthetic.sav'),'synthetic-process-test')
$global:worldSyncTestProcessName='RSDragonwilds-Win64-Shipping'
function Get-Process { param($ErrorAction) [pscustomobject]@{ProcessName=$global:worldSyncTestProcessName} }
$io=Join-Path $repo 'src/lifecycle/SaveIO.ps1'
$copy=& $io -Root $root -Action Snapshot | ConvertFrom-Json
$installed=& $io -Root $root -Action Install -Stage $copy.path -ExpectedSha256 $copy.sha256 -ExpectedBytes $copy.bytes | ConvertFrom-Json
if(-not $installed.installed){throw 'CLIENT_TEST_FAILED'}
foreach($name in @('RSDragonwildsServer','RSDragonwildsServer-Win64-Shipping','RSDragonwilds-Win64-Shipping')){
    $global:worldSyncTestProcessName=$name
    if($name -eq 'RSDragonwilds-Win64-Shipping'){[IO.File]::WriteAllText((Join-Path $root 'server.running'),'supervised writer')}
    foreach($action in @('Snapshot','Install')){
        $blocked=$false
        try { & $io -Root $root -Action $action -Stage $copy.path -ExpectedSha256 $copy.sha256 -ExpectedBytes $copy.bytes | Out-Null }
        catch { if($_.Exception.Message -match 'WS_SERVER_ACTIVE'){$blocked=$true}else{throw} }
        if(-not $blocked){throw "GUARD_FAILED: $name $action"}
    }
}
'PASS: client Snapshot/Install allowed; dedicated launcher/shipping and marker block both operations (8 checks).'

