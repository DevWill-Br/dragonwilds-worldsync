Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DedicatedServerConfig {
    param([Parameter(Mandatory)][string]$InstallPath)
    $root = (Resolve-Path -LiteralPath $InstallPath).ProviderPath
    $folder = Join-Path $root 'RSDragonwilds\Saved\Savegames'
    if (-not [IO.Directory]::Exists($folder)) { throw 'Dedicated Server save directory not found.' }
    [pscustomobject]@{DedicatedServerInstallPath=$root; DedicatedServerSaveFolder=$folder; HeartbeatSeconds=15; StaleLockSeconds=120}
}

function Get-WorldFingerprint {
    param([Parameter(Mandatory)][string]$Path)
    # Deny writers while hashing; never open the original for writing.
    $stream = [IO.File]::Open($Path, 'Open', 'Read', 'Read')
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
        finally { $sha.Dispose() }
        [pscustomobject]@{fileName=[IO.Path]::GetFileName($Path); bytes=$stream.Length; lastWriteTimeUtc=[IO.File]::GetLastWriteTimeUtc($Path).ToString('o'); sha256=$hash}
    } finally { $stream.Dispose() }
}

function Write-AtomicJson {
    param([string]$Path, $Value)
    $temp = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 10))
    $stream = [IO.File]::Open($temp,'CreateNew','Write','None')
    try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    # Same-volume replacement; retain the preceding pointer as a backup.
    if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temp,$Path,"$Path.$([guid]::NewGuid().ToString('N')).backup") }
    else { [IO.File]::Move($temp,$Path) }
}

function Invoke-StoreGuard {
    param([string]$StorePath, [scriptblock]$Action)
    $root = (Resolve-Path -LiteralPath $StorePath).ProviderPath
    # OS arbitration only. Replicated cloud folders are NOT a distributed lock.
    $guard = [IO.File]::Open((Join-Path $root 'store.guard'),'OpenOrCreate','ReadWrite','None')
    try { & $Action $root } finally { $guard.Dispose() }
}

function Initialize-WorldStore {
    param([Parameter(Mandatory)][string]$StorePath)
    if (Test-Path -LiteralPath $StorePath) { throw 'Store must be a new, empty directory; migration is not automatic.' }
    [IO.Directory]::CreateDirectory($StorePath) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $StorePath 'revisions')) | Out-Null
    Write-AtomicJson (Join-Path $StorePath 'store.json') @{schemaVersion=2; authority='single-filesystem'; machine=$env:COMPUTERNAME}
}

function Assert-Store {
    param([string]$Root)
    $info = Get-Content -LiteralPath (Join-Path $Root 'store.json') -Raw | ConvertFrom-Json
    if ($info.schemaVersion -ne 2 -or $info.authority -ne 'single-filesystem' -or $info.machine -ne $env:COMPUTERNAME) {
        throw 'Unsupported store authority. Cloud replication requires a coordinator before multi-PC hosting.'
    }
}

