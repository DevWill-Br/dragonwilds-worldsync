$ErrorActionPreference = "Stop"

$ScriptPath = Join-Path $PSScriptRoot "DragonwildsWorldSync.ps1"
$IconPath   = Join-Path $PSScriptRoot "DragonwildsWorldSync.ico"
$OutputPath = Join-Path $PSScriptRoot "DragonwildsWorldSync.exe"

Write-Host "Instalando/atualizando PS2EXE..." -ForegroundColor Cyan
if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
}

Import-Module ps2exe -Force

Write-Host "Gerando EXE..." -ForegroundColor Cyan
Invoke-ps2exe `
    -inputFile $ScriptPath `
    -outputFile $OutputPath `
    -iconFile $IconPath `
    -noConsole `
    -STA `
    -title "Dragonwilds WorldSync" `
    -product "Dragonwilds WorldSync" `
    -company "Will Tools" `
    -description "Ferramenta publica para compartilhamento seguro de mundos locais do RuneScape Dragonwilds" `
    -version "1.4.1" `
    -DPIAware

Write-Host ""
Write-Host "EXE gerado com sucesso em:" -ForegroundColor Green
Write-Host $OutputPath -ForegroundColor Green