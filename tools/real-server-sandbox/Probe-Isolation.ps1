$ErrorActionPreference='Stop'
$lab='C:\WorldSyncLab'
$install='C:\WorldSyncInstall'
$original='C:\Program Files (x86)\Steam\steamapps\common\RuneScape Dragonwilds Dedicated Server'
$report=[ordered]@{checkedAtUtc=[datetime]::UtcNow.ToString('o');originalVisible=(Test-Path -LiteralPath $original);hostProfileVisible=(Test-Path 'C:\Users\Willi');installWriteDenied=$false;labWritable=$false;copyVerified=$false;operational=$false}
try {
    $probe=Join-Path $install ('isolation-write-probe-'+[guid]::NewGuid().ToString('N')+'.tmp')
    try { $stream=[IO.File]::Open($probe,'CreateNew','Write','None'); $stream.Dispose() }
    catch [UnauthorizedAccessException] { $report.installWriteDenied=$true }
    if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe }
    [IO.File]::WriteAllText((Join-Path $lab 'guest-write-probe.txt'),'isolated lab write successful')
    $report.labWritable=$true
    $copy=Join-Path $lab 'source\WorldSyncTest.sav'
    $report.copyVerified=((Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash -eq '369F0414F45506EBA6D4908361F07C9ECD6C0778888AC167846CA9207F89C0F6')
    $report.operational=($report.installWriteDenied -and $report.labWritable -and $report.copyVerified -and -not $report.originalVisible -and -not $report.hostProfileVisible)
} catch { $report.failureType=$_.Exception.GetType().FullName }
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $lab 'isolation-result.json') -Encoding UTF8