function Get-VerifiedLatest {
    param([string]$Root)
    $path = Join-Path $Root 'latest.json'
    if (-not [IO.File]::Exists($path)) { return $null }
    $latest = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($latest.worldRevision -isnot [long] -and $latest.worldRevision -isnot [int]) { throw 'Invalid revision.' }
    if ($latest.worldRevision -lt 1 -or $latest.fileName -notmatch '^r[0-9]+-[a-f0-9]{32}\.sav$' -or $latest.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid latest metadata.' }
    $actual = Get-WorldFingerprint (Join-Path (Join-Path $Root 'revisions') $latest.fileName)
    if ($actual.sha256 -ne $latest.sha256 -or $actual.bytes -ne $latest.bytes) { throw 'Published revision failed integrity verification.' }
    return $latest
}

function Start-WorldSession {
    param([Parameter(Mandatory)][string]$StorePath, [Parameter(Mandatory)][string]$HostName)
    Invoke-StoreGuard $StorePath {
        param($root)
        Assert-Store $root
        $path = Join-Path $root 'session.json'
        if (Test-Path -LiteralPath $path) { throw 'Session already exists. Even stale sessions require explicit recovery.' }
        $latest = Get-VerifiedLatest $root
        $revision = 0; $hash = $null
        if ($null -ne $latest) { $revision = $latest.worldRevision; $hash = $latest.sha256 }
        $session = [pscustomobject]@{sessionId=[guid]::NewGuid().ToString(); host=$HostName; machine=$env:COMPUTERNAME; startedAtUtc=[datetime]::UtcNow.ToString('o'); lastHeartbeatUtc=[datetime]::UtcNow.ToString('o'); worldRevision=$revision; sourceHash=$hash; status='hosting'}
        Write-AtomicJson $path $session
        return $session
    }
}

function Assert-Session {
    param([string]$Root,[string]$SessionId)
    Assert-Store $Root
    $session = Get-Content -LiteralPath (Join-Path $Root 'session.json') -Raw | ConvertFrom-Json
    if ($session.sessionId -cne $SessionId -or $session.machine -ne $env:COMPUTERNAME -or $session.status -ne 'hosting') { throw 'Session ownership mismatch.' }
    return $session
}

function Update-WorldHeartbeat {
    param([Parameter(Mandatory)][string]$StorePath,[Parameter(Mandatory)][string]$SessionId)
    Invoke-StoreGuard $StorePath {
        param($root)
        $session = Assert-Session $root $SessionId
        $session.lastHeartbeatUtc = [datetime]::UtcNow.ToString('o')
        Write-AtomicJson (Join-Path $root 'session.json') $session
    }
}

function Get-WorldSessionStatus {
    param([Parameter(Mandatory)][string]$StorePath,[ValidateRange(1,86400)][int]$StaleLockSeconds=120)
    Invoke-StoreGuard $StorePath {
        param($root)
        Assert-Store $root
        $session = Get-Content -LiteralPath (Join-Path $root 'session.json') -Raw | ConvertFrom-Json
        $age = ([datetime]::UtcNow - [datetime]::Parse($session.lastHeartbeatUtc).ToUniversalTime()).TotalSeconds
        [pscustomobject]@{session=$session; stale=($age -gt $StaleLockSeconds); ageSeconds=$age}
    }
}

function Publish-WorldRevision {
    param([Parameter(Mandatory)][string]$StorePath,[Parameter(Mandatory)][string]$SessionId,[Parameter(Mandatory)][string]$SourcePath)
    Invoke-StoreGuard $StorePath {
        param($root)
        $session = Assert-Session $root $SessionId
        if (Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -match 'Dragonwilds' }) { throw 'Close Dragonwilds and its server before publication.' }
        if ([IO.Path]::GetExtension($SourcePath) -ine '.sav') { throw 'Only .sav files may be published.' }
        $latest = Get-VerifiedLatest $root
        $revision = 0; $hash = $null
        if ($null -ne $latest) { $revision=$latest.worldRevision; $hash=$latest.sha256 }
        if ($session.worldRevision -ne $revision -or $session.sourceHash -ne $hash) { throw 'Base revision changed. Session retained.' }
        if ($revision -eq [long]::MaxValue) { throw 'Revision limit reached.' }
        $next = $revision + 1
        $name = "r$next-$([guid]::NewGuid().ToString('N')).sav"
        $destination = Join-Path (Join-Path $root 'revisions') $name
        $stage = "$destination.tmp"
        $inputStream = [IO.File]::Open($SourcePath,'Open','Read','Read')
        try {
            if ($inputStream.Length -eq 0) { throw 'Empty save rejected.' }
            $outputStream = [IO.File]::Open($stage,'CreateNew','Write','None')
            try { $inputStream.CopyTo($outputStream); $outputStream.Flush($true) } finally { $outputStream.Dispose() }
            $original = Get-WorldFingerprint $SourcePath
            $copy = Get-WorldFingerprint $stage
            if ($original.sha256 -ne $copy.sha256 -or $original.bytes -ne $copy.bytes) { throw 'Staged copy integrity mismatch.' }
            [IO.File]::Move($stage,$destination)
            $manifest = [pscustomobject]@{schemaVersion=2; worldRevision=$next; sessionId=$SessionId; fileName=$name; originalFileName=$original.fileName; sha256=$copy.sha256; bytes=$copy.bytes; updatedAtUtc=[datetime]::UtcNow.ToString('o')}
            Write-AtomicJson (Join-Path $root 'latest.json') $manifest
            $verified = Get-VerifiedLatest $root
            if ($verified.sessionId -cne $SessionId -or $verified.worldRevision -ne $next) { throw 'Publication verification failed. Session retained.' }
            # Archive ownership only after a verified commit. No save is removed.
            [IO.File]::Move((Join-Path $root 'session.json'),(Join-Path $root "session-$SessionId.completed.json"))
            return $manifest
        } finally { $inputStream.Dispose() }
    }
}

Export-ModuleMember -Function Get-DedicatedServerConfig,Get-WorldFingerprint,Initialize-WorldStore,Start-WorldSession,Update-WorldHeartbeat,Get-WorldSessionStatus,Publish-WorldRevision
