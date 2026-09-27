param([ValidateSet('Inspect','Discover','Metadata','Install','Snapshot','Launch')][string]$Action,
 [string]$SaveRoot,[string]$FileName,[string]$StateRoot,[string]$BackupRoot,[string]$Stage,[string]$ExpectedSha256,[long]$ExpectedBytes,
 [string]$FixtureRoot,[string]$FixtureProcesses='[]')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$fixtureBase=Join-Path $repo 'tests\.scratch\local-game'
function PathSafe([string]$p) {
 $p=[IO.Path]::GetFullPath($p)
 for($c=$p;$c;$c=[IO.Path]::GetDirectoryName($c)) {
  if(Test-Path -LiteralPath $c){$i=Get-Item -LiteralPath $c -Force;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.LinkType -eq 'HardLink'){throw 'WS_LINK_REJECTED'}}
 }
 return $p
}
function Within([string]$p,[string]$root){$p.Equals($root,[StringComparison]::OrdinalIgnoreCase) -or $p.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)}
$testing=-not [string]::IsNullOrEmpty($FixtureRoot)
if($testing){$expectedRoot=PathSafe $FixtureRoot;if(-not (Within $expectedRoot $fixtureBase) -or $expectedRoot -eq $fixtureBase){throw 'WS_FIXTURE_REQUIRED'}}
else {$expectedRoot=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'RSDragonwilds\Saved\SaveGames'))}
function Processes {
 if($testing){$names=@($FixtureProcesses | ConvertFrom-Json)}else{$names=@(Get-Process -ErrorAction Stop | Select-Object -ExpandProperty ProcessName)}
 # Exact known client launcher/shipping names; never Steam, unrelated apps or dedicated server.
 return @($names | Where-Object {$_ -match '^(RSDragonwilds|RSDragonwilds-Win64-Shipping|RSDragonwilds-WinGDK-Shipping)$'})
}
function Stopped {if((Processes).Count){throw 'WS_GAME_ACTIVE'}}
function SteamInstalled {
 if($testing){return $false}
 $steam=(Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
 if(-not $steam -or -not(Test-Path -LiteralPath (Join-Path $steam 'steam.exe'))){return $false}
 $libraries=@($steam)
 $vdf=Join-Path $steam 'steamapps\libraryfolders.vdf'
 if(Test-Path -LiteralPath $vdf){foreach($line in [IO.File]::ReadLines($vdf)){if($line -match '^\s*"path"\s*"([^\"]+)"'){$libraries+=$matches[1].Replace('\\','\')}}}
 foreach($library in $libraries){if(Test-Path -LiteralPath (Join-Path $library 'steamapps\appmanifest_1374490.acf')){return $true}}
 return $false
}
if($Action -eq 'Inspect') {@{active=((Processes).Count -gt 0);installed=(SteamInstalled)} | ConvertTo-Json -Compress;exit}
Stopped
if($Action -eq 'Launch') {if($testing -or -not (SteamInstalled)){throw 'WS_GAME_NOT_INSTALLED'};Start-Process 'steam://rungameid/1374490' -WindowStyle Hidden;'{"launched":true}';exit}
if($SaveRoot -and [IO.Path]::GetFullPath($SaveRoot) -ne $expectedRoot){throw 'WS_SAVE_ROOT_REJECTED'}
$root=PathSafe $expectedRoot
if(-not(Test-Path -LiteralPath $root -PathType Container)){throw 'WS_SAVE_DIRECTORY_MISSING'}
function Target([string]$name){
 if([string]::IsNullOrWhiteSpace($name) -or [IO.Path]::GetFileName($name) -cne $name -or $name -notmatch '\.sav$' -or $name.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $name -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])\.') {throw 'WS_SAVE_NAME_REJECTED'}
 return PathSafe (Join-Path $root $name)
}
function Meta([string]$file) {
 Stopped;[void](PathSafe $file)
 $stream=[IO.File]::Open($file,'Open','Read','None')
 try {
  if($stream.Length -lt 1 -or $stream.Length -gt 33554432){throw 'WS_SAVE_SIZE_REJECTED'}
  $sha=[Security.Cryptography.SHA256]::Create()
  try {$hash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  $result=@{sha256=$hash;bytes=$stream.Length;mtimeUtc=(Get-Item -LiteralPath $file).LastWriteTimeUtc.ToString('o')}
 }finally{$stream.Dispose()}
 Stopped;return $result
}
function CopyVerified([string]$source,[string]$destination) {
 Stopped;[void](PathSafe $source);[void](PathSafe $destination)
 $inputStream=[IO.File]::Open($source,'Open','Read','None')
 try {
  if($inputStream.Length -lt 1 -or $inputStream.Length -gt 33554432){throw 'WS_SAVE_SIZE_REJECTED'}
  $outputStream=[IO.File]::Open($destination,'CreateNew','ReadWrite','None')
  try {$inputStream.CopyTo($outputStream);$outputStream.Flush($true)}finally{$outputStream.Dispose()}
 }finally{$inputStream.Dispose()}
 $a=Meta $source;$b=Meta $destination
 if($a.sha256 -ne $b.sha256 -or $a.bytes -ne $b.bytes){throw 'WS_COPY_CHANGED'}
 return $b
}
if($Action -eq 'Discover') {
 $worlds=@(Get-ChildItem -LiteralPath $root -Filter '*.sav' -File | ForEach-Object {Stopped;$m=Meta (Target $_.Name);@{fileName=$_.Name;nameHint=$_.BaseName;bytes=$m.bytes;mtimeUtc=$m.mtimeUtc;sha256=$m.sha256;identity='filename_hint_only'}})
 Stopped;@{root=$root;worlds=$worlds} | ConvertTo-Json -Depth 5 -Compress;exit
}
$save=Target $FileName
if($Action -eq 'Metadata') {Meta $save | ConvertTo-Json -Compress;exit}
$state=PathSafe $StateRoot
$layout=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../user-data/layout.json') -Raw | ConvertFrom-Json
$userData=Join-Path $env:LOCALAPPDATA $layout.folder
$stateBase=Join-Path $userData $layout.state
if(-not (Within $state $stateBase) -and -not ($testing -and (Within $state $fixtureBase))){throw 'WS_STATE_ROOT_REJECTED'}
if($BackupRoot){$backups=PathSafe $BackupRoot;if(-not (Within $backups (Join-Path $userData $layout.backups))){throw 'WS_STATE_ROOT_REJECTED'}}else{$backups=PathSafe (Join-Path $state 'backups')}
[void](PathSafe (Join-Path $state 'staging'))
if($Action -eq 'Snapshot'){
 $backup=Join-Path $backups ([guid]::NewGuid().ToString()+'.sav');$m=CopyVerified $save $backup
 (Get-Item -LiteralPath $backup).IsReadOnly=$true
 $dest=Join-Path $state ('staging/'+[guid]::NewGuid()+'.sav');$copy=CopyVerified $backup $dest
 $final=Meta $save;if($final.sha256 -ne $copy.sha256 -or $final.bytes -ne $copy.bytes){throw 'WS_COPY_CHANGED'}
 @{path=$dest;backup=$backup;sha256=$copy.sha256;bytes=$copy.bytes;mtimeUtc=$final.mtimeUtc} | ConvertTo-Json -Compress;exit
}
$stagePath=PathSafe $Stage
if([IO.Path]::GetDirectoryName($stagePath) -ne (Join-Path $state 'staging')){throw 'WS_STAGE_REQUIRED'}
$meta=Meta $stagePath
if($meta.sha256 -ne $ExpectedSha256 -or $meta.bytes -ne $ExpectedBytes){throw 'WS_IMPORT_INTEGRITY_FAILED'}
$backup=$null
if(Test-Path -LiteralPath $save){$backup=Join-Path $backups ([guid]::NewGuid().ToString()+'.sav');[void](CopyVerified $save $backup);(Get-Item -LiteralPath $backup).IsReadOnly=$true}
Stopped
$temp=Join-Path $root ([guid]::NewGuid().ToString('N')+'.worldsync.tmp')
[void](CopyVerified $stagePath $temp)
Stopped;[void](PathSafe $save)
if(Test-Path -LiteralPath $save){
 # Windows PowerShell 5.1 binds $null to an empty string for this overload.
 # Pass a real CLR null; the verified read-only backup already exists.
 Add-Type 'public static class WorldSyncReplace { public static void Install(string source, string destination) { System.IO.File.Replace(source, destination, null); } }'
 [WorldSyncReplace]::Install($temp,$save)
}else{[IO.File]::Move($temp,$save)}
$final=Meta $save
if($final.sha256 -ne $ExpectedSha256 -or $final.bytes -ne $ExpectedBytes){throw 'WS_IMPORT_INTEGRITY_FAILED'}
@{installed=$true;backup=$backup;sha256=$final.sha256;bytes=$final.bytes} | ConvertTo-Json -Compress
