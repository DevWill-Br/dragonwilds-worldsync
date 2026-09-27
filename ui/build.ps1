param([string]$Dotnet='dotnet')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$out=Join-Path $repo ('ui/artifacts/WorldSync-2.0-win-x64-'+$stamp)
& $Dotnet publish (Join-Path $PSScriptRoot 'WorldSync.Desktop') -c Release -r win-x64 --self-contained true -o $out --nologo
if($LASTEXITCODE -ne 0){throw 'BUILD_FAILED'}
# Package an explicit source allowlist. Never copy a working directory wholesale.
$core=Join-Path $out 'core'
foreach($dir in @('src/lifecycle','src/local-game','src/user-data')) {
 $target=Join-Path $core $dir;New-Item -ItemType Directory -Path $target -Force | Out-Null
 Get-ChildItem -LiteralPath (Join-Path $repo $dir) -File | Where-Object Extension -in @('.mjs','.ps1','.json') | Copy-Item -Destination $target
}
New-Item -ItemType Directory -Path (Join-Path $core 'ui') -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'bridge.mjs') (Join-Path $core 'ui/bridge.mjs')
New-Item -ItemType Directory -Path (Join-Path $core 'config/local-game'),(Join-Path $out 'runtime') -Force | Out-Null
Copy-Item -LiteralPath (Get-Command node).Source -Destination (Join-Path $out 'runtime/node.exe')
$nodeVersion=(& node --version).TrimStart('v')
Invoke-WebRequest ('https://raw.githubusercontent.com/nodejs/node/v'+$nodeVersion+'/LICENSE') -OutFile (Join-Path $out 'runtime/NODE-LICENSE.txt')
Copy-Item (Join-Path $PSScriptRoot 'Create-Shortcut.ps1') (Join-Path $out 'Create-Shortcut.ps1')
Copy-Item (Join-Path $PSScriptRoot 'README.md') (Join-Path $out 'LEIA-ME.md')
if(Get-ChildItem $out -Recurse -File | Where-Object { $_.Name -match '\.sav($|\.)|\.ini$|\.local\.json$|^\.dev\.vars$|^lifecycle\.json$|\.lock$' }){throw 'PRIVATE_FILE_IN_PACKAGE'}
@{ui='2.0-preview';node=$nodeVersion;coreCommit=(& git -C $repo rev-parse HEAD);generatedUtc=[datetime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $out 'build-info.json')
Compress-Archive -Path (Join-Path $out '*') -DestinationPath ($out+'.zip')
@{directory=$out;zip=($out+'.zip');sha256=(Get-FileHash ($out+'.zip') -Algorithm SHA256).Hash} | ConvertTo-Json
