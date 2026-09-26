# Guest-only bridge. Fixed paths deliberately prevent use against the host installation.
param([ValidateSet('Inspect','Start','Run','Signal','Export')][string]$Action='Inspect',
      [ValidatePattern('^[a-f0-9-]{36}$')][string]$RequestId,
      [ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSha256)
$ErrorActionPreference='Stop'
$lab='C:\WorldSyncLab'; $install='C:\WorldSyncInstall'
$userDir=Join-Path $lab 'run-userdir-001\UserData'
$save=Join-Path $userDir 'Saved\SaveGames\WorldSyncTest.sav'
$log=Join-Path $userDir 'Saved\Logs\RSDragonwilds.log'
$runFile=Join-Path $lab 'adapter-run.json'; $exitFile=Join-Path $lab 'adapter-exit.json'
function Assert-Isolated {
    if (Test-Path 'C:\Users\Willi') { throw 'HOST_PROFILE_VISIBLE' }
    if (Test-Path 'C:\Program Files (x86)\Steam\steamapps\common\RuneScape Dragonwilds Dedicated Server') { throw 'ORIGINAL_VISIBLE' }
    if (-not (Test-Path $install) -or -not (Test-Path $userDir)) { throw 'SANDBOX_REQUIRED' }
    foreach($root in @($lab,$install)) {
        if((Get-Item $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_POINT'}
        if(Get-ChildItem $root -Recurse -Force -Attributes ReparsePoint){throw 'REPARSE_POINT'}
    }
}
function Processes { @(Get-Process -ErrorAction Stop | Where-Object ProcessName -match 'RSDragonwilds.*Server') }
function Stopped { if((Processes).Count){throw 'SERVER_ACTIVE'} }
function Metadata([string]$Path) {
    $stream=[IO.File]::Open($Path,'Open','Read','None')
    try {
        if($stream.Length -lt 1 -or $stream.Length -gt 33554432){throw 'SAVE_SIZE_REJECTED'}
        $sha=[Security.Cryptography.SHA256]::Create()
        try {$hash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()} finally {$sha.Dispose()}
        return @{sha256=$hash;bytes=$stream.Length;mtimeUtc=(Get-Item $Path).LastWriteTimeUtc.ToString('o');exclusive=$true}
    } finally {$stream.Dispose()}
}
function LogText { if(Test-Path $log){Get-Content -LiteralPath $log -Raw}else{''} }
function Confirmed {
    $text=LogText
    $events=[regex]::Matches($text,'(?m)^\[(?<stamp>\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3})\].*LogPersistence:.*Save completed SUCCESSFULLY \(slot: WorldSyncTest\)[^\r\n]*')
    if(-not $events.Count){return $null}
    $last=$events[$events.Count-1]
    # A subsequent save start/failure invalidates attribution to this success.
    if($text.Substring($last.Index+$last.Length) -match 'Starting save|Save FAILED'){return $null}
    try {$meta=Metadata $save} catch {return $null}
    $after=LogText
    if($after.Length -lt $text.Length -or $after.Substring($last.Index+$last.Length) -match 'Starting save|Save FAILED'){return $null}
    $eventTime=[datetime]::ParseExact($last.Groups['stamp'].Value,'yyyy.MM.dd-HH.mm.ss:fff',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime()
    if([math]::Abs((([datetime]$meta.mtimeUtc).ToUniversalTime()-$eventTime).TotalSeconds) -gt 2){return $null}
    $meta.success=$true; $meta.eventOffset=$last.Index; $meta.eventUtc=$eventTime.ToString('o')
    return $meta
}
try {
    Assert-Isolated
    switch($Action) {
        'Inspect' {
            $processes=Processes; $text=LogText
            $ports=@(Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object OwningProcess -in $processes.Id | Select-Object -ExpandProperty LocalPort)
            $result=@{active=($processes.Count -gt 0);pids=@($processes.Id);ports=$ports;
                ready=($processes.Count -eq 1 -and $ports -contains 7777 -and $ports -contains 8888 -and $text.Contains('World load SUCCEEDED (slot: WorldSyncTest)') -and $text -match 'LogDomMatcherSession: START SESSION - Success' -and $text -notmatch 'NewGame\(\)');
                confirmed=(Confirmed);frequencyLoaded=($text -match 'Set CVar \[\[dom.StateSaveFrequencyMins:1\]\]')}
            if(Test-Path $exitFile){$result.exit=Get-Content $exitFile -Raw | ConvertFrom-Json}
        }
        'Start' {
            Stopped
            & (Join-Path $lab 'Probe-Isolation.ps1')
            if(-not (Get-Content (Join-Path $lab 'isolation-result.json') -Raw | ConvertFrom-Json).operational){throw 'ISOLATION_FAILED'}
            $ini=Get-Content (Join-Path $userDir 'Saved\Config\WindowsServer\DedicatedServer.ini') -Raw
            if($ini -notmatch '(?m)^DefaultWorldName=WorldSyncTest\s*$'){throw 'WORLD_SELECTION_MISMATCH'}
            $ini=$null
            $incoming=Join-Path $lab 'adapter-input.sav'; $expected=Metadata $incoming
            if (-not $ExpectedSha256 -or $expected.sha256 -ne $ExpectedSha256) { throw 'IMPORT_HASH_MISMATCH' }
            $other=@(Get-ChildItem (Split-Path $save) -Filter *.sav | Where-Object Name -ne 'WorldSyncTest.sav')
            if($other.Count){throw 'AMBIGUOUS_WORLD'}
            $backup=Join-Path $lab ('adapter-backup-'+[guid]::NewGuid().ToString('N')+'.sav')
            if(Test-Path $save){[IO.File]::Copy($save,$backup,$false); if((Metadata $backup).sha256 -ne (Metadata $save).sha256){throw 'BACKUP_FAILED'}}
            $temp=Join-Path (Split-Path $save) ([guid]::NewGuid().ToString('N')+'.tmp')
            [IO.File]::Copy($incoming,$temp,$false)
            if((Metadata $temp).sha256 -ne $expected.sha256){throw 'IMPORT_HASH_MISMATCH'}
            Stopped
            if(Test-Path $save){[IO.File]::Replace($temp,$save,($backup+'.replaced.sav'))}else{[IO.File]::Move($temp,$save)}
            foreach($file in @($runFile,$exitFile,$log)){if(Test-Path $file){Move-Item -LiteralPath $file -Destination ($file+'.'+[guid]::NewGuid().ToString('N')+'.previous')}}
            Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File C:\WorldSyncLab\SandboxServer.ps1 -Action Run' -WindowStyle Hidden | Out-Null
            $until=[datetime]::UtcNow.AddSeconds(15)
            while(-not(Test-Path $runFile) -and [datetime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100}
            if(-not(Test-Path $runFile)){throw 'START_TIMEOUT'}
            $result=Get-Content $runFile -Raw | ConvertFrom-Json
        }
        'Run' {
            Stopped
            $env:PATH=(Join-Path $lab 'runtime')+';'+$env:PATH
            $p=Start-Process (Join-Path $install 'RSDragonwilds\Binaries\Win64\RSDragonwildsServer-Win64-Shipping.exe') -ArgumentList '-UserDir=C:\WorldSyncLab\run-userdir-001\UserData -log -unattended -NoSplash -forcelogflush' -WorkingDirectory $install -WindowStyle Hidden -PassThru
            $null=$p.Handle
            @{pid=$p.Id;startedUtc=$p.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content $runFile
            $p.WaitForExit()
            @{pid=$p.Id;exitCode=$p.ExitCode;exitedUtc=[datetime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content $exitFile
            exit
        }
        'Signal' {
            $run=Get-Content $runFile -Raw | ConvertFrom-Json
            $p=Get-Process -Id $run.pid
            if($p.ProcessName -ne 'RSDragonwildsServer-Win64-Shipping' -or $p.StartTime.ToUniversalTime() -ne ([datetime]$run.startedUtc).ToUniversalTime()){throw 'PROCESS_IDENTITY_MISMATCH'}
            Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WorldSyncSignal {
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool AttachConsole(uint pid);
 [DllImport("kernel32.dll")] static extern bool FreeConsole();
 [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr h,bool add);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint type,uint group);
 public static bool Send(uint pid) {
  FreeConsole(); if(!AttachConsole(pid)) return false;
  if(!SetConsoleCtrlHandler(IntPtr.Zero,true)) { FreeConsole(); return false; }
  bool ok=GenerateConsoleCtrlEvent(0,0); System.Threading.Thread.Sleep(250); FreeConsole(); return ok;
 }
}
'@
            if(-not [WorldSyncSignal]::Send($p.Id)){throw 'SIGNAL_FAILED'}
            $result=@{signalled=$true}
        }
        'Export' {
            Stopped
            $before=Metadata $save; $confirmed=Confirmed
            $destination=Join-Path $lab ('export-'+$RequestId+'.sav')
            $inputStream=[IO.File]::Open($save,'Open','Read','None')
            try {$output=[IO.File]::Open($destination,'CreateNew','Write','None');try{$inputStream.CopyTo($output);$output.Flush($true)}finally{$output.Dispose()}}finally{$inputStream.Dispose()}
            $final=Metadata $save; $copy=Metadata $destination
            if($before.sha256 -ne $final.sha256 -or $before.mtimeUtc -ne $final.mtimeUtc -or $copy.sha256 -ne $final.sha256){throw 'COPY_CHANGED'}
            Stopped
            $result=@{final=$final;latest=$confirmed;exportName=[IO.Path]::GetFileName($destination)}
        }
    }
    if($RequestId){$result | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $lab ('reply-'+$RequestId+'.json'))}
} catch {
    # Never return raw exception text, command lines, logs or INI values.
    if($RequestId){@{error='SANDBOX_OPERATION_FAILED';action=$Action;line=$_.InvocationInfo.ScriptLineNumber} | ConvertTo-Json | Set-Content (Join-Path $lab ('reply-'+$RequestId+'.json'))}
    exit 1
}
