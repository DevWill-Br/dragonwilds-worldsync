$ErrorActionPreference='Stop'
$lab='C:\WorldSyncLab'
$install='C:\WorldSyncInstall'
$original='C:\Program Files (x86)\Steam\steamapps\common\RuneScape Dragonwilds Dedicated Server'
$report=[ordered]@{checkedAtUtc=[datetime]::UtcNow.ToString('o');originalVisible=(Test-Path -LiteralPath $original);hostProfileVisible=(Test-Path 'C:\Users\Willi');installWriteDenied=$false;labWritable=$false;sourcePresent=$false;operational=$false}
try {
    $probe=Join-Path $install ('isolation-write-probe-'+[guid]::NewGuid().ToString('N')+'.tmp')
    try { $stream=[IO.File]::Open($probe,'CreateNew','Write','None'); $stream.Dispose() }
    catch [UnauthorizedAccessException] { $report.installWriteDenied=$true }
    if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe }
    [IO.File]::WriteAllText((Join-Path $lab 'guest-write-probe.txt'),'isolated lab write successful')
    $report.labWritable=$true
    $copy=Join-Path $lab 'source\WorldSyncTest.sav'
    $report.sourcePresent=(Test-Path -LiteralPath $copy) # Informational only; imported revision is verified by the bridge against its declared hash.
    $report.operational=($report.installWriteDenied -and $report.labWritable -and -not $report.originalVisible -and -not $report.hostProfileVisible)
} catch { $report.failureType=$_.Exception.GetType().FullName }
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $lab 'isolation-result.json') -Encoding UTF8
