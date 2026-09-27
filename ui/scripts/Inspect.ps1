param([string]$Profile)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
try {
 $feature=Get-CimInstance Win32_OptionalFeature -Filter "Name='Containers-DisposableClientVM'"
 $virtual=(Get-CimInstance Win32_ComputerSystem).HypervisorPresent
 $package=Get-AppxPackage MicrosoftWindows.WindowsSandbox | Select-Object -First 1
 $result=@{ok=$true;sandbox=($feature.InstallState -eq 1 -and $null -ne $package);virtualization=[bool]$virtual;originalInstall=(Test-Path -LiteralPath (Join-Path ${env:ProgramFiles(x86)} 'Steam/steamapps/common/RuneScape Dragonwilds Dedicated Server/RSDragonwilds/Binaries/Win64/RSDragonwildsServer-Win64-Shipping.exe'));copiedInstall=$false;lab=$false;credentials=$false;token=([bool]$env:WORLDSYNC_API_TOKEN);sandboxRunning=$false}
 if($Profile -match '^[a-z0-9-]{1,40}$'){
  $p=Get-Content -LiteralPath (Join-Path $repo ('config/hosts/'+$Profile+'.local.json')) -Raw | ConvertFrom-Json
  $result.copiedInstall=((Test-Path -LiteralPath (Join-Path $p.installPath 'RSDragonwilds/Binaries/Win64/RSDragonwildsServer-Win64-Shipping.exe')) -and -not(Test-Path -LiteralPath (Join-Path $p.installPath 'RSDragonwilds/Saved')))
  $result.lab=Test-Path -LiteralPath $p.wsbFile
  $result.credentials=Test-Path -LiteralPath (Join-Path $p.labPath 'credentials-ready.json')
  if(Test-Path -LiteralPath $p.wsbPath){$running=& $p.wsbPath list --raw | ConvertFrom-Json; $result.sandboxRunning=($p.sandboxId -and $p.sandboxId -in @($running.WindowsSandboxEnvironments.Id)) -eq $true}
 }
 $result | ConvertTo-Json -Compress
} catch { '{"ok":false}' ;exit 1 }
