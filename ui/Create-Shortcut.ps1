param([string]$Destination,[switch]$StartMenu)
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'WorldSync.exe'
if(-not(Test-Path -LiteralPath $exe -PathType Leaf)){throw 'WorldSync.exe must be beside this script'}
if(-not $Destination){$Destination=if($StartMenu){[Environment]::GetFolderPath('Programs')}else{[Environment]::GetFolderPath('DesktopDirectory')}}
$Destination=[IO.Path]::GetFullPath($Destination)
if(-not(Test-Path -LiteralPath $Destination -PathType Container)){throw 'Shortcut destination does not exist'}
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut((Join-Path $Destination 'WorldSync 2.0.lnk'))
$link.TargetPath=$exe
$link.WorkingDirectory=$PSScriptRoot
$link.IconLocation=$exe+',0'
$link.Description='WorldSync 2.0'
$link.Save()
