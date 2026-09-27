# Tests only new throwaway profile/lab; never loads the real host's INI.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='ui-test-'+[guid]::NewGuid().ToString('N').Substring(0,12)
$lab=Join-Path $repo ('tests/.scratch/ui/'+$name)
$profileFile=Join-Path $repo ('config/hosts/'+$name+'.local.json')
try {
 $v=@{profile=$name;worldId='ui-test-world';installPath='C:\Users\Willi\Documents\Codex\WSReal\install';labPath=$lab} | ConvertTo-Json -Compress
 $result=$v | powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'ui/scripts/Setup.ps1')
 if($LASTEXITCODE -ne 0 -or -not ($result | ConvertFrom-Json).ok){throw 'SETUP_TEST_FAILED'}
 $v=@{owner='UI_TEST_OWNER_NOT_REAL';admin='UI_TEST_ADMIN_NOT_REAL';world='UI_TEST_WORLD_NOT_REAL'} | ConvertTo-Json -Compress
 $result=$v | powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'ui/scripts/Credentials.ps1') -Profile $name
 if($LASTEXITCODE -ne 0 -or -not ($result | ConvertFrom-Json).ok -or $result -match 'UI_TEST_'){throw 'CREDENTIALS_TEST_FAILED'}
 $ini=Join-Path $lab 'run-userdir-001/UserData/Saved/Config/WindowsServer/DedicatedServer.ini'
 $content=[IO.File]::ReadAllText($ini)
 if($content -notmatch 'OwnerId=UI_TEST_OWNER_NOT_REAL' -or $content -notmatch 'AdminPassword=UI_TEST_ADMIN_NOT_REAL' -or $content -notmatch 'WorldPassword=UI_TEST_WORLD_NOT_REAL'){throw 'CREDENTIALS_WRITE_FAILED'}
 $v=@{owner='UI_TEST_OWNER_NOT_REAL';admin='';world=''} | ConvertTo-Json -Compress
 $result=$v | powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'ui/scripts/Credentials.ps1') -Profile $name
 if($LASTEXITCODE -ne 0 -or -not ($result | ConvertFrom-Json).ok){throw 'GENERATED_PASSWORD_TEST_FAILED'}
 $content=[IO.File]::ReadAllText($ini)
 if($content -notmatch '(?m)^AdminPassword=.{40,}' -or $content -notmatch '(?m)^WorldPassword=.{40,}'){throw 'GENERATED_PASSWORD_MISSING'}
 $content=$null
 'PASS: existing setup automation, masked credential adapter, strong generated passwords, no private values in stdout.'
} finally {
 # Remove only this uniquely named synthetic profile; retain the test laboratory.
 if(Test-Path -LiteralPath $profileFile){Remove-Item -LiteralPath $profileFile}
}
