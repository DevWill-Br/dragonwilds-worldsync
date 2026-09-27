$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
try {
 $v=[Console]::In.ReadToEnd() | ConvertFrom-Json
 if($v.profile -notmatch '^[a-z0-9-]{1,40}$' -or $v.worldId -notmatch '^[a-z0-9][a-z0-9_-]{0,63}$'){throw 'INVALID_PROFILE'}
 & (Join-Path $PSScriptRoot '../../tools/host/setup-host.ps1') -Profile $v.profile -InstallPath $v.installPath -LabPath $v.labPath -WorldId $v.worldId *>$null
 '{"ok":true}'
} catch { '{"ok":false}';exit 1 }
