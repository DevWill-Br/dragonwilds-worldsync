#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Inspect','Configure','Initialize','StartSession','Heartbeat','Status','Publish')][string]$Action='Inspect',
    [string]$InstallPath=(Join-Path ${env:ProgramFiles(x86)} 'Steam\steamapps\common\RuneScape Dragonwilds Dedicated Server'),
    [string]$ConfigPath=(Join-Path $env:LOCALAPPDATA 'DragonwildsWorldSync2\server.local.json'),
    [string]$StorePath,
    [string]$SessionId,
    [string]$HostName=$env:COMPUTERNAME,
    [string]$WorldFileName='WorldSyncTest.sav'
)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorldSync.Core.psm1') -Force
if ($Action -eq 'Configure') {
    $config=Get-DedicatedServerConfig $InstallPath
    if (Test-Path -LiteralPath $ConfigPath) { throw 'Configuration already exists; preserve it before changing the installation.' }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ConfigPath))) | Out-Null
    $stream=[IO.File]::Open($ConfigPath,'CreateNew','Write','None')
    try {
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($config | ConvertTo-Json))
        $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true)
    } finally { $stream.Dispose() }
    return $config
}
if (Test-Path -LiteralPath $ConfigPath) {
    $saved=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $InstallPath=$saved.DedicatedServerInstallPath
}
switch ($Action) {
    'Inspect' {
        $config=Get-DedicatedServerConfig $InstallPath
        Get-ChildItem -LiteralPath $config.DedicatedServerSaveFolder -Filter '*.sav' -File | ForEach-Object { Get-WorldFingerprint $_.FullName }
    }
    'Initialize' { Initialize-WorldStore -StorePath $StorePath }
    'StartSession' { Start-WorldSession -StorePath $StorePath -HostName $HostName }
    'Heartbeat' {
        # Foreground loop: Ctrl+C stops heartbeats but never releases ownership.
        while ($true) { Update-WorldHeartbeat -StorePath $StorePath -SessionId $SessionId; Start-Sleep -Seconds 15 }
    }
    'Status' { Get-WorldSessionStatus -StorePath $StorePath }
    'Publish' {
        if ([IO.Path]::GetFileName($WorldFileName) -cne $WorldFileName -or $WorldFileName -notmatch '\.sav$') { throw 'Use a save filename without directory components.' }
        $config=Get-DedicatedServerConfig $InstallPath
        Publish-WorldRevision -StorePath $StorePath -SessionId $SessionId -SourcePath (Join-Path $config.DedicatedServerSaveFolder $WorldFileName)
    }
}
