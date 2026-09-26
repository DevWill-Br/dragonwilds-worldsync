param([string]$InstallPath=(Join-Path ${env:ProgramFiles(x86)} 'Steam/steamapps/common/RuneScape Dragonwilds Dedicated Server'))
$ErrorActionPreference='Stop'
$executables=@('RSDragonwildsServer.exe','RSDragonwilds/Binaries/Win64/RSDragonwildsServer-Win64-Shipping.exe') | ForEach-Object { Join-Path $InstallPath $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
$configs=@('RSDragonwilds/Saved/Config/WindowsServer/DedicatedServer.ini','RSDragonwilds/Saved/Config/Windows/DedicatedServer.ini') | ForEach-Object { Join-Path $InstallPath $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
$processes=@(Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -match 'Dragonwilds' } | Select-Object Id,ProcessName)
@{installPath=$InstallPath;executables=@($executables);configPaths=@($configs);processes=$processes;running=($processes.Count -gt 0)} | ConvertTo-Json -Depth 4 -Compress
