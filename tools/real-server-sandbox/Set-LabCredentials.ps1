param([Parameter(Mandatory=$true)][string]$LabRoot)
$ErrorActionPreference='Stop'
try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch {}
function Read-Private([string]$Prompt, [switch]$Generate) {
    $secret=Read-Host $Prompt -AsSecureString
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $value=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secret.Dispose() }
    if ([string]::IsNullOrWhiteSpace($value)) {
        if (-not $Generate) { throw 'OwnerId obrigatorio; nenhuma configuracao foi gravada.' }
        $answer=Read-Host 'Gerar senha forte aleatoria localmente? [S/n]'
        if ($answer -and $answer -notmatch '^[sS]$') { throw 'Entrada cancelada; nenhuma configuracao foi gravada.' }
        $bytes=New-Object byte[] 32
        $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $value=[Convert]::ToBase64String($bytes)
    }
    if ($value -match '[\r\n\x00"]') { throw 'Valor contem caracteres nao permitidos no INI.' }
    return $value
}
try {
    $root=(Resolve-Path -LiteralPath $LabRoot).Path
    $expected=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../real-server-lab'))
    if (($root -ne $expected -and -not (Test-Path (Join-Path $root '.worldsync-lab.json'))) -or (Test-Path (Join-Path $root 'adapter.lock'))) { throw 'Laboratorio incorreto ou em uso.' }
    $ini=Join-Path $root 'run-userdir-001\UserData\Saved\Config\WindowsServer\DedicatedServer.ini'
    if (-not (Test-Path -LiteralPath $ini -PathType Leaf)) { throw 'INI isolado nao encontrado.' }
    $item=Get-Item -LiteralPath $ini
    for($dir=$item.Directory; $null -ne $dir; $dir=$dir.Parent) { if($dir.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Diretorio redirecionado recusado.'} }
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Arquivo redirecionado recusado.'}
    Write-Host 'WorldSync: credenciais EXCLUSIVAS do laboratorio. Entrada oculta; nada sera exibido.'
    $owner=Read-Private 'OwnerId valido'
    $admin=Read-Private 'Admin Password (Enter para oferecer geracao local)' -Generate
    $world=Read-Private 'World Password (Enter para oferecer geracao local)' -Generate
    $text=[IO.File]::ReadAllText($ini)
    $values=[ordered]@{OwnerId=$owner;AdminPassword=$admin;WorldPassword=$world;ServerName='WorldSync-Lab';DefaultWorldName='WorldSyncTest';bAllowSendingCrashDumps='False'}
    foreach($key in $values.Keys) {
        $pattern='(?m)^'+[regex]::Escape($key)+'=.*$'
        $line=$key+'='+$values[$key]
        if([regex]::IsMatch($text,$pattern)){ $replacement=$line; $text=[regex]::Replace($text,$pattern,[Text.RegularExpressions.MatchEvaluator]{param($match) $replacement}) }
        else { $text=$text.TrimEnd()+[Environment]::NewLine+$line+[Environment]::NewLine }
    }
    [IO.File]::WriteAllText($ini,$text,(New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $root 'credentials-ready.json'),'{"ready":true}')
    $owner=$admin=$world=$text=$values=$null
    Write-Host 'Configuracao isolada preparada. Volte ao Codex e informe: pronto.'
} catch { Write-Host 'Configuracao nao concluida. Nenhum valor sera exibido.' }
[void](Read-Host 'Enter para fechar')
