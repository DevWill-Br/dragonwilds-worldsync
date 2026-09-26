#requires -Version 5.1
param([Parameter(Mandatory)][string]$Root,[ValidateSet('Snapshot','Install')][string]$Action,[string]$Stage,[string]$ExpectedSha256,[long]$ExpectedBytes)
$ErrorActionPreference='Stop'
$allowed=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../tests/.scratch/lifecycle'))
$resolved=[IO.Path]::GetFullPath($Root)
if (-not $resolved.StartsWith($allowed + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'WS_OUTSIDE_FIXTURES' }
function Assert-PathSafe([string]$Value) {
    $p=[IO.Path]::GetFullPath($Value)
    if (-not $p.StartsWith($allowed + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'WS_OUTSIDE_FIXTURES' }
    $cursor=$p
    while ($cursor -and $cursor.Length -ge $allowed.Length) {
        if (Test-Path -LiteralPath $cursor) { if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'WS_REPARSE_POINT' } }
        $cursor=[IO.Path]::GetDirectoryName($cursor)
    }
}
function Assert-Stopped {
    if (Test-Path -LiteralPath (Join-Path $resolved 'server.running')) { throw 'WS_SERVER_ACTIVE' }
    # The regular game client is not a writer of the supervised server save.
    # Match the dedicated launcher and shipping executable, as in the adapter.
    if (Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -match '^RSDragonwilds.*Server(?:-|$)' }) { throw 'WS_SERVER_ACTIVE' }
}
function Hash([IO.Stream]$Stream) {
    $Stream.Position=0
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($Stream)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Copy-Locked([string]$Source,[string]$Destination) {
    Assert-PathSafe $Source; Assert-PathSafe $Destination
    $inputStream=[IO.File]::Open($Source,'Open','Read','Read')
    try {
        if ($inputStream.Length -lt 1) { throw 'WS_EMPTY_SAVE' }
        if ($inputStream.Length -gt 33554432) { throw 'WS_SAVE_TOO_LARGE' }
        $expected=Hash $inputStream; $inputStream.Position=0
        $outputStream=[IO.File]::Open($Destination,'CreateNew','ReadWrite','None')
        try {
            $inputStream.CopyTo($outputStream); $outputStream.Flush($true)
            $actual=Hash $outputStream
            if ($actual -ne $expected -or $outputStream.Length -ne $inputStream.Length) { throw 'WS_COPY_HASH_MISMATCH' }
            return @{path=$Destination;sha256=$actual;bytes=$outputStream.Length}
        } finally { $outputStream.Dispose() }
    } finally { $inputStream.Dispose() }
}
Assert-PathSafe $resolved; Assert-Stopped
$save=Join-Path $resolved 'saves/synthetic.sav'
Assert-PathSafe $save
if ($Action -eq 'Snapshot') {
    if (-not [IO.File]::Exists($save)) { throw 'WS_SAVE_MISSING' }
    $snapshot=Copy-Locked $save (Join-Path $resolved ('staging/'+[guid]::NewGuid().ToString('N')+'.sav'))
    Assert-Stopped
    $snapshot | ConvertTo-Json -Compress
} else {
    Assert-PathSafe $Stage
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Stage)) -ne (Join-Path $resolved 'staging')) { throw 'WS_STAGE_REQUIRED' }
    $install=Join-Path $resolved ('saves/'+[guid]::NewGuid().ToString('N')+'.tmp')
    $copy=Copy-Locked $Stage $install
    if ($ExpectedSha256 -notmatch '^[a-f0-9]{64}$' -or $copy.sha256 -ne $ExpectedSha256 -or $copy.bytes -ne $ExpectedBytes) { throw 'WS_IMPORT_INTEGRITY_FAILED' }
    $backup=$null
    if ([IO.File]::Exists($save)) { $backup=Copy-Locked $save (Join-Path $resolved ('backups/'+[guid]::NewGuid().ToString('N')+'.sav')) }
    Assert-Stopped
    if ([IO.File]::Exists($save)) {
        # Atomic replace keeps another copy of the exact replaced file as well.
        [IO.File]::Replace($install,$save,(Join-Path $resolved ('backups/'+[guid]::NewGuid().ToString('N')+'.replaced.sav')))
    } else { [IO.File]::Move($install,$save) }
    $verify=[IO.File]::Open($save,'Open','Read','Read')
    try { if ((Hash $verify) -ne $copy.sha256 -or $verify.Length -ne $copy.bytes) { throw 'WS_IMPORT_VERIFY_FAILED' } } finally { $verify.Dispose() }
    @{installed=$true;sha256=$copy.sha256;bytes=$copy.bytes;backup=$backup} | ConvertTo-Json -Compress
}
