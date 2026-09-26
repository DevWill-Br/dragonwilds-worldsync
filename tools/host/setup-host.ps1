param(
 [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,40}$')][string]$Profile,
 [Parameter(Mandatory)][string]$InstallPath,
 [string]$LabPath,
 [string]$CloudUrl='https://dragonwilds-worldsync-api.contactforwillbr.workers.dev',
 [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')][string]$WorldId='worldsynctest'
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$profiles=Join-Path $repo 'config\hosts'
$profilePath=Join-Path $profiles ($Profile+'.local.json')
if(Test-Path $profilePath){throw 'PROFILE_EXISTS_USE_EXISTING_PROFILE_OR_NEW_NAME'}
function SafePath([string]$p) {
 $p=[IO.Path]::GetFullPath($p).TrimEnd('\')
 foreach($denied in @($env:WINDIR,$env:ProgramFiles,${env:ProgramFiles(x86)})) {
  if($denied -and ($p -eq $denied -or $p.StartsWith($denied+'\',[StringComparison]::OrdinalIgnoreCase))){throw 'SYSTEM_OR_ORIGINAL_INSTALL_REJECTED'}
 }
 if($p -eq $env:USERPROFILE -or $p -eq [IO.Path]::GetPathRoot($p).TrimEnd('\')){throw 'BROAD_MAPPING_REJECTED'}
 for($cursor=$p;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)) {
  if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'REPARSE_POINT_REJECTED'}
 }
 return $p
}
$install=SafePath $InstallPath
if(-not $LabPath){$LabPath=Join-Path $repo ('../worldsync-hosts/'+$Profile+'-lab')}
$lab=SafePath $LabPath
if($lab -eq $install -or $lab.StartsWith($install+'\',[StringComparison]::OrdinalIgnoreCase) -or $install.StartsWith($lab+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'OVERLAPPING_MAPPINGS'}
if(-not(Test-Path (Join-Path $install 'RSDragonwilds\Binaries\Win64\RSDragonwildsServer-Win64-Shipping.exe'))){throw 'COPIED_SERVER_MISSING'}
if(Test-Path (Join-Path $install 'RSDragonwilds\Saved')){throw 'INSTALL_MUST_EXCLUDE_SAVED_CONFIG_AND_SAVES'}
if(Get-ChildItem -LiteralPath $install -Recurse -Force -Attributes ReparsePoint){throw 'INSTALL_REPARSE_POINT'}
if((Test-Path $lab) -and (Get-ChildItem -LiteralPath $lab -Recurse -Force -Attributes ReparsePoint)){throw 'LAB_REPARSE_POINT'}
if(Test-Path (Join-Path $lab 'adapter.lock')){throw 'LAB_LOCKED_RECOVERY_REQUIRED'}
$feature=Get-CimInstance Win32_OptionalFeature -Filter "Name='Containers-DisposableClientVM'"
if($feature.InstallState -ne 1 -or -not (Get-CimInstance Win32_ComputerSystem).HypervisorPresent){throw 'SANDBOX_NOT_ENABLED_OR_REBOOT_REQUIRED'}
$package=Get-AppxPackage MicrosoftWindows.WindowsSandbox | Select-Object -First 1
$wsb=Join-Path $package.InstallLocation 'wsb.exe'
if(-not(Test-Path $wsb)){throw 'SANDBOX_CLI_MISSING'}
# Validate URL with exactly the same policy as the client, before writing profiles.
$env:WORLDSYNC_SETUP_URL=$CloudUrl
Push-Location $repo
try { & node --input-type=module -e "import {cloudOrigin} from './src/lifecycle/cloud.mjs'; cloudOrigin(process.env.WORLDSYNC_SETUP_URL);"; if($LASTEXITCODE -ne 0){throw 'INVALID_CLOUD_URL'} } finally {Pop-Location;Remove-Item Env:\WORLDSYNC_SETUP_URL}
foreach($dir in @($lab,(Join-Path $lab 'runtime'),(Join-Path $lab 'source'),(Join-Path $lab 'run-userdir-001\UserData\Saved\SaveGames'),(Join-Path $lab 'run-userdir-001\UserData\Saved\Config\WindowsServer'))){New-Item -ItemType Directory -Path $dir -Force | Out-Null}
Set-Content (Join-Path $lab '.gitignore') '*'
@{profile=$Profile;isolated=$true} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $lab '.worldsync-lab.json')
foreach($name in @('SandboxServer.ps1','Probe-Isolation.ps1')){Copy-Item (Join-Path $repo ('tools\real-server-sandbox\'+$name)) (Join-Path $lab $name)}
foreach($name in @('vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll')) {
 $source=Join-Path $env:WINDIR ('System32\'+$name)
 if(-not(Test-Path $source)){throw 'VISUAL_CPP_RUNTIME_REQUIRED_ON_HOST'}
 Copy-Item -LiteralPath $source -Destination (Join-Path $lab ('runtime\'+$name))
}
$configDir=Join-Path $lab 'run-userdir-001\UserData\Saved\Config\WindowsServer'
$ini=Join-Path $configDir 'DedicatedServer.ini'
if(-not(Test-Path $ini)) {
 @('[ /Script/Dominion.DedicatedServerSettings]'.Replace('[ ','['),'OwnerId=','AdminPassword=','WorldPassword=','ServerName=WorldSync-Lab','DefaultWorldName=WorldSyncTest','bAllowSendingCrashDumps=False') | Set-Content -Encoding UTF8 $ini
}
$engine=Join-Path $configDir 'Engine.ini'
if(-not(Test-Path $engine)){Set-Content -Encoding UTF8 $engine "[ConsoleVariables]`r`ndom.StateSaveFrequencyMins=1"}
New-Item -ItemType Directory $profiles -Force | Out-Null
$installXml=[Security.SecurityElement]::Escape($install);$labXml=[Security.SecurityElement]::Escape($lab)
$xml=@"
<Configuration>
 <VGpu>Disable</VGpu><Networking>Enable</Networking><AudioInput>Disable</AudioInput><VideoInput>Disable</VideoInput><PrinterRedirection>Disable</PrinterRedirection><ClipboardRedirection>Disable</ClipboardRedirection><MemoryInMB>8192</MemoryInMB>
 <MappedFolders>
  <MappedFolder><HostFolder>$installXml</HostFolder><SandboxFolder>C:\WorldSyncInstall</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
  <MappedFolder><HostFolder>$labXml</HostFolder><SandboxFolder>C:\WorldSyncLab</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
 </MappedFolders>
 <LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\WorldSyncLab\Probe-Isolation.ps1</Command></LogonCommand>
</Configuration>
"@
$wsbFile=Join-Path $lab 'WorldSync.wsb';Set-Content -Encoding UTF8 $wsbFile $xml
@{profile=$Profile;cloudUrl=$CloudUrl;worldId=$WorldId;machineId=[guid]::NewGuid().ToString();host=$env:COMPUTERNAME;labPath=$lab;installPath=$install;wsbPath=$wsb;wsbFile=$wsbFile;sandboxId=$null} | ConvertTo-Json | Set-Content -Encoding UTF8 $profilePath
Write-Host "Perfil preparado: $Profile. Nenhuma VM ou servidor foi iniciado; nenhum save foi copiado/publicado."
Write-Host "Credenciais locais: tools\real-server-sandbox\Set-LabCredentials.ps1 -LabRoot `"$lab`""
