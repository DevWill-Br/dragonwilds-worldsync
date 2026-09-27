param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,40}$')][string]$Profile)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
try {
 $v=[Console]::In.ReadToEnd() | ConvertFrom-Json
 $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
 $p=Get-Content -LiteralPath (Join-Path $repo ('config/hosts/'+$Profile+'.local.json')) -Raw | ConvertFrom-Json
 $global:worldSyncUiPrivateInputs=New-Object 'System.Collections.Generic.Queue[string]'
 foreach($value in @([string]$v.owner,[string]$v.admin,[string]$v.world)){$global:worldSyncUiPrivateInputs.Enqueue($value)}
 # Adapt only the existing interactive input boundary. All INI/path validation,
 # password generation and writing remain in the existing credential script.
 function global:Read-Host {
  param([string]$Prompt,[switch]$AsSecureString)
  if($AsSecureString){$value=$global:worldSyncUiPrivateInputs.Dequeue();$secure=New-Object Security.SecureString;foreach($c in $value.ToCharArray()){$secure.AppendChar($c)};return $secure}
  if($Prompt.Contains('[S/n]')){return 'S'}
  return ''
 }
 $started=[datetime]::UtcNow
 & (Join-Path $repo 'tools/real-server-sandbox/Set-LabCredentials.ps1') -LabRoot $p.labPath *>$null
 $ready=Join-Path $p.labPath 'credentials-ready.json'
 if(-not(Test-Path $ready) -or (Get-Item $ready).LastWriteTimeUtc -lt $started){throw 'CREDENTIALS_FAILED'}
 $v=$global:worldSyncUiPrivateInputs=$null
 '{"ok":true}'
} catch { '{"ok":false}';exit 1 }
