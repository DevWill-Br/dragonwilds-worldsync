param([ValidateSet('status','start','credentials','seed-world')][string]$Action='status',
 [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,40}$')][string]$Profile,
 [switch]$ConfirmUploadCopy)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$file=Join-Path $repo ('config\hosts\'+$Profile+'.local.json')
$p=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
if($Action -eq 'credentials'){& (Join-Path $repo 'tools\real-server-sandbox\Set-LabCredentials.ps1') -LabRoot $p.labPath;exit}
if($Action -eq 'seed-world' -and -not $ConfirmUploadCopy){throw 'Use -ConfirmUploadCopy to publish only lab/source/WorldSyncTest.sav as the first canonical revision.'}
if(-not $env:WORLDSYNC_API_TOKEN){$env:WORLDSYNC_API_TOKEN=[Environment]::GetEnvironmentVariable('WORLDSYNC_API_TOKEN','User')}
if(-not $env:WORLDSYNC_API_TOKEN) {
 try{Stop-Transcript -ErrorAction SilentlyContinue|Out-Null}catch{}
 $secure=Read-Host 'Token WorldSync (entrada oculta; somente ambiente deste processo)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$env:WORLDSYNC_API_TOKEN=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secure.Dispose()}
}
if($Action -eq 'start') {
 & node (Join-Path $repo 'tools\host\host.mjs') preflight $file
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 if(Test-Path (Join-Path $p.labPath 'adapter.lock')){throw 'LAB_LOCKED_RECOVERY_REQUIRED'}
 $current=& $p.wsbPath list --raw | ConvertFrom-Json
 if(-not $p.sandboxId -or $p.sandboxId -notin $current.WindowsSandboxEnvironments.Id) {
  [xml]$config=Get-Content -LiteralPath $p.wsbFile
  $maps=@($config.Configuration.MappedFolders.MappedFolder)
  if($maps.Count -ne 2 -or $maps[0].HostFolder -ne $p.installPath -or $maps[0].ReadOnly -ne 'true' -or $maps[0].SandboxFolder -ne 'C:\WorldSyncInstall' -or $maps[1].HostFolder -ne $p.labPath -or $maps[1].SandboxFolder -ne 'C:\WorldSyncLab'){throw 'UNEXPECTED_SANDBOX_MAPPING'}
  $before=@($current.WindowsSandboxEnvironments.Id);$started=[datetime]::UtcNow
  Start-Process WindowsSandbox.exe -ArgumentList ('"'+$p.wsbFile+'"') -WindowStyle Hidden | Out-Null
  $until=[datetime]::UtcNow.AddSeconds(120);$found=$false
  do {
   $state=& $p.wsbPath list --raw | ConvertFrom-Json
   $new=@($state.WindowsSandboxEnvironments | Where-Object Id -notin $before)
   if($new.Count -gt 1){throw 'AMBIGUOUS_SANDBOX_ID'}
   $probe=Join-Path $p.labPath 'isolation-result.json'
   if($new.Count -eq 1 -and (Test-Path $probe)) {
    $proof=Get-Content $probe -Raw | ConvertFrom-Json
    if($proof.operational -and ([datetime]$proof.checkedAtUtc).ToUniversalTime() -ge $started){$p.sandboxId=$new[0].Id;$found=$true;break}
   }
   Start-Sleep -Milliseconds 500
  } while([datetime]::UtcNow -lt $until)
  if(-not $found){throw 'SANDBOX_ISOLATION_START_TIMEOUT'}
  $p | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $file
 }
}
if($Action -eq 'seed-world'){$env:WORLDSYNC_CONFIRM_SEED='yes'}
try { & node (Join-Path $repo 'tools\host\host.mjs') $Action $file; $result=$LASTEXITCODE }
finally {Remove-Item Env:\WORLDSYNC_CONFIRM_SEED -ErrorAction SilentlyContinue}
exit $result
