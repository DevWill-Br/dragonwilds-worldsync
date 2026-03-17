Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Script:ToolVersion = "1.4.0-banner-rc"

function Get-AppBasePath {
    if ($PSScriptRoot -and (Test-Path $PSScriptRoot)) { return $PSScriptRoot }
    try {
        $base = [System.AppDomain]::CurrentDomain.BaseDirectory
        if ($base -and (Test-Path $base)) { return $base.TrimEnd('\') }
    } catch {}
    return [Environment]::GetFolderPath("Desktop")
}

$Script:AppBasePath = Get-AppBasePath
$Script:AppDataRoot = Join-Path $env:APPDATA "DragonwildsHostToolPublic"
$Script:UserConfigPath = Join-Path $Script:AppDataRoot "user.config.json"

function Ensure-Folder {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

Ensure-Folder $Script:AppDataRoot

function Get-DefaultUserConfig {
    [ordered]@{
        AppVersion = $Script:ToolVersion
        SharedRoot = ""
        LocalSaveFolder = (Join-Path $env:LOCALAPPDATA "RSDragonwilds\Saved\SaveGames")
        WorldName = ""
        WorldFileName = ""
        IsAdmin = $false
        FriendlyDateFormat = "dd/MM/yyyy HH:mm:ss"
        AutoRefreshSeconds = 15
        WindowTitle = "Dragonwilds WorldSync"
        AccentColor = "#2D6CDF"
        Language = "pt-BR"
    }
}

function Save-UserConfig {
    param([hashtable]$Config)
    Ensure-Folder $Script:AppDataRoot
    ($Config | ConvertTo-Json -Depth 6) | Set-Content -Path $Script:UserConfigPath -Encoding UTF8
}

function Load-UserConfig {
    $cfg = Get-DefaultUserConfig
    if (-not (Test-Path $Script:UserConfigPath)) { return $cfg }
    try {
        $raw = Get-Content $Script:UserConfigPath -Raw | ConvertFrom-Json
        foreach ($p in $raw.PSObject.Properties.Name) { $cfg[$p] = $raw.$p }
        return $cfg
    } catch {
        return $cfg
    }
}

$Script:UserConfig = Load-UserConfig

# Visual theme migration
if ([string]::IsNullOrWhiteSpace([string]$Script:UserConfig.AccentColor)) {
    $Script:UserConfig.AccentColor = "#2D6CDF"
}
$Script:HeaderAccentHex = "#C6A15B"
$colorGold = [System.Drawing.ColorTranslator]::FromHtml($Script:HeaderAccentHex)
$Script:HeaderBannerFile = Join-Path $Script:AppBasePath "DragonwildsHeaderBanner.png"
$Script:WindowIconPath = Join-Path $Script:AppBasePath "DragonwildsWorldSync.ico"

function Get-Language {
    $lang = [string]$Script:UserConfig.Language
    if ([string]::IsNullOrWhiteSpace($lang)) { return "pt-BR" }
    return $lang
}

function T {
    param([string]$Key)
    $lang = Get-Language
    switch ($lang) {
        "en" {
            switch ($Key) {
                "window_title" { if (-not [string]::IsNullOrWhiteSpace([string]$Script:UserConfig.WindowTitle)) { return [string]$Script:UserConfig.WindowTitle } else { return "Dragonwilds WorldSync" } }
                "top_subtitle" { return "Community world sharing, safe host handoff, backups and sync" }
                "settings" { return "Settings" }
                "quick_status" { return "Quick status" }
                "card_world" { return "World" }
                "card_world_status" { return "World status" }
                "card_game_status" { return "Game status" }
                "card_save" { return "Official save" }
                "group_actions" { return "Actions" }
                "your_name" { return "Your name:" }
                "wizard" { return "Setup Wizard" }
                "refresh" { return "Refresh Status" }
                "host" { return "Host World" }
                "end_host" { return "End Host" }
                "open_shared" { return "Open Synced Folder" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Details" }
                "mode" { return "Mode:" }
                "current_host" { return "Current host:" }
                "current_machine" { return "Current machine:" }
                "host_started" { return "Host started:" }
                "updated_by" { return "Last updated by:" }
                "updated_at" { return "Last updated at:" }
                "synced_folder" { return "Synced folder:" }
                "local_saves_folder" { return "Local saves folder" }
                "session_log" { return "Session log" }
                "admin" { return "ADMIN" }
                "user" { return "USER" }
                "wizard_title" { return "Initial Setup Wizard" }
                "wizard_subtitle" { return "Choose whether you want to create a new shared world or join an existing one." }
                "create_shared_world" { return "Create shared world" }
                "join_shared_world" { return "Join existing shared world" }
                "paths" { return "Paths" }
                "browse" { return "Browse..." }
                "detect_default" { return "Detect default" }
                "create_share_group" { return "Create shared world" }
                "load_local_worlds" { return "Load local worlds" }
                "initialize_share" { return "Initialize share" }
                "join_share_group" { return "Join existing share" }
                "join_info" { return "Select the synced folder and load the shared world data." }
                "read_share" { return "Read share" }
                "save_and_use" { return "Save and use this share" }
                "close" { return "Close" }
                "config_title" { return "Settings" }
                "date_format" { return "Date format:" }
                "auto_refresh" { return "Auto refresh (sec):" }
                "window_title_label" { return "Window title:" }
                "language" { return "Language:" }
                "save" { return "Save" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "About" }
                "about_title" { return "About Dragonwilds WorldSync" }
                "about_tagline" { return "Public desktop utility for local world handoff." }
                "about_description" { return "Built to help groups share local worlds with safer host handoff, backups, lock control and guided setup." }
                "about_author" { return "Created by Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Unofficial community utility. Not affiliated with Jagex." }
                "about_close" { return "Close" }
                
                "msg_name_required" { return "Type your name before continuing." }
                "title_name_required" { return "Name required" }
                "msg_setup_first" { return "Configure the tool first in the Initial Wizard." }
                "title_incomplete_config" { return "Incomplete configuration" }
                "msg_synced_folder_invalid" { return "The synced folder was not found. Review the configuration." }
                "title_synced_folder_invalid" { return "Invalid synced folder" }
                "msg_local_folder_invalid" { return "The local saves folder was not found. Review the configuration." }
                "title_local_folder_invalid" { return "Invalid local folder" }
                "msg_close_game_before_host" { return "Close Dragonwilds before clicking HOST WORLD." }
                "msg_close_game_before_end" { return "Close Dragonwilds completely before clicking END HOST." }
                "title_game_open" { return "Game open" }
                "msg_official_save_missing" { return "The official save was not found in:`r`n{0}" }
                "title_official_save_missing" { return "Official save not found" }
                "msg_world_locked" { return "The world is already locked by {0}." }
                "title_world_locked" { return "World locked" }
                "msg_world_ready" { return "World prepared successfully.`r`n`r`nNow open the game and enter the world '{0}'." }
                "title_world_ready" { return "Host ready" }
                "msg_local_save_missing" { return "The local save was not found in:`r`n{0}" }
                "title_local_save_missing" { return "Local save not found" }
                "msg_no_lock" { return "There is no active lock. The world does not seem reserved right now." }
                "title_no_lock" { return "No lock" }
                "msg_lock_invalid" { return "The current lock could not be read." }
                "title_lock_invalid" { return "Invalid lock" }
                "msg_host_mismatch" { return "The world is locked by '{0}', not by '{1}'." }
                "title_host_mismatch" { return "Host mismatch" }
                "msg_world_released" { return "Host ended successfully.`r`n`r`nWait for sync to finish before the next host starts." }
                "title_world_released" { return "World released" }
                "msg_admin_force_only" { return "Only the share admin can use Force Unlock." }
                "title_permission_denied" { return "Permission denied" }
                "msg_confirm_force_unlock" { return "Are you sure you want to FORCE UNLOCK the world?`r`n`r`nUse this only if someone locked the world and left without ending properly." }
                "title_confirm_force_unlock" { return "Confirm force unlock" }
                "msg_no_worlds_found" { return "No .sav files were found in this folder." }
                "title_no_worlds_found" { return "No worlds found" }
                "msg_select_synced_folder" { return "Select the synced folder." }
                "title_required_field" { return "Required field" }
                "msg_invalid_local_folder" { return "The local saves folder was not found." }
                "title_invalid_folder" { return "Invalid folder" }
                "msg_select_world_first" { return "Load and select a local world first." }
                "title_select_world" { return "Select a world" }
                "msg_share_created" { return "Share created successfully.`r`n`r`nThe world was copied to the synced folder and your local configuration was saved as ADMIN." }
                "title_share_created" { return "Share created" }
                "msg_select_valid_synced" { return "Select a valid synced folder." }
                "msg_invalid_share" { return "A valid world.meta.json was not found in this folder." }
                "title_invalid_share" { return "Invalid share" }
                "msg_load_share_first" { return "Load a share first." }
                "title_missing_data" { return "Missing data" }
                "msg_share_config_saved" { return "Share configured successfully.`r`n`r`nThis machine can now use Host World and End Host." }
                "title_config_saved" { return "Configuration saved" }
                "msg_settings_saved_local" { return "Settings saved successfully." }
                "msg_synced_folder_not_found" { return "Synced folder not found." }
                "title_error" { return "Error" }
                "msg_settings_saved" { return "Settings saved. Reopen the app to apply all texts." }
                "status_locked" { return "LOCKED" }
                "status_free" { return "FREE" }
                "status_open" { return "OPEN" }
                "status_closed" { return "CLOSED" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NOT FOUND" }
                default { return $Key }
            }
        }
        default {
            switch ($Key) {
                "window_title" { if (-not [string]::IsNullOrWhiteSpace([string]$Script:UserConfig.WindowTitle)) { return [string]$Script:UserConfig.WindowTitle } else { return "Dragonwilds WorldSync" } }
                "top_subtitle" { return "Compartilhamento de mundo, handoff seguro, backups e sincronizacao" }
                "settings" { return "Configuracoes" }
                "quick_status" { return "Resumo rapido" }
                "card_world" { return "Mundo" }
                "card_world_status" { return "Status do mundo" }
                "card_game_status" { return "Status do jogo" }
                "card_save" { return "Save oficial" }
                "group_actions" { return "Acoes" }
                "your_name" { return "Seu nome:" }
                "wizard" { return "Assistente Inicial" }
                "refresh" { return "Atualizar Status" }
                "host" { return "Hostear Mundo" }
                "end_host" { return "Encerrar Host" }
                "open_shared" { return "Abrir Pasta Compartilhada" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Detalhes" }
                "mode" { return "Modo:" }
                "current_host" { return "Host atual:" }
                "current_machine" { return "Maquina atual:" }
                "host_started" { return "Inicio da host:" }
                "updated_by" { return "Ultima atualizacao por:" }
                "updated_at" { return "Ultima atualizacao em:" }
                "synced_folder" { return "Pasta sincronizada:" }
                "local_saves_folder" { return "Pasta local dos saves" }
                "session_log" { return "Log da sessao" }
                "admin" { return "ADMIN" }
                "user" { return "USUARIO" }
                "wizard_title" { return "Assistente Inicial" }
                "wizard_subtitle" { return "Escolha se vai criar um compartilhamento novo ou entrar em um existente." }
                "create_shared_world" { return "Criar mundo compartilhado" }
                "join_shared_world" { return "Entrar em mundo compartilhado existente" }
                "paths" { return "Caminhos" }
                "browse" { return "Procurar..." }
                "detect_default" { return "Detectar padrao" }
                "create_share_group" { return "Criar compartilhamento" }
                "load_local_worlds" { return "Carregar mundos locais" }
                "initialize_share" { return "Inicializar compartilhamento" }
                "join_share_group" { return "Entrar em compartilhamento existente" }
                "join_info" { return "Selecione a pasta sincronizada e carregue os dados do compartilhamento." }
                "read_share" { return "Ler compartilhamento" }
                "save_and_use" { return "Salvar e usar este compartilhamento" }
                "close" { return "Fechar" }
                "config_title" { return "Configuracoes" }
                "date_format" { return "Formato de data:" }
                "auto_refresh" { return "Auto refresh (seg):" }
                "window_title_label" { return "Titulo da janela:" }
                "language" { return "Idioma:" }
                "save" { return "Salvar" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "Sobre" }
                "about_title" { return "Sobre o Dragonwilds WorldSync" }
                "about_tagline" { return "Utilitario desktop publico para handoff de mundos locais." }
                "about_description" { return "Criado para ajudar grupos a compartilhar mundos locais com handoff mais seguro, backups, controle de lock e configuracao guiada." }
                "about_author" { return "Criado por Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Utilitario nao oficial da comunidade. Sem afiliacao com a Jagex." }
                "about_close" { return "Fechar" }
                
                "msg_name_required" { return "Digite seu nome antes de continuar." }
                "title_name_required" { return "Nome obrigatorio" }
                "msg_setup_first" { return "Configure a ferramenta primeiro no Assistente Inicial." }
                "title_incomplete_config" { return "Configuracao incompleta" }
                "msg_synced_folder_invalid" { return "A pasta sincronizada nao foi encontrada. Revise a configuracao." }
                "title_synced_folder_invalid" { return "Pasta sincronizada invalida" }
                "msg_local_folder_invalid" { return "A pasta local de saves nao foi encontrada. Revise a configuracao." }
                "title_local_folder_invalid" { return "Pasta local invalida" }
                "msg_close_game_before_host" { return "Feche o Dragonwilds antes de clicar em HOSTEAR." }
                "msg_close_game_before_end" { return "Feche o Dragonwilds completamente antes de clicar em ENCERRAR HOST." }
                "title_game_open" { return "Jogo aberto" }
                "msg_official_save_missing" { return "O save oficial nao foi encontrado em:`r`n{0}" }
                "title_official_save_missing" { return "Save oficial nao encontrado" }
                "msg_world_locked" { return "O mundo ja esta bloqueado por {0}." }
                "title_world_locked" { return "Mundo bloqueado" }
                "msg_world_ready" { return "Mundo preparado com sucesso.`r`n`r`nAgora abra o jogo e entre no mundo '{0}'." }
                "title_world_ready" { return "Host pronto" }
                "msg_local_save_missing" { return "O save local nao foi encontrado em:`r`n{0}" }
                "title_local_save_missing" { return "Save local nao encontrado" }
                "msg_no_lock" { return "Nao existe lock ativo. O mundo nao parece estar reservado agora." }
                "title_no_lock" { return "Sem lock" }
                "msg_lock_invalid" { return "Nao foi possivel ler o lock atual." }
                "title_lock_invalid" { return "Lock invalido" }
                "msg_host_mismatch" { return "O mundo esta bloqueado por '{0}', nao por '{1}'." }
                "title_host_mismatch" { return "Host divergente" }
                "msg_world_released" { return "Host encerrado com sucesso.`r`n`r`nEspere a sincronizacao terminar antes do proximo host entrar." }
                "title_world_released" { return "Mundo liberado" }
                "msg_admin_force_only" { return "Somente o admin do compartilhamento pode usar Force Unlock." }
                "title_permission_denied" { return "Permissao negada" }
                "msg_confirm_force_unlock" { return "Tem certeza que deseja FORCAR A LIBERACAO do mundo?`r`n`r`nUse isso apenas se alguem travou o mundo e saiu sem encerrar direito." }
                "title_confirm_force_unlock" { return "Confirmar force unlock" }
                "msg_no_worlds_found" { return "Nenhum arquivo .sav foi encontrado nessa pasta." }
                "title_no_worlds_found" { return "Sem mundos encontrados" }
                "msg_select_synced_folder" { return "Selecione a pasta sincronizada." }
                "title_required_field" { return "Campo obrigatorio" }
                "msg_invalid_local_folder" { return "A pasta local dos saves nao foi encontrada." }
                "title_invalid_folder" { return "Pasta invalida" }
                "msg_select_world_first" { return "Carregue e selecione um mundo local primeiro." }
                "title_select_world" { return "Selecione um mundo" }
                "msg_share_created" { return "Compartilhamento criado com sucesso.`r`n`r`nO mundo foi copiado para a pasta sincronizada e sua configuracao local foi salva como ADMIN." }
                "title_share_created" { return "Compartilhamento criado" }
                "msg_select_valid_synced" { return "Selecione uma pasta sincronizada valida." }
                "msg_invalid_share" { return "Nao foi encontrado um world.meta.json valido nessa pasta." }
                "title_invalid_share" { return "Compartilhamento invalido" }
                "msg_load_share_first" { return "Carregue um compartilhamento primeiro." }
                "title_missing_data" { return "Dados ausentes" }
                "msg_share_config_saved" { return "Compartilhamento configurado com sucesso.`r`n`r`nSua maquina agora pode usar Hostear Mundo e Encerrar Host." }
                "title_config_saved" { return "Configuracao salva" }
                "msg_settings_saved_local" { return "Configuracoes salvas com sucesso." }
                "msg_synced_folder_not_found" { return "Pasta sincronizada nao encontrada." }
                "title_error" { return "Erro" }
                "msg_settings_saved" { return "Configuracoes salvas. Reabra o app para aplicar todos os textos." }
                "status_locked" { return "BLOQUEADO" }
                "status_free" { return "LIVRE" }
                "status_open" { return "ABERTO" }
                "status_closed" { return "FECHADO" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NAO ENCONTRADO" }
                default { return $Key }
            }
        }
    }
}


function Resolve-PathTemplate {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }
    $resolved = [Environment]::ExpandEnvironmentVariables($Value)
    $resolved = $resolved -replace '\$env:USERPROFILE', [Regex]::Escape($env:USERPROFILE).Replace('\\','\')
    $resolved = $resolved -replace '\$env:LOCALAPPDATA', [Regex]::Escape($env:LOCALAPPDATA).Replace('\\','\')
    $resolved = $resolved -replace '\$env:APPDATA', [Regex]::Escape($env:APPDATA).Replace('\\','\')
    return $resolved
}

function Refresh-Paths {
    $Script:SharedRoot = Resolve-PathTemplate([string]$Script:UserConfig.SharedRoot)
    $Script:LocalSaveFolder = Resolve-PathTemplate([string]$Script:UserConfig.LocalSaveFolder)
    $Script:WorldName = [string]$Script:UserConfig.WorldName
    $Script:WorldFileName = [string]$Script:UserConfig.WorldFileName
    if ([string]::IsNullOrWhiteSpace($Script:WorldFileName) -and -not [string]::IsNullOrWhiteSpace($Script:WorldName)) {
        $Script:WorldFileName = "$Script:WorldName.sav"
    }

    $Script:SharedCurrent = $null
    $Script:SharedBackups = $null
    $Script:SharedLock = $null
    $Script:SharedLogs = $null
    $Script:SharedWorldFile = $null
    $Script:LockFile = $null
    $Script:LatestFile = $null
    $Script:LogFile = $null
    $Script:MetaFile = $null

    if (-not [string]::IsNullOrWhiteSpace($Script:SharedRoot)) {
        $Script:SharedCurrent = Join-Path $Script:SharedRoot "current"
        $Script:SharedBackups = Join-Path $Script:SharedRoot "backups"
        $Script:SharedLock = Join-Path $Script:SharedRoot "lock"
        $Script:SharedLogs = Join-Path $Script:SharedRoot "logs"
        $Script:MetaFile = Join-Path $Script:SharedRoot "world.meta.json"
        if (-not [string]::IsNullOrWhiteSpace($Script:WorldFileName)) {
            $Script:SharedWorldFile = Join-Path $Script:SharedCurrent $Script:WorldFileName
        }
        $Script:LockFile = Join-Path $Script:SharedLock "world.lock.json"
        $Script:LatestFile = Join-Path $Script:SharedCurrent "latest.json"
        $Script:LogFile = Join-Path $Script:SharedLogs "activity.log"
    }

    $Script:LocalWorldFile = $null
    if (-not [string]::IsNullOrWhiteSpace($Script:LocalSaveFolder) -and -not [string]::IsNullOrWhiteSpace($Script:WorldFileName)) {
        $Script:LocalWorldFile = Join-Path $Script:LocalSaveFolder $Script:WorldFileName
    }
}
Refresh-Paths

function Ensure-ShareStructure {
    if ([string]::IsNullOrWhiteSpace($Script:SharedRoot)) { return }
    Ensure-Folder $Script:SharedRoot
    Ensure-Folder $Script:SharedCurrent
    Ensure-Folder $Script:SharedBackups
    Ensure-Folder $Script:SharedLock
    Ensure-Folder $Script:SharedLogs
}

function Get-DateFormat {
    $fmt = [string]$Script:UserConfig.FriendlyDateFormat
    if ([string]::IsNullOrWhiteSpace($fmt)) { return "dd/MM/yyyy HH:mm:ss" }
    return $fmt
}

function Format-DisplayDate {
    param($Value)
    if ($null -eq $Value) { return "-" }
    $s = [string]$Value
    if ([string]::IsNullOrWhiteSpace($s)) { return "-" }
    $fmt = Get-DateFormat
    try { return ([DateTimeOffset]::Parse($s)).ToLocalTime().ToString($fmt) } catch {}
    try { return ([DateTime]::Parse($s)).ToString($fmt) } catch {}
    return $s
}

function Get-DragonwildsProcesses {
    $expectedNames = @(
        'RSDragonwilds',
        'RSDragonwilds-Win64-Shipping',
        'RuneScapeDragonwilds',
        'RuneScapeDragonwilds-Win64-Shipping'
    )
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $name = $_.ProcessName
        if ($name -match 'HostTool') { return $false }
        if ($expectedNames -contains $name) { return $true }
        if ($name -match '^RSDragonwilds($|-)') { return $true }
        if ($name -match '^RuneScapeDragonwilds($|-)') { return $true }
        return $false
    }
}

function Write-ActivityLog {
    param([string]$Message)
    if ([string]::IsNullOrWhiteSpace($Script:LogFile)) { return }
    Ensure-ShareStructure
    Add-Content -Path $Script:LogFile -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
}

function Write-UiLog {
    param([string]$Message, [string]$Level = "INFO")
    $txtLog.AppendText(("[{0}] [{1}] {2}`r`n" -f (Get-Date -Format "HH:mm:ss"), $Level, $Message))
    $txtLog.SelectionStart = $txtLog.Text.Length
    $txtLog.ScrollToCaret()
}

function Get-LatestInfo {
    if (-not [string]::IsNullOrWhiteSpace($Script:LatestFile) -and (Test-Path $Script:LatestFile)) {
        try { return Get-Content $Script:LatestFile -Raw | ConvertFrom-Json } catch { return $null }
    }
    return $null
}

function Get-LockInfo {
    if (-not [string]::IsNullOrWhiteSpace($Script:LockFile) -and (Test-Path $Script:LockFile)) {
        try { return Get-Content $Script:LockFile -Raw | ConvertFrom-Json } catch { return $null }
    }
    return $null
}

function Get-WorldMeta {
    param([string]$SharedRoot)
    if ([string]::IsNullOrWhiteSpace($SharedRoot)) { return $null }
    $metaPath = Join-Path $SharedRoot "world.meta.json"
    if (-not (Test-Path $metaPath)) { return $null }
    try { return Get-Content $metaPath -Raw | ConvertFrom-Json } catch { return $null }
}

function Set-StatusBadge {
    param([System.Windows.Forms.Label]$Label,[string]$Text,[System.Drawing.Color]$BackColor,[System.Drawing.Color]$ForeColor)
    $Label.Text = "  $Text  "
    $Label.BackColor = $BackColor
    $Label.ForeColor = $ForeColor
}

function Is-ConfigReady {
    if ([string]::IsNullOrWhiteSpace([string]$Script:UserConfig.SharedRoot)) { return $false }
    if ([string]::IsNullOrWhiteSpace([string]$Script:UserConfig.LocalSaveFolder)) { return $false }
    if ([string]::IsNullOrWhiteSpace([string]$Script:UserConfig.WorldFileName)) { return $false }
    return $true
}

function Require-HostName {
    $name = $txtHostName.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($name)) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_name_required"),(T "title_name_required"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        return $null
    }
    return $name
}

function Validate-ConfigForActions {
    Refresh-Paths
    if (-not (Is-ConfigReady)) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_setup_first"),(T "title_incomplete_config"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        Write-UiLog "Configuracao incompleta. Abra o Assistente Inicial." "ERRO"
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($Script:SharedRoot) -or -not (Test-Path $Script:SharedRoot)) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_synced_folder_invalid"),(T "title_synced_folder_invalid"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        Write-UiLog "Pasta sincronizada invalida." "ERRO"
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($Script:LocalSaveFolder) -or -not (Test-Path $Script:LocalSaveFolder)) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_local_folder_invalid"),(T "title_local_folder_invalid"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        Write-UiLog "Pasta local invalida." "ERRO"
        return $false
    }
    return $true
}

function Refresh-Status {
    Refresh-Paths
    $lblWorldValue.Text = $(if ([string]::IsNullOrWhiteSpace($Script:WorldName)) { "-" } else { $Script:WorldName })
    $txtSharedRootMain.Text = $Script:SharedRoot
    $txtGameSave.Text = $Script:LocalSaveFolder
    $lblModeValue.Text = $(if ($Script:UserConfig.IsAdmin) { (T "admin") } else { (T "user") })

    $lockInfo = Get-LockInfo
    $latestInfo = Get-LatestInfo
    $gameRunning = Get-DragonwildsProcesses

    if ($lockInfo) {
        Set-StatusBadge -Label $lblWorldStatusBadge -Text (T "status_locked") -BackColor ([System.Drawing.Color]::FromArgb(255,230,230)) -ForeColor ([System.Drawing.Color]::FromArgb(170,20,20))
        $lblHostValue.Text = "$($lockInfo.host)"
        $lblMachineValue.Text = "$($lockInfo.machine)"
        $lockMoment = $lockInfo.startedAtUtc
        if (-not $lockMoment) { $lockMoment = $lockInfo.startedAtLocal }
        if (-not $lockMoment) { $lockMoment = $lockInfo.startedAt }
        $lblStartedAtValue.Text = (Format-DisplayDate $lockMoment)
    } else {
        Set-StatusBadge -Label $lblWorldStatusBadge -Text (T "status_free") -BackColor ([System.Drawing.Color]::FromArgb(228,248,232)) -ForeColor ([System.Drawing.Color]::FromArgb(20,120,40))
        $lblHostValue.Text = "-"
        $lblMachineValue.Text = "-"
        $lblStartedAtValue.Text = "-"
    }

    if ($latestInfo) {
        $lblUpdatedByValue.Text = "$($latestInfo.updatedBy)"
        $updateMoment = $latestInfo.updatedAtUtc
        if (-not $updateMoment) { $updateMoment = $latestInfo.updatedAtLocal }
        if (-not $updateMoment) { $updateMoment = $latestInfo.updatedAt }
        $lblUpdatedAtValue.Text = (Format-DisplayDate $updateMoment)
    } else {
        $lblUpdatedByValue.Text = "-"
        $lblUpdatedAtValue.Text = "-"
    }

    if ($gameRunning) {
        Set-StatusBadge -Label $lblGameBadge -Text (T "status_open") -BackColor ([System.Drawing.Color]::FromArgb(255,230,230)) -ForeColor ([System.Drawing.Color]::FromArgb(170,20,20))
    } else {
        Set-StatusBadge -Label $lblGameBadge -Text (T "status_closed") -BackColor ([System.Drawing.Color]::FromArgb(228,248,232)) -ForeColor ([System.Drawing.Color]::FromArgb(20,120,40))
    }

    if (-not [string]::IsNullOrWhiteSpace($Script:SharedWorldFile) -and (Test-Path $Script:SharedWorldFile)) {
        Set-StatusBadge -Label $lblSaveBadge -Text (T "status_ok") -BackColor ([System.Drawing.Color]::FromArgb(228,248,232)) -ForeColor ([System.Drawing.Color]::FromArgb(20,120,40))
    } else {
        Set-StatusBadge -Label $lblSaveBadge -Text (T "status_not_found") -BackColor ([System.Drawing.Color]::FromArgb(255,230,230)) -ForeColor ([System.Drawing.Color]::FromArgb(170,20,20))
    }

    $btnForce.Visible = [bool]$Script:UserConfig.IsAdmin
}

function Start-Hosting {
    $HostName = Require-HostName
    if (-not $HostName) { return }
    if (-not (Validate-ConfigForActions)) { return }
    Ensure-ShareStructure

    $RunningGame = Get-DragonwildsProcesses
    if ($RunningGame) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_close_game_before_host"),(T "title_game_open"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        Write-UiLog ("Erro: jogo aberto. Processo detectado: {0}" -f $RunningGame[0].ProcessName) "ERRO"
        Refresh-Status
        return
    }

    if (-not (Test-Path $Script:SharedWorldFile)) {
        [System.Windows.Forms.MessageBox]::Show(([string]::Format((T "msg_official_save_missing"), $Script:SharedWorldFile)),(T "title_official_save_missing"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        Write-UiLog "Erro: save oficial nao encontrado." "ERRO"
        Refresh-Status
        return
    }

    $lockInfo = Get-LockInfo
    if ($lockInfo) {
        [System.Windows.Forms.MessageBox]::Show(([string]::Format((T "msg_world_locked"), $lockInfo.host)),(T "title_world_locked"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        Write-UiLog "Mundo bloqueado por $($lockInfo.host)." "ALERTA"
        Refresh-Status
        return
    }

    if (Test-Path $Script:LocalWorldFile) {
        $BackupName = "{0}_{1}_{2}_LOCAL_BEFORE_IMPORT.sav" -f $Script:WorldName, (Get-Date -Format "yyyy-MM-dd_HH-mm-ss"), $HostName
        $BackupPath = Join-Path $Script:SharedBackups $BackupName
        Copy-Item $Script:LocalWorldFile $BackupPath -Force
        Write-UiLog "Backup local criado: $BackupName"
        Write-ActivityLog "Backup local antes do import: $BackupPath"
    }

    Copy-Item $Script:SharedWorldFile $Script:LocalWorldFile -Force

    $LockData = [ordered]@{
        worldName      = $Script:WorldName
        host           = $HostName
        machine        = $env:COMPUTERNAME
        startedAtUtc   = [DateTimeOffset]::Now.ToString("o")
        startedAtLocal = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        status         = "locked"
    }
    $LockData | ConvertTo-Json -Depth 6 | Set-Content -Path $Script:LockFile -Encoding UTF8

    Write-ActivityLog "$HostName importou o save oficial e bloqueou o mundo."
    Write-UiLog "Mundo preparado e bloqueado para voce."
    Write-UiLog "Agora abra o jogo e entre no mundo '$Script:WorldName'."
    Refresh-Status
    [System.Windows.Forms.MessageBox]::Show(([string]::Format((T "msg_world_ready"), $Script:WorldName)),(T "title_world_ready"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}

function Stop-Hosting {
    $HostName = Require-HostName
    if (-not $HostName) { return }
    if (-not (Validate-ConfigForActions)) { return }
    Ensure-ShareStructure

    $RunningGame = Get-DragonwildsProcesses
    if ($RunningGame) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_close_game_before_end"),(T "title_game_open"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        Write-UiLog ("Erro: jogo ainda aberto. Processo detectado: {0}" -f $RunningGame[0].ProcessName) "ERRO"
        Refresh-Status
        return
    }

    if (-not (Test-Path $Script:LocalWorldFile)) {
        [System.Windows.Forms.MessageBox]::Show(([string]::Format((T "msg_local_save_missing"), $Script:LocalWorldFile)),(T "title_local_save_missing"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        Write-UiLog "Erro: save local nao encontrado." "ERRO"
        Refresh-Status
        return
    }

    if (-not (Test-Path $Script:LockFile)) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_no_lock"),(T "title_no_lock"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        Write-UiLog "Erro: nao existe lock ativo." "ERRO"
        Refresh-Status
        return
    }

    try { $LockJson = Get-Content $Script:LockFile -Raw | ConvertFrom-Json } catch {
        [System.Windows.Forms.MessageBox]::Show((T "msg_lock_invalid"),(T "title_lock_invalid"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        Write-UiLog "Erro: lock invalido." "ERRO"
        Refresh-Status
        return
    }

    if ($LockJson.host -ne $HostName) {
        [System.Windows.Forms.MessageBox]::Show(([string]::Format((T "msg_host_mismatch"), $LockJson.host, $HostName)),(T "title_host_mismatch"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        Write-UiLog "Erro: o lock pertence a $($LockJson.host)." "ERRO"
        Refresh-Status
        return
    }

    $Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $BackupName = "{0}_{1}_{2}.sav" -f $Script:WorldName, $Timestamp, $HostName
    $BackupPath = Join-Path $Script:SharedBackups $BackupName

    Copy-Item $Script:LocalWorldFile $BackupPath -Force
    Copy-Item $Script:LocalWorldFile $Script:SharedWorldFile -Force

    $LatestData = [ordered]@{
        worldName      = $Script:WorldName
        fileName       = $Script:WorldFileName
        updatedBy      = $HostName
        updatedAtUtc   = [DateTimeOffset]::Now.ToString("o")
        updatedAtLocal = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        machine        = $env:COMPUTERNAME
    }
    $LatestData | ConvertTo-Json -Depth 6 | Set-Content -Path $Script:LatestFile -Encoding UTF8
    Remove-Item $Script:LockFile -Force

    Write-ActivityLog "$HostName atualizou o save oficial, criou backup e liberou o mundo."
    Write-UiLog "Host encerrado com sucesso."
    Write-UiLog "Espere o OneDrive sincronizar antes do proximo host entrar."
    Refresh-Status
    [System.Windows.Forms.MessageBox]::Show((T "msg_world_released"),(T "title_world_released"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}

function Force-Unlock {
    if (-not $Script:UserConfig.IsAdmin) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_admin_force_only"),(T "title_permission_denied"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        return
    }
    if (-not (Validate-ConfigForActions)) { return }

    if (-not (Test-Path $Script:LockFile)) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_no_lock"),(T "title_no_lock"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        Write-UiLog "Nao existe lock ativo para remover."
        Refresh-Status
        return
    }

    $result = [System.Windows.Forms.MessageBox]::Show((T "msg_confirm_force_unlock"),(T "title_confirm_force_unlock"),[System.Windows.Forms.MessageBoxButtons]::YesNo,[System.Windows.Forms.MessageBoxIcon]::Warning)
    if ($result -ne [System.Windows.Forms.DialogResult]::Yes) {
        Write-UiLog "Force unlock cancelado."
        return
    }

    Remove-Item $Script:LockFile -Force
    $who = $txtHostName.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($who)) { $who = "desconhecido" }
    Write-ActivityLog "Force unlock executado por $who"
    Write-UiLog "Lock removido com sucesso." "ALERTA"
    Refresh-Status
}

function Get-LocalWorldFiles {
    param([string]$SaveFolder)
    $items = @()
    if ([string]::IsNullOrWhiteSpace($SaveFolder) -or -not (Test-Path $SaveFolder)) { return $items }
    Get-ChildItem -Path $SaveFolder -Filter *.sav -File | Sort-Object LastWriteTime -Descending | ForEach-Object {
        $items += [PSCustomObject]@{
            Display = "{0} | {1} | {2:N1} KB" -f $_.BaseName, $_.LastWriteTime.ToString("dd/MM/yyyy HH:mm:ss"), ($_.Length / 1KB)
            WorldName = $_.BaseName
            FileName = $_.Name
            FullPath = $_.FullName
        }
    }
    return $items
}

function Open-SetupWizard {
    $setupForm = New-Object System.Windows.Forms.Form
    $setupForm.Text = (T "wizard_title")
    $setupForm.Size = New-Object System.Drawing.Size(760, 620)
    $setupForm.StartPosition = "CenterParent"
    $setupForm.BackColor = [System.Drawing.Color]::White

    $fontLabel = New-Object System.Drawing.Font("Segoe UI", 9)
    $fontTitle = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)

    $lblTitle2 = New-Object System.Windows.Forms.Label
    $lblTitle2.Text = (T "wizard_title")
    $lblTitle2.Font = $fontTitle
    $lblTitle2.AutoSize = $true
    $lblTitle2.Location = New-Object System.Drawing.Point(20, 16)
    $setupForm.Controls.Add($lblTitle2)

    $lblSub2 = New-Object System.Windows.Forms.Label
    $lblSub2.Text = (T "wizard_subtitle")
    $lblSub2.Font = $fontLabel
    $lblSub2.AutoSize = $true
    $lblSub2.Location = New-Object System.Drawing.Point(22, 46)
    $setupForm.Controls.Add($lblSub2)

    $rbCreate = New-Object System.Windows.Forms.RadioButton
    $rbCreate.Text = (T "create_shared_world")
    $rbCreate.Location = New-Object System.Drawing.Point(24, 78)
    $rbCreate.AutoSize = $true
    $rbCreate.Checked = $true
    $setupForm.Controls.Add($rbCreate)

    $rbJoin = New-Object System.Windows.Forms.RadioButton
    $rbJoin.Text = (T "join_shared_world")
    $rbJoin.Location = New-Object System.Drawing.Point(250, 78)
    $rbJoin.AutoSize = $true
    $setupForm.Controls.Add($rbJoin)

    $groupCommon = New-Object System.Windows.Forms.GroupBox
    $groupCommon.Text = (T "paths")
    $groupCommon.Location = New-Object System.Drawing.Point(20, 110)
    $groupCommon.Size = New-Object System.Drawing.Size(700, 150)
    $setupForm.Controls.Add($groupCommon)

    $lblShared = New-Object System.Windows.Forms.Label; $lblShared.Text = (T "synced_folder"); $lblShared.AutoSize = $true; $lblShared.Location = New-Object System.Drawing.Point(16, 32); $groupCommon.Controls.Add($lblShared)
    $txtShared = New-Object System.Windows.Forms.TextBox; $txtShared.Location = New-Object System.Drawing.Point(130, 29); $txtShared.Size = New-Object System.Drawing.Size(450, 23); $txtShared.Text = [string]$Script:UserConfig.SharedRoot; $groupCommon.Controls.Add($txtShared)
    $btnBrowseShared = New-Object System.Windows.Forms.Button; $btnBrowseShared.Text = (T "browse"); $btnBrowseShared.Location = New-Object System.Drawing.Point(590, 27); $btnBrowseShared.Size = New-Object System.Drawing.Size(90, 28)
    $btnBrowseShared.Add_Click({
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.SelectedPath = Resolve-PathTemplate($txtShared.Text)
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $txtShared.Text = $dialog.SelectedPath }
    })
    $groupCommon.Controls.Add($btnBrowseShared)

    $lblLocal = New-Object System.Windows.Forms.Label; $lblLocal.Text = (T "local_saves_folder") + ":"; $lblLocal.AutoSize = $true; $lblLocal.Location = New-Object System.Drawing.Point(16, 72); $groupCommon.Controls.Add($lblLocal)
    $txtLocal = New-Object System.Windows.Forms.TextBox; $txtLocal.Location = New-Object System.Drawing.Point(130, 69); $txtLocal.Size = New-Object System.Drawing.Size(450, 23); $txtLocal.Text = [string]$Script:UserConfig.LocalSaveFolder; $groupCommon.Controls.Add($txtLocal)
    $btnBrowseLocal = New-Object System.Windows.Forms.Button; $btnBrowseLocal.Text = (T "browse"); $btnBrowseLocal.Location = New-Object System.Drawing.Point(590, 67); $btnBrowseLocal.Size = New-Object System.Drawing.Size(90, 28)
    $btnBrowseLocal.Add_Click({
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.SelectedPath = Resolve-PathTemplate($txtLocal.Text)
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $txtLocal.Text = $dialog.SelectedPath }
    })
    $groupCommon.Controls.Add($btnBrowseLocal)

    $btnDetect = New-Object System.Windows.Forms.Button
    $btnDetect.Text = (T "detect_default")
    $btnDetect.Location = New-Object System.Drawing.Point(130, 107)
    $btnDetect.Size = New-Object System.Drawing.Size(120, 28)
    $btnDetect.Add_Click({ $txtLocal.Text = (Join-Path $env:LOCALAPPDATA "RSDragonwilds\Saved\SaveGames") })
    $groupCommon.Controls.Add($btnDetect)

    $groupCreate = New-Object System.Windows.Forms.GroupBox
    $groupCreate.Text = (T "create_share_group")
    $groupCreate.Location = New-Object System.Drawing.Point(20, 272)
    $groupCreate.Size = New-Object System.Drawing.Size(700, 230)
    $setupForm.Controls.Add($groupCreate)

    $btnLoadWorlds = New-Object System.Windows.Forms.Button; $btnLoadWorlds.Text = (T "load_local_worlds"); $btnLoadWorlds.Location = New-Object System.Drawing.Point(16, 28); $btnLoadWorlds.Size = New-Object System.Drawing.Size(160, 30); $groupCreate.Controls.Add($btnLoadWorlds)
    $listWorlds = New-Object System.Windows.Forms.ListBox; $listWorlds.Location = New-Object System.Drawing.Point(16, 68); $listWorlds.Size = New-Object System.Drawing.Size(660, 110); $groupCreate.Controls.Add($listWorlds)
    $btnInitShare = New-Object System.Windows.Forms.Button; $btnInitShare.Text = (T "initialize_share"); $btnInitShare.Location = New-Object System.Drawing.Point(16, 190); $btnInitShare.Size = New-Object System.Drawing.Size(180, 30); $groupCreate.Controls.Add($btnInitShare)

    $groupJoin = New-Object System.Windows.Forms.GroupBox
    $groupJoin.Text = (T "join_share_group")
    $groupJoin.Location = New-Object System.Drawing.Point(20, 272)
    $groupJoin.Size = New-Object System.Drawing.Size(700, 230)
    $groupJoin.Visible = $false
    $setupForm.Controls.Add($groupJoin)

    $lblJoinInfo = New-Object System.Windows.Forms.Label; $lblJoinInfo.Text = (T "join_info"); $lblJoinInfo.AutoSize = $true; $lblJoinInfo.Location = New-Object System.Drawing.Point(16, 30); $groupJoin.Controls.Add($lblJoinInfo)
    $btnLoadMeta = New-Object System.Windows.Forms.Button; $btnLoadMeta.Text = (T "read_share"); $btnLoadMeta.Location = New-Object System.Drawing.Point(16, 58); $btnLoadMeta.Size = New-Object System.Drawing.Size(150, 30); $groupJoin.Controls.Add($btnLoadMeta)
    $txtJoinResult = New-Object System.Windows.Forms.TextBox; $txtJoinResult.Multiline = $true; $txtJoinResult.ReadOnly = $true; $txtJoinResult.Location = New-Object System.Drawing.Point(16, 100); $txtJoinResult.Size = New-Object System.Drawing.Size(660, 80); $groupJoin.Controls.Add($txtJoinResult)
    $btnSaveJoin = New-Object System.Windows.Forms.Button; $btnSaveJoin.Text = (T "save_and_use"); $btnSaveJoin.Location = New-Object System.Drawing.Point(16, 190); $btnSaveJoin.Size = New-Object System.Drawing.Size(240, 30); $btnSaveJoin.Enabled = $false; $groupJoin.Controls.Add($btnSaveJoin)

    $btnCloseSetup = New-Object System.Windows.Forms.Button
    $btnCloseSetup.Text = (T "close")
    $btnCloseSetup.Location = New-Object System.Drawing.Point(620, 520)
    $btnCloseSetup.Size = New-Object System.Drawing.Size(100, 30)
    $btnCloseSetup.Add_Click({ $setupForm.Close() })
    $setupForm.Controls.Add($btnCloseSetup)

    $setupState = @{ JoinMeta = $null; CreateWorld = $null }

    $toggleMode = {
        $groupCreate.Visible = [bool]$rbCreate.Checked
        $groupJoin.Visible = [bool]$rbJoin.Checked
    }
    $rbCreate.Add_CheckedChanged($toggleMode)
    $rbJoin.Add_CheckedChanged($toggleMode)

    $btnLoadWorlds.Add_Click({
        $listWorlds.Items.Clear()
        $setupState.CreateWorld = $null
        $items = Get-LocalWorldFiles (Resolve-PathTemplate($txtLocal.Text))
        foreach ($item in $items) { [void]$listWorlds.Items.Add($item.Display) }
        if ($items.Count -eq 0) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_no_worlds_found"),(T "title_no_worlds_found"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        }
        $setupForm.Tag = $items
    })

    $listWorlds.Add_SelectedIndexChanged({
        $items = $setupForm.Tag
        if ($items -and $listWorlds.SelectedIndex -ge 0) { $setupState.CreateWorld = $items[$listWorlds.SelectedIndex] }
    })

    $btnInitShare.Add_Click({
        $shared = Resolve-PathTemplate($txtShared.Text)
        $local = Resolve-PathTemplate($txtLocal.Text)
        if ([string]::IsNullOrWhiteSpace($shared)) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_select_synced_folder"),(T "title_required_field"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            return
        }
        if ([string]::IsNullOrWhiteSpace($local) -or -not (Test-Path $local)) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_invalid_local_folder"),(T "title_invalid_folder"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            return
        }
        if (-not $setupState.CreateWorld) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_select_world_first"),(T "title_select_world"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            return
        }

        $sharedCurrent = Join-Path $shared "current"
        Ensure-Folder $shared
        Ensure-Folder $sharedCurrent
        Ensure-Folder (Join-Path $shared "backups")
        Ensure-Folder (Join-Path $shared "lock")
        Ensure-Folder (Join-Path $shared "logs")

        $target = Join-Path $sharedCurrent $setupState.CreateWorld.FileName
        Copy-Item $setupState.CreateWorld.FullPath $target -Force

        $meta = [ordered]@{
            toolVersion    = $Script:ToolVersion
            worldName      = $setupState.CreateWorld.WorldName
            fileName       = $setupState.CreateWorld.FileName
            createdAtUtc   = [DateTimeOffset]::Now.ToString("o")
            createdAtLocal = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            initializedBy  = $env:USERNAME
        }
        ($meta | ConvertTo-Json -Depth 6) | Set-Content -Path (Join-Path $shared "world.meta.json") -Encoding UTF8

        $cfg = Get-DefaultUserConfig
        $cfg.SharedRoot = $shared
        $cfg.LocalSaveFolder = $local
        $cfg.WorldName = $setupState.CreateWorld.WorldName
        $cfg.WorldFileName = $setupState.CreateWorld.FileName
        $cfg.IsAdmin = $true
        Save-UserConfig $cfg
        $Script:UserConfig = Load-UserConfig

function Get-Language {
    $lang = [string]$Script:UserConfig.Language
    if ([string]::IsNullOrWhiteSpace($lang)) { return "pt-BR" }
    return $lang
}

function T {
    param([string]$Key)
    $lang = Get-Language
    switch ($lang) {
        "en" {
            switch ($Key) {
                "window_title" { return "Dragonwilds WorldSync" }
                "top_subtitle" { return "Community world sharing, safe host handoff, backups and sync" }
                "settings" { return "Settings" }
                "quick_status" { return "Quick status" }
                "card_world" { return "World" }
                "card_world_status" { return "World status" }
                "card_game_status" { return "Game status" }
                "card_save" { return "Official save" }
                "group_actions" { return "Actions" }
                "your_name" { return "Your name:" }
                "wizard" { return "Setup Wizard" }
                "refresh" { return "Refresh Status" }
                "host" { return "Host World" }
                "end_host" { return "End Host" }
                "open_shared" { return "Open Synced Folder" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Details" }
                "mode" { return "Mode:" }
                "current_host" { return "Current host:" }
                "current_machine" { return "Current machine:" }
                "host_started" { return "Host started:" }
                "updated_by" { return "Last updated by:" }
                "updated_at" { return "Last updated at:" }
                "synced_folder" { return "Synced folder:" }
                "local_saves_folder" { return "Local saves folder" }
                "session_log" { return "Session log" }
                "admin" { return "ADMIN" }
                "user" { return "USER" }
                "wizard_title" { return "Initial Setup Wizard" }
                "wizard_subtitle" { return "Choose whether you want to create a new shared world or join an existing one." }
                "create_shared_world" { return "Create shared world" }
                "join_shared_world" { return "Join existing shared world" }
                "paths" { return "Paths" }
                "browse" { return "Browse..." }
                "detect_default" { return "Detect default" }
                "create_share_group" { return "Create shared world" }
                "load_local_worlds" { return "Load local worlds" }
                "initialize_share" { return "Initialize share" }
                "join_share_group" { return "Join existing share" }
                "join_info" { return "Select the synced folder and load the shared world data." }
                "read_share" { return "Read share" }
                "save_and_use" { return "Save and use this share" }
                "close" { return "Close" }
                "config_title" { return "Settings" }
                "date_format" { return "Date format:" }
                "auto_refresh" { return "Auto refresh (sec):" }
                "window_title_label" { return "Window title:" }
                "language" { return "Language:" }
                "save" { return "Save" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "About" }
                "about_title" { return "About Dragonwilds WorldSync" }
                "about_tagline" { return "Public release candidate for local world handoff." }
                "about_description" { return "Built to help groups share local worlds with safer host handoff, backups, lock control and guided setup." }
                "about_author" { return "Created by Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Unofficial community utility. Not affiliated with Jagex." }
                "about_close" { return "Close" }
                "msg_settings_saved" { return "Settings saved. Reopen the app to apply all texts." }
                "status_locked" { return "LOCKED" }
                "status_free" { return "FREE" }
                "status_open" { return "OPEN" }
                "status_closed" { return "CLOSED" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NOT FOUND" }
                default { return $Key }
            }
        }
        default {
            switch ($Key) {
                "window_title" { return "Dragonwilds WorldSync" }
                "top_subtitle" { return "Compartilhamento de mundo, handoff seguro, backups e sincronizacao" }
                "settings" { return "Configuracoes" }
                "quick_status" { return "Resumo rapido" }
                "card_world" { return "Mundo" }
                "card_world_status" { return "Status do mundo" }
                "card_game_status" { return "Status do jogo" }
                "card_save" { return "Save oficial" }
                "group_actions" { return "Acoes" }
                "your_name" { return "Seu nome:" }
                "wizard" { return "Assistente Inicial" }
                "refresh" { return "Atualizar Status" }
                "host" { return "Hostear Mundo" }
                "end_host" { return "Encerrar Host" }
                "open_shared" { return "Abrir Pasta Compartilhada" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Detalhes" }
                "mode" { return "Modo:" }
                "current_host" { return "Host atual:" }
                "current_machine" { return "Maquina atual:" }
                "host_started" { return "Inicio da host:" }
                "updated_by" { return "Ultima atualizacao por:" }
                "updated_at" { return "Ultima atualizacao em:" }
                "synced_folder" { return "Pasta sincronizada:" }
                "local_saves_folder" { return "Pasta local dos saves" }
                "session_log" { return "Log da sessao" }
                "admin" { return "ADMIN" }
                "user" { return "USUARIO" }
                "wizard_title" { return "Assistente Inicial" }
                "wizard_subtitle" { return "Escolha se vai criar um compartilhamento novo ou entrar em um existente." }
                "create_shared_world" { return "Criar mundo compartilhado" }
                "join_shared_world" { return "Entrar em mundo compartilhado existente" }
                "paths" { return "Caminhos" }
                "browse" { return "Procurar..." }
                "detect_default" { return "Detectar padrao" }
                "create_share_group" { return "Criar compartilhamento" }
                "load_local_worlds" { return "Carregar mundos locais" }
                "initialize_share" { return "Inicializar compartilhamento" }
                "join_share_group" { return "Entrar em compartilhamento existente" }
                "join_info" { return "Selecione a pasta sincronizada e carregue os dados do compartilhamento." }
                "read_share" { return "Ler compartilhamento" }
                "save_and_use" { return "Salvar e usar este compartilhamento" }
                "close" { return "Fechar" }
                "config_title" { return "Configuracoes" }
                "date_format" { return "Formato de data:" }
                "auto_refresh" { return "Auto refresh (seg):" }
                "window_title_label" { return "Titulo da janela:" }
                "language" { return "Idioma:" }
                "save" { return "Salvar" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "About" }
                "about_title" { return "About Dragonwilds WorldSync" }
                "about_tagline" { return "Public release candidate for local world handoff." }
                "about_description" { return "Built to help groups share local worlds with safer host handoff, backups, lock control and guided setup." }
                "about_author" { return "Created by Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Unofficial community utility. Not affiliated with Jagex." }
                "about_close" { return "Close" }
                "msg_settings_saved" { return "Configuracoes salvas. Reabra o app para aplicar todos os textos." }
                "status_locked" { return "BLOQUEADO" }
                "status_free" { return "LIVRE" }
                "status_open" { return "ABERTO" }
                "status_closed" { return "FECHADO" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NAO ENCONTRADO" }
                default { return $Key }
            }
        }
    }
}

        Refresh-Paths

        [System.Windows.Forms.MessageBox]::Show((T "msg_share_created"),(T "title_share_created"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        $setupForm.Close()
    })

    $btnLoadMeta.Add_Click({
        $shared = Resolve-PathTemplate($txtShared.Text)
        if ([string]::IsNullOrWhiteSpace($shared) -or -not (Test-Path $shared)) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_select_valid_synced"),(T "title_invalid_folder"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            return
        }
        $meta = Get-WorldMeta $shared
        if (-not $meta) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_invalid_share"),(T "title_invalid_share"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            return
        }
        $setupState.JoinMeta = $meta
        $btnSaveJoin.Enabled = $true
        $txtJoinResult.Text = "Mundo: $($meta.worldName)`r`nArquivo: $($meta.fileName)`r`nCriado em: $(Format-DisplayDate $meta.createdAtUtc)`r`nInicializado por: $($meta.initializedBy)"
    })

    $btnSaveJoin.Add_Click({
        $shared = Resolve-PathTemplate($txtShared.Text)
        $local = Resolve-PathTemplate($txtLocal.Text)
        if (-not $setupState.JoinMeta) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_load_share_first"),(T "title_missing_data"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            return
        }
        if ([string]::IsNullOrWhiteSpace($local) -or -not (Test-Path $local)) {
            [System.Windows.Forms.MessageBox]::Show((T "msg_invalid_local_folder"),(T "title_invalid_folder"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            return
        }

        $cfg = Get-DefaultUserConfig
        $cfg.SharedRoot = $shared
        $cfg.LocalSaveFolder = $local
        $cfg.WorldName = [string]$setupState.JoinMeta.worldName
        $cfg.WorldFileName = [string]$setupState.JoinMeta.fileName
        $cfg.IsAdmin = $false
        Save-UserConfig $cfg
        $Script:UserConfig = Load-UserConfig

function Get-Language {
    $lang = [string]$Script:UserConfig.Language
    if ([string]::IsNullOrWhiteSpace($lang)) { return "pt-BR" }
    return $lang
}

function T {
    param([string]$Key)
    $lang = Get-Language
    switch ($lang) {
        "en" {
            switch ($Key) {
                "window_title" { return "Dragonwilds WorldSync" }
                "top_subtitle" { return "Community world sharing, safe host handoff, backups and sync" }
                "settings" { return "Settings" }
                "quick_status" { return "Quick status" }
                "card_world" { return "World" }
                "card_world_status" { return "World status" }
                "card_game_status" { return "Game status" }
                "card_save" { return "Official save" }
                "group_actions" { return "Actions" }
                "your_name" { return "Your name:" }
                "wizard" { return "Setup Wizard" }
                "refresh" { return "Refresh Status" }
                "host" { return "Host World" }
                "end_host" { return "End Host" }
                "open_shared" { return "Open Synced Folder" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Details" }
                "mode" { return "Mode:" }
                "current_host" { return "Current host:" }
                "current_machine" { return "Current machine:" }
                "host_started" { return "Host started:" }
                "updated_by" { return "Last updated by:" }
                "updated_at" { return "Last updated at:" }
                "synced_folder" { return "Synced folder:" }
                "local_saves_folder" { return "Local saves folder" }
                "session_log" { return "Session log" }
                "admin" { return "ADMIN" }
                "user" { return "USER" }
                "wizard_title" { return "Initial Setup Wizard" }
                "wizard_subtitle" { return "Choose whether you want to create a new shared world or join an existing one." }
                "create_shared_world" { return "Create shared world" }
                "join_shared_world" { return "Join existing shared world" }
                "paths" { return "Paths" }
                "browse" { return "Browse..." }
                "detect_default" { return "Detect default" }
                "create_share_group" { return "Create shared world" }
                "load_local_worlds" { return "Load local worlds" }
                "initialize_share" { return "Initialize share" }
                "join_share_group" { return "Join existing share" }
                "join_info" { return "Select the synced folder and load the shared world data." }
                "read_share" { return "Read share" }
                "save_and_use" { return "Save and use this share" }
                "close" { return "Close" }
                "config_title" { return "Settings" }
                "date_format" { return "Date format:" }
                "auto_refresh" { return "Auto refresh (sec):" }
                "window_title_label" { return "Window title:" }
                "language" { return "Language:" }
                "save" { return "Save" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "About" }
                "about_title" { return "About Dragonwilds WorldSync" }
                "about_tagline" { return "Public release candidate for local world handoff." }
                "about_description" { return "Built to help groups share local worlds with safer host handoff, backups, lock control and guided setup." }
                "about_author" { return "Created by Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Unofficial community utility. Not affiliated with Jagex." }
                "about_close" { return "Close" }
                "msg_settings_saved" { return "Settings saved. Reopen the app to apply all texts." }
                "status_locked" { return "LOCKED" }
                "status_free" { return "FREE" }
                "status_open" { return "OPEN" }
                "status_closed" { return "CLOSED" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NOT FOUND" }
                default { return $Key }
            }
        }
        default {
            switch ($Key) {
                "window_title" { return "Dragonwilds WorldSync" }
                "top_subtitle" { return "Compartilhamento de mundo, handoff seguro, backups e sincronizacao" }
                "settings" { return "Configuracoes" }
                "quick_status" { return "Resumo rapido" }
                "card_world" { return "Mundo" }
                "card_world_status" { return "Status do mundo" }
                "card_game_status" { return "Status do jogo" }
                "card_save" { return "Save oficial" }
                "group_actions" { return "Acoes" }
                "your_name" { return "Seu nome:" }
                "wizard" { return "Assistente Inicial" }
                "refresh" { return "Atualizar Status" }
                "host" { return "Hostear Mundo" }
                "end_host" { return "Encerrar Host" }
                "open_shared" { return "Abrir Pasta Compartilhada" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Detalhes" }
                "mode" { return "Modo:" }
                "current_host" { return "Host atual:" }
                "current_machine" { return "Maquina atual:" }
                "host_started" { return "Inicio da host:" }
                "updated_by" { return "Ultima atualizacao por:" }
                "updated_at" { return "Ultima atualizacao em:" }
                "synced_folder" { return "Pasta sincronizada:" }
                "local_saves_folder" { return "Pasta local dos saves" }
                "session_log" { return "Log da sessao" }
                "admin" { return "ADMIN" }
                "user" { return "USUARIO" }
                "wizard_title" { return "Assistente Inicial" }
                "wizard_subtitle" { return "Escolha se vai criar um compartilhamento novo ou entrar em um existente." }
                "create_shared_world" { return "Criar mundo compartilhado" }
                "join_shared_world" { return "Entrar em mundo compartilhado existente" }
                "paths" { return "Caminhos" }
                "browse" { return "Procurar..." }
                "detect_default" { return "Detectar padrao" }
                "create_share_group" { return "Criar compartilhamento" }
                "load_local_worlds" { return "Carregar mundos locais" }
                "initialize_share" { return "Inicializar compartilhamento" }
                "join_share_group" { return "Entrar em compartilhamento existente" }
                "join_info" { return "Selecione a pasta sincronizada e carregue os dados do compartilhamento." }
                "read_share" { return "Ler compartilhamento" }
                "save_and_use" { return "Salvar e usar este compartilhamento" }
                "close" { return "Fechar" }
                "config_title" { return "Configuracoes" }
                "date_format" { return "Formato de data:" }
                "auto_refresh" { return "Auto refresh (seg):" }
                "window_title_label" { return "Titulo da janela:" }
                "language" { return "Idioma:" }
                "save" { return "Salvar" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "About" }
                "about_title" { return "About Dragonwilds WorldSync" }
                "about_tagline" { return "Public release candidate for local world handoff." }
                "about_description" { return "Built to help groups share local worlds with safer host handoff, backups, lock control and guided setup." }
                "about_author" { return "Created by Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Unofficial community utility. Not affiliated with Jagex." }
                "about_close" { return "Close" }
                "msg_settings_saved" { return "Configuracoes salvas. Reabra o app para aplicar todos os textos." }
                "status_locked" { return "BLOQUEADO" }
                "status_free" { return "LIVRE" }
                "status_open" { return "ABERTO" }
                "status_closed" { return "FECHADO" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NAO ENCONTRADO" }
                default { return $Key }
            }
        }
    }
}

        Refresh-Paths

        [System.Windows.Forms.MessageBox]::Show((T "msg_share_config_saved"),(T "title_config_saved"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        $setupForm.Close()
    })

    [void]$setupForm.ShowDialog($form)
    Refresh-Status
    Write-UiLog "Assistente inicial finalizado."
}

function Open-SettingsEditor {
    $cfgForm = New-Object System.Windows.Forms.Form
    $cfgForm.Text = (T "config_title")
    $cfgForm.Size = New-Object System.Drawing.Size(700, 420)
    $cfgForm.StartPosition = "CenterParent"

    $lbl1 = New-Object System.Windows.Forms.Label; $lbl1.Text = (T "date_format"); $lbl1.Location = New-Object System.Drawing.Point(20, 24); $lbl1.AutoSize = $true; $cfgForm.Controls.Add($lbl1)
    $txtDate = New-Object System.Windows.Forms.TextBox; $txtDate.Location = New-Object System.Drawing.Point(150, 20); $txtDate.Size = New-Object System.Drawing.Size(220, 23); $txtDate.Text = [string]$Script:UserConfig.FriendlyDateFormat; $cfgForm.Controls.Add($txtDate)
    $lbl2 = New-Object System.Windows.Forms.Label; $lbl2.Text = (T "auto_refresh"); $lbl2.Location = New-Object System.Drawing.Point(20, 64); $lbl2.AutoSize = $true; $cfgForm.Controls.Add($lbl2)
    $txtAuto = New-Object System.Windows.Forms.TextBox; $txtAuto.Location = New-Object System.Drawing.Point(150, 60); $txtAuto.Size = New-Object System.Drawing.Size(100, 23); $txtAuto.Text = [string]$Script:UserConfig.AutoRefreshSeconds; $cfgForm.Controls.Add($txtAuto)
    $lbl3 = New-Object System.Windows.Forms.Label; $lbl3.Text = (T "window_title_label"); $lbl3.Location = New-Object System.Drawing.Point(20, 104); $lbl3.AutoSize = $true; $cfgForm.Controls.Add($lbl3)
    $txtTitle = New-Object System.Windows.Forms.TextBox; $txtTitle.Location = New-Object System.Drawing.Point(150, 100); $txtTitle.Size = New-Object System.Drawing.Size(300, 23); $txtTitle.Text = [string]$Script:UserConfig.WindowTitle; $cfgForm.Controls.Add($txtTitle)

    $lblLang = New-Object System.Windows.Forms.Label; $lblLang.Text = (T "language"); $lblLang.Location = New-Object System.Drawing.Point(20, 144); $lblLang.AutoSize = $true; $cfgForm.Controls.Add($lblLang)
    $cmbLang = New-Object System.Windows.Forms.ComboBox; $cmbLang.Location = New-Object System.Drawing.Point(150, 140); $cmbLang.Size = New-Object System.Drawing.Size(160, 24); $cmbLang.DropDownStyle = "DropDownList"; [void]$cmbLang.Items.Add("PT-BR"); [void]$cmbLang.Items.Add("English"); if ((Get-Language) -eq "en") { $cmbLang.SelectedIndex = 1 } else { $cmbLang.SelectedIndex = 0 }; $cfgForm.Controls.Add($cmbLang)

    $btnSave = New-Object System.Windows.Forms.Button
    $btnSave.Text = (T "save")
    $btnSave.Location = New-Object System.Drawing.Point(20, 196)
    $btnSave.Size = New-Object System.Drawing.Size(120, 32)
    $btnSave.Add_Click({
        $fmt = $txtDate.Text.Trim(); if ([string]::IsNullOrWhiteSpace($fmt)) { $fmt = "dd/MM/yyyy HH:mm:ss" }
        $auto = 15
        if ($txtAuto.Text.Trim() -match '^\d+$') {
            $auto = [int]$txtAuto.Text.Trim()
            if ($auto -lt 5) { $auto = 5 }
            if ($auto -gt 3600) { $auto = 3600 }
        }
        $title = $txtTitle.Text.Trim(); if ([string]::IsNullOrWhiteSpace($title)) { $title = "Dragonwilds WorldSync" }
        $Script:UserConfig.FriendlyDateFormat = $fmt
        $Script:UserConfig.AutoRefreshSeconds = $auto
        $Script:UserConfig.WindowTitle = $title
        Save-UserConfig $Script:UserConfig
        $Script:UserConfig = Load-UserConfig

function Get-Language {
    $lang = [string]$Script:UserConfig.Language
    if ([string]::IsNullOrWhiteSpace($lang)) { return "pt-BR" }
    return $lang
}

function T {
    param([string]$Key)
    $lang = Get-Language
    switch ($lang) {
        "en" {
            switch ($Key) {
                "window_title" { return "Dragonwilds WorldSync" }
                "top_subtitle" { return "Community world sharing, safe host handoff, backups and sync" }
                "settings" { return "Settings" }
                "quick_status" { return "Quick status" }
                "card_world" { return "World" }
                "card_world_status" { return "World status" }
                "card_game_status" { return "Game status" }
                "card_save" { return "Official save" }
                "group_actions" { return "Actions" }
                "your_name" { return "Your name:" }
                "wizard" { return "Setup Wizard" }
                "refresh" { return "Refresh Status" }
                "host" { return "Host World" }
                "end_host" { return "End Host" }
                "open_shared" { return "Open Synced Folder" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Details" }
                "mode" { return "Mode:" }
                "current_host" { return "Current host:" }
                "current_machine" { return "Current machine:" }
                "host_started" { return "Host started:" }
                "updated_by" { return "Last updated by:" }
                "updated_at" { return "Last updated at:" }
                "synced_folder" { return "Synced folder:" }
                "local_saves_folder" { return "Local saves folder" }
                "session_log" { return "Session log" }
                "admin" { return "ADMIN" }
                "user" { return "USER" }
                "wizard_title" { return "Initial Setup Wizard" }
                "wizard_subtitle" { return "Choose whether you want to create a new shared world or join an existing one." }
                "create_shared_world" { return "Create shared world" }
                "join_shared_world" { return "Join existing shared world" }
                "paths" { return "Paths" }
                "browse" { return "Browse..." }
                "detect_default" { return "Detect default" }
                "create_share_group" { return "Create shared world" }
                "load_local_worlds" { return "Load local worlds" }
                "initialize_share" { return "Initialize share" }
                "join_share_group" { return "Join existing share" }
                "join_info" { return "Select the synced folder and load the shared world data." }
                "read_share" { return "Read share" }
                "save_and_use" { return "Save and use this share" }
                "close" { return "Close" }
                "config_title" { return "Settings" }
                "date_format" { return "Date format:" }
                "auto_refresh" { return "Auto refresh (sec):" }
                "window_title_label" { return "Window title:" }
                "language" { return "Language:" }
                "save" { return "Save" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "About" }
                "about_title" { return "About Dragonwilds WorldSync" }
                "about_tagline" { return "Public release candidate for local world handoff." }
                "about_description" { return "Built to help groups share local worlds with safer host handoff, backups, lock control and guided setup." }
                "about_author" { return "Created by Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Unofficial community utility. Not affiliated with Jagex." }
                "about_close" { return "Close" }
                "msg_settings_saved" { return "Settings saved. Reopen the app to apply all texts." }
                "status_locked" { return "LOCKED" }
                "status_free" { return "FREE" }
                "status_open" { return "OPEN" }
                "status_closed" { return "CLOSED" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NOT FOUND" }
                default { return $Key }
            }
        }
        default {
            switch ($Key) {
                "window_title" { return "Dragonwilds WorldSync" }
                "top_subtitle" { return "Compartilhamento de mundo, handoff seguro, backups e sincronizacao" }
                "settings" { return "Configuracoes" }
                "quick_status" { return "Resumo rapido" }
                "card_world" { return "Mundo" }
                "card_world_status" { return "Status do mundo" }
                "card_game_status" { return "Status do jogo" }
                "card_save" { return "Save oficial" }
                "group_actions" { return "Acoes" }
                "your_name" { return "Seu nome:" }
                "wizard" { return "Assistente Inicial" }
                "refresh" { return "Atualizar Status" }
                "host" { return "Hostear Mundo" }
                "end_host" { return "Encerrar Host" }
                "open_shared" { return "Abrir Pasta Compartilhada" }
                "force_unlock" { return "Force Unlock" }
                "group_details" { return "Detalhes" }
                "mode" { return "Modo:" }
                "current_host" { return "Host atual:" }
                "current_machine" { return "Maquina atual:" }
                "host_started" { return "Inicio da host:" }
                "updated_by" { return "Ultima atualizacao por:" }
                "updated_at" { return "Ultima atualizacao em:" }
                "synced_folder" { return "Pasta sincronizada:" }
                "local_saves_folder" { return "Pasta local dos saves" }
                "session_log" { return "Log da sessao" }
                "admin" { return "ADMIN" }
                "user" { return "USUARIO" }
                "wizard_title" { return "Assistente Inicial" }
                "wizard_subtitle" { return "Escolha se vai criar um compartilhamento novo ou entrar em um existente." }
                "create_shared_world" { return "Criar mundo compartilhado" }
                "join_shared_world" { return "Entrar em mundo compartilhado existente" }
                "paths" { return "Caminhos" }
                "browse" { return "Procurar..." }
                "detect_default" { return "Detectar padrao" }
                "create_share_group" { return "Criar compartilhamento" }
                "load_local_worlds" { return "Carregar mundos locais" }
                "initialize_share" { return "Inicializar compartilhamento" }
                "join_share_group" { return "Entrar em compartilhamento existente" }
                "join_info" { return "Selecione a pasta sincronizada e carregue os dados do compartilhamento." }
                "read_share" { return "Ler compartilhamento" }
                "save_and_use" { return "Salvar e usar este compartilhamento" }
                "close" { return "Fechar" }
                "config_title" { return "Configuracoes" }
                "date_format" { return "Formato de data:" }
                "auto_refresh" { return "Auto refresh (seg):" }
                "window_title_label" { return "Titulo da janela:" }
                "language" { return "Idioma:" }
                "save" { return "Salvar" }
                "about_credit" { return "Dragonwilds WorldSync v1.4.2 | Created by Will" }
                "about" { return "About" }
                "about_title" { return "About Dragonwilds WorldSync" }
                "about_tagline" { return "Public release candidate for local world handoff." }
                "about_description" { return "Built to help groups share local worlds with safer host handoff, backups, lock control and guided setup." }
                "about_author" { return "Created by Will" }
                "about_brand" { return "Will Tools" }
                "about_nonofficial" { return "Unofficial community utility. Not affiliated with Jagex." }
                "about_close" { return "Close" }
                "msg_settings_saved" { return "Configuracoes salvas. Reabra o app para aplicar todos os textos." }
                "status_locked" { return "BLOQUEADO" }
                "status_free" { return "LIVRE" }
                "status_open" { return "ABERTO" }
                "status_closed" { return "FECHADO" }
                "status_ok" { return "OK" }
                "status_not_found" { return "NAO ENCONTRADO" }
                default { return $Key }
            }
        }
    }
}

        if ($Script:AutoRefreshTimer) { $Script:AutoRefreshTimer.Interval = ([int]$Script:UserConfig.AutoRefreshSeconds) * 1000 }
        $form.Text = $Script:UserConfig.WindowTitle
        $lblTitle.Text = $Script:UserConfig.WindowTitle
        Refresh-Status
        [System.Windows.Forms.MessageBox]::Show((T "msg_settings_saved_local"),(T "config_title"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        $cfgForm.Close()
    })
    $cfgForm.Controls.Add($btnSave)
    [void]$cfgForm.ShowDialog($form)
}


function Open-AboutDialog {
    $aboutForm = New-Object System.Windows.Forms.Form
    $aboutForm.Text = (T "about_title")
    $aboutForm.Size = New-Object System.Drawing.Size(560, 380)
    $aboutForm.StartPosition = "CenterParent"
    $aboutForm.BackColor = [System.Drawing.Color]::FromArgb(18,18,18)

    $title = New-Object System.Windows.Forms.Label
    $title.Text = (T "window_title")
    $title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $title.ForeColor = $colorTextOnDark
    $title.AutoSize = $true
    $title.Location = New-Object System.Drawing.Point(24, 22)
    $aboutForm.Controls.Add($title)

    $tag = New-Object System.Windows.Forms.Label
    $tag.Text = (T "about_tagline")
    $tag.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $tag.ForeColor = $colorGold
    $tag.AutoSize = $true
    $tag.Location = New-Object System.Drawing.Point(26, 56)
    $aboutForm.Controls.Add($tag)

    $desc = New-Object System.Windows.Forms.Label
    $desc.Text = (T "about_description")
    $desc.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $desc.ForeColor = $colorTextOnDark
    $desc.MaximumSize = New-Object System.Drawing.Size(500, 0)
    $desc.AutoSize = $true
    $desc.Location = New-Object System.Drawing.Point(26, 100)
    $aboutForm.Controls.Add($desc)

    $meta = New-Object System.Windows.Forms.Label
    $meta.Text = ((T "about_author") + " | " + (T "about_brand") + " | v" + $Script:ToolVersion)
    $meta.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $meta.ForeColor = $colorTextOnDark
    $meta.AutoSize = $true
    $meta.Location = New-Object System.Drawing.Point(26, 192)
    $aboutForm.Controls.Add($meta)

    $note = New-Object System.Windows.Forms.Label
    $note.Text = (T "about_nonofficial")
    $note.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $note.ForeColor = [System.Drawing.Color]::FromArgb(190,190,190)
    $note.MaximumSize = New-Object System.Drawing.Size(500, 0)
    $note.AutoSize = $true
    $note.Location = New-Object System.Drawing.Point(26, 214)
    $aboutForm.Controls.Add($note)

    $btnCloseAbout = New-Object System.Windows.Forms.Button
    $btnCloseAbout.Text = (T "about_close")
    $btnCloseAbout.Size = New-Object System.Drawing.Size(110, 34)
    $btnCloseAbout.Location = New-Object System.Drawing.Point(410, 270)
    $btnCloseAbout.Add_Click({ $aboutForm.Close() })
    Set-PrimaryButtonStyle $btnCloseAbout "primary"
    $aboutForm.Controls.Add($btnCloseAbout)

    [void]$aboutForm.ShowDialog($form)
}


# MAIN UI
$form = New-Object System.Windows.Forms.Form
if (Test-Path $Script:WindowIconPath) {
    try { $form.Icon = New-Object System.Drawing.Icon($Script:WindowIconPath) } catch {}
}
$form.Text = (T "window_title")
$form.Size = New-Object System.Drawing.Size(920, 720)
$form.StartPosition = "CenterScreen"
$form.MinimumSize = New-Object System.Drawing.Size(920, 720)
$form.BackColor = [System.Drawing.Color]::FromArgb(19,19,19)

$fontLabel = New-Object System.Drawing.Font("Segoe UI", 9)
$fontValue = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$fontTitle = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$fontButton = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$fontChip = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font("Segoe UI", 8)
$fontCardValue = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$colorButtonAccent = [System.Drawing.ColorTranslator]::FromHtml([string]$Script:UserConfig.AccentColor)
$colorHeaderAccent = [System.Drawing.ColorTranslator]::FromHtml($Script:HeaderAccentHex)
$colorTextOnDark = [System.Drawing.Color]::FromArgb(239,234,220)
$colorDarkPanel = [System.Drawing.Color]::FromArgb(24,24,24)
$colorDarkPanel2 = [System.Drawing.Color]::FromArgb(28,28,28)
$colorDarkPanel3 = [System.Drawing.Color]::FromArgb(34,34,34)


function Set-ControlTreeForeColor {
    param([System.Windows.Forms.Control]$Root,[System.Drawing.Color]$Color)
    foreach ($ctrl in $Root.Controls) {
        if ($ctrl -is [System.Windows.Forms.Label] -or $ctrl -is [System.Windows.Forms.GroupBox]) {
            $ctrl.ForeColor = $Color
        }
    }
}

function Set-PrimaryButtonStyle {
    param([System.Windows.Forms.Button]$Button, [string]$Mode = "neutral")
    $Button.FlatStyle = "Flat"
    $Button.FlatAppearance.BorderSize = 1
    $Button.FlatAppearance.BorderColor = $colorButtonAccent
    switch ($Mode) {
        "primary" {
            $Button.BackColor = $colorButtonAccent
            $Button.ForeColor = [System.Drawing.Color]::FromArgb(16,16,16)
        }
        "warning" {
            $Button.BackColor = [System.Drawing.Color]::FromArgb(70,56,24)
            $Button.ForeColor = $colorTextOnDark
        }
        "danger" {
            $Button.BackColor = [System.Drawing.Color]::FromArgb(74,28,28)
            $Button.ForeColor = $colorTextOnDark
        }
        default {
            $Button.BackColor = $colorDarkPanel3
            $Button.ForeColor = $colorTextOnDark
        }
    }
}

$panelTop = New-Object System.Windows.Forms.Panel
$panelTop.Dock = "Top"
$panelTop.Height = 104
$panelTop.BackColor = [System.Drawing.Color]::FromArgb(14,14,14)
$form.Controls.Add($panelTop)

$topDivider = New-Object System.Windows.Forms.Panel
$topDivider.Dock = "Bottom"
$topDivider.Height = 1
$topDivider.BackColor = $colorHeaderAccent
$panelTop.Controls.Add($topDivider)

$picBanner = New-Object System.Windows.Forms.PictureBox
$picBanner.Location = New-Object System.Drawing.Point(12, 5)
$picBanner.Size = New-Object System.Drawing.Size(548, 94)
$picBanner.BackColor = [System.Drawing.Color]::Transparent
$picBanner.SizeMode = "Zoom"
if (Test-Path $Script:HeaderBannerFile) {
    try {
        $picBanner.Image = [System.Drawing.Image]::FromFile($Script:HeaderBannerFile)
    } catch {}
}
$panelTop.Controls.Add($picBanner)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = (T "window_title")
$lblTitle.Font = $fontTitle
$lblTitle.ForeColor = $colorTextOnDark
$lblTitle.AutoSize = $true
$lblTitle.Location = New-Object System.Drawing.Point(20, 14)
$lblTitle.Visible = -not (Test-Path $Script:HeaderBannerFile)
$panelTop.Controls.Add($lblTitle)

$lblSubtitle = New-Object System.Windows.Forms.Label
$lblSubtitle.Text = (T "top_subtitle")
$lblSubtitle.Font = $fontLabel
$lblSubtitle.ForeColor = $colorTextOnDark
$lblSubtitle.AutoSize = $true
$lblSubtitle.Location = New-Object System.Drawing.Point(22, 46)
$lblSubtitle.Visible = -not (Test-Path $Script:HeaderBannerFile)
$panelTop.Controls.Add($lblSubtitle)

$btnAbout = New-Object System.Windows.Forms.Button
$btnAbout.Text = (T "about")
$btnAbout.Font = $fontButton
$btnAbout.Size = New-Object System.Drawing.Size(96, 30)

$btnSettings = New-Object System.Windows.Forms.Button
$btnSettings.Text = (T "settings")
$btnSettings.Font = $fontButton
$btnSettings.Size = New-Object System.Drawing.Size(146, 30)
$lblLangTop = New-Object System.Windows.Forms.Label
$lblLangTop.Text = (T "language")
$lblLangTop.Font = $fontLabel
$lblLangTop.ForeColor = $colorTextOnDark
$lblLangTop.AutoSize = $true
$lblLangTop.Location = New-Object System.Drawing.Point(572, 18)
$panelTop.Controls.Add($lblLangTop)

$cmbLanguageTop = New-Object System.Windows.Forms.ComboBox
$cmbLanguageTop.DropDownStyle = "DropDownList"
$cmbLanguageTop.Size = New-Object System.Drawing.Size(110, 24)
$cmbLanguageTop.Location = New-Object System.Drawing.Point(640, 14)
$cmbLanguageTop.BackColor = [System.Drawing.Color]::FromArgb(34,34,34)
$cmbLanguageTop.ForeColor = $colorTextOnDark
[void]$cmbLanguageTop.Items.Add("PT-BR")
[void]$cmbLanguageTop.Items.Add("English")
if ((Get-Language) -eq "en") { $cmbLanguageTop.SelectedIndex = 1 } else { $cmbLanguageTop.SelectedIndex = 0 }
$cmbLanguageTop.Add_SelectedIndexChanged({
    if ($cmbLanguageTop.SelectedIndex -eq 1) { $Script:UserConfig.Language = "en" } else { $Script:UserConfig.Language = "pt-BR" }
    Save-UserConfig $Script:UserConfig
    Apply-MainLanguage
    Refresh-Status
    [System.Windows.Forms.MessageBox]::Show((T "msg_settings_saved"),(T "config_title"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
})
$panelTop.Controls.Add($cmbLanguageTop)

$btnAbout.Size = New-Object System.Drawing.Size(86, 30)
$btnAbout.Location = New-Object System.Drawing.Point(640, 54)
$btnAbout.Add_Click({ Open-AboutDialog })
Set-PrimaryButtonStyle $btnAbout
$panelTop.Controls.Add($btnAbout)

$btnSettings.Size = New-Object System.Drawing.Size(146, 30)
$btnSettings.Location = New-Object System.Drawing.Point(738, 54)
$btnSettings.Add_Click({ Open-SettingsEditor })
Set-PrimaryButtonStyle $btnSettings
$panelTop.Controls.Add($btnSettings)


function New-Card {
    param(
        [string]$Title,
        [int]$X,
        [int]$Y,
        [int]$W=206,
        [int]$H=104
    )

    $panel = New-Object System.Windows.Forms.Panel
    $panel.Location = New-Object System.Drawing.Point($X,$Y)
    $panel.Size = New-Object System.Drawing.Size($W,$H)
    $panel.BackColor = $colorDarkPanel2
    $panel.BorderStyle = "FixedSingle"

    $topLine = New-Object System.Windows.Forms.Panel
    $topLine.Location = New-Object System.Drawing.Point(0,0)
    $topLine.Size = New-Object System.Drawing.Size($W,4)
    $topLine.BackColor = $colorHeaderAccent
    $panel.Controls.Add($topLine)

    $dot = New-Object System.Windows.Forms.Panel
    $dot.Location = New-Object System.Drawing.Point(14,16)
    $dot.Size = New-Object System.Drawing.Size(10,10)
    $dot.BackColor = $colorHeaderAccent
    $panel.Controls.Add($dot)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Title
    $label.Font = $fontLabel
    $label.ForeColor = [System.Drawing.Color]::FromArgb(205,197,180)
    $label.AutoSize = $true
    $label.Location = New-Object System.Drawing.Point(32,10)
    $panel.Controls.Add($label)

    $value = New-Object System.Windows.Forms.Label
    $value.Text = "-"
    $value.Font = $fontCardValue
    $value.ForeColor = $colorTextOnDark
    $value.AutoSize = $true
    $value.Location = New-Object System.Drawing.Point(14,48)
    $panel.Controls.Add($value)

    return @($panel,$label,$value)
}

$mainContainer = New-Object System.Windows.Forms.Panel
$mainContainer.Location = New-Object System.Drawing.Point(0, 120)
$mainContainer.Size = New-Object System.Drawing.Size(904, 560)
$mainContainer.Anchor = "Top,Bottom,Left,Right"
$mainContainer.AutoScroll = $true
$mainContainer.BackColor = [System.Drawing.Color]::FromArgb(19,19,19)
$form.Controls.Add($mainContainer)

$lblCardsHint = New-Object System.Windows.Forms.Label
$lblCardsHint.Text = (T "quick_status")
$lblCardsHint.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$lblCardsHint.ForeColor = [System.Drawing.Color]::FromArgb(45,45,45)
$lblCardsHint.AutoSize = $true
$lblCardsHint.Location = New-Object System.Drawing.Point(20, 14)
$mainContainer.Controls.Add($lblCardsHint)
$lblCardsHint.Visible = $false

$card1 = New-Card (T "card_world") 18 30
$mainContainer.Controls.Add($card1[0]); $lblCardWorldTitle = $card1[1]; $lblWorldValue = $card1[2]

$card2 = New-Card (T "card_world_status") 236 30
$mainContainer.Controls.Add($card2[0]); $lblCardWorldStatusTitle = $card2[1]; $lblWorldStatusBadge = $card2[2]; $lblWorldStatusBadge.Font = $fontChip

$card3 = New-Card (T "card_game_status") 454 30
$mainContainer.Controls.Add($card3[0]); $lblCardGameStatusTitle = $card3[1]; $lblGameBadge = $card3[2]; $lblGameBadge.Font = $fontChip

$card4 = New-Card (T "card_save") 672 30
$mainContainer.Controls.Add($card4[0]); $lblCardSaveTitle = $card4[1]; $lblSaveBadge = $card4[2]; $lblSaveBadge.Font = $fontChip

$groupAction = New-Object System.Windows.Forms.GroupBox
$groupAction.Text = (T "group_actions")
$groupAction.Font = $fontLabel
$groupAction.ForeColor = $colorTextOnDark
$groupAction.BackColor = $colorDarkPanel
$groupAction.Location = New-Object System.Drawing.Point(18, 156)
$groupAction.Size = New-Object System.Drawing.Size(860, 126)
$mainContainer.Controls.Add($groupAction)

$lblHostName = New-Object System.Windows.Forms.Label
$lblHostName.Text = (T "your_name")
$lblHostName.Font = $fontLabel
$lblHostName.AutoSize = $true
$lblHostName.Location = New-Object System.Drawing.Point(16, 32)
$groupAction.Controls.Add($lblHostName)

$txtHostName = New-Object System.Windows.Forms.TextBox
$txtHostName.Location = New-Object System.Drawing.Point(85, 29)
$txtHostName.Size = New-Object System.Drawing.Size(190, 24)
$txtHostName.BackColor = [System.Drawing.Color]::FromArgb(28,28,28)
$txtHostName.ForeColor = $colorTextOnDark
$groupAction.Controls.Add($txtHostName)

$btnWizard = New-Object System.Windows.Forms.Button
$btnWizard.Text = (T "wizard")
$btnWizard.Font = $fontButton
$btnWizard.Size = New-Object System.Drawing.Size(136, 36)
$btnWizard.Location = New-Object System.Drawing.Point(16, 74)
$btnWizard.Add_Click({ Open-SetupWizard })
Set-PrimaryButtonStyle $btnWizard
$groupAction.Controls.Add($btnWizard)

$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text = (T "refresh")
$btnRefresh.Font = $fontButton
$btnRefresh.Size = New-Object System.Drawing.Size(136, 36)
$btnRefresh.Location = New-Object System.Drawing.Point(164, 74)
$btnRefresh.Add_Click({ Refresh-Status; Write-UiLog "Status atualizado." })
Set-PrimaryButtonStyle $btnRefresh
$groupAction.Controls.Add($btnRefresh)

$btnHost = New-Object System.Windows.Forms.Button
$btnHost.Text = (T "host")
$btnHost.Font = $fontButton
$btnHost.Size = New-Object System.Drawing.Size(150, 36)
$btnHost.Location = New-Object System.Drawing.Point(312, 74)
$btnHost.Add_Click({ Start-Hosting })
Set-PrimaryButtonStyle $btnHost
$groupAction.Controls.Add($btnHost)

$btnEnd = New-Object System.Windows.Forms.Button
$btnEnd.Text = (T "end_host")
$btnEnd.Font = $fontButton
$btnEnd.Size = New-Object System.Drawing.Size(150, 36)
$btnEnd.Location = New-Object System.Drawing.Point(474, 74)
$btnEnd.Add_Click({ Stop-Hosting })
Set-PrimaryButtonStyle $btnEnd
$groupAction.Controls.Add($btnEnd)

$btnOpenShared = New-Object System.Windows.Forms.Button
$btnOpenShared.Text = (T "open_shared")
$btnOpenShared.Font = $fontButton
$btnOpenShared.Size = New-Object System.Drawing.Size(190, 36)
$btnOpenShared.Location = New-Object System.Drawing.Point(636, 74)
$btnOpenShared.Add_Click({
    Refresh-Paths
    if ([string]::IsNullOrWhiteSpace($Script:SharedRoot) -or -not (Test-Path $Script:SharedRoot)) {
        [System.Windows.Forms.MessageBox]::Show((T "msg_synced_folder_not_found"),(T "title_error"),[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        return
    }
    Start-Process explorer.exe $Script:SharedRoot
})
Set-PrimaryButtonStyle $btnOpenShared
$groupAction.Controls.Add($btnOpenShared)

$btnForce = New-Object System.Windows.Forms.Button
$btnForce.Text = (T "force_unlock")
$btnForce.Font = $fontButton
$btnForce.Size = New-Object System.Drawing.Size(115, 26)
$btnForce.Location = New-Object System.Drawing.Point(712, 30)
$btnForce.Visible = [bool]$Script:UserConfig.IsAdmin
$btnForce.Add_Click({ Force-Unlock })
Set-PrimaryButtonStyle $btnForce "danger"
$groupAction.Controls.Add($btnForce)

$groupDetails = New-Object System.Windows.Forms.GroupBox
$groupDetails.Text = (T "group_details")
$groupDetails.Font = $fontLabel
$groupDetails.ForeColor = $colorTextOnDark
$groupDetails.BackColor = $colorDarkPanel
$groupDetails.Location = New-Object System.Drawing.Point(18, 310)
$groupDetails.Size = New-Object System.Drawing.Size(860, 190)
$mainContainer.Controls.Add($groupDetails)

$lblMode = New-Object System.Windows.Forms.Label; $lblMode.Text = (T "mode"); $lblMode.AutoSize = $true; $lblMode.Location = New-Object System.Drawing.Point(16, 28); $groupDetails.Controls.Add($lblMode)
$lblModeValue = New-Object System.Windows.Forms.Label; $lblModeValue.Text = "-"; $lblModeValue.AutoSize = $true; $lblModeValue.Font = $fontValue; $lblModeValue.Location = New-Object System.Drawing.Point(160, 28); $groupDetails.Controls.Add($lblModeValue)
$lbl1 = New-Object System.Windows.Forms.Label; $lbl1.Text = (T "current_host"); $lbl1.AutoSize = $true; $lbl1.Location = New-Object System.Drawing.Point(16, 58); $groupDetails.Controls.Add($lbl1)
$lblHostValue = New-Object System.Windows.Forms.Label; $lblHostValue.Text = "-"; $lblHostValue.AutoSize = $true; $lblHostValue.Font = $fontValue; $lblHostValue.Location = New-Object System.Drawing.Point(160, 58); $groupDetails.Controls.Add($lblHostValue)
$lbl2 = New-Object System.Windows.Forms.Label; $lbl2.Text = (T "current_machine"); $lbl2.AutoSize = $true; $lbl2.Location = New-Object System.Drawing.Point(16, 88); $groupDetails.Controls.Add($lbl2)
$lblMachineValue = New-Object System.Windows.Forms.Label; $lblMachineValue.Text = "-"; $lblMachineValue.AutoSize = $true; $lblMachineValue.Font = $fontValue; $lblMachineValue.Location = New-Object System.Drawing.Point(160, 88); $groupDetails.Controls.Add($lblMachineValue)
$lbl3 = New-Object System.Windows.Forms.Label; $lbl3.Text = (T "host_started"); $lbl3.AutoSize = $true; $lbl3.Location = New-Object System.Drawing.Point(16, 118); $groupDetails.Controls.Add($lbl3)
$lblStartedAtValue = New-Object System.Windows.Forms.Label; $lblStartedAtValue.Text = "-"; $lblStartedAtValue.AutoSize = $true; $lblStartedAtValue.Font = $fontValue; $lblStartedAtValue.Location = New-Object System.Drawing.Point(160, 118); $groupDetails.Controls.Add($lblStartedAtValue)
$lbl4 = New-Object System.Windows.Forms.Label; $lbl4.Text = (T "updated_by"); $lbl4.AutoSize = $true; $lbl4.Location = New-Object System.Drawing.Point(430, 58); $groupDetails.Controls.Add($lbl4)
$lblUpdatedByValue = New-Object System.Windows.Forms.Label; $lblUpdatedByValue.Text = "-"; $lblUpdatedByValue.AutoSize = $true; $lblUpdatedByValue.Font = $fontValue; $lblUpdatedByValue.Location = New-Object System.Drawing.Point(620, 58); $groupDetails.Controls.Add($lblUpdatedByValue)
$lbl5 = New-Object System.Windows.Forms.Label; $lbl5.Text = (T "updated_at"); $lbl5.AutoSize = $true; $lbl5.Location = New-Object System.Drawing.Point(430, 88); $groupDetails.Controls.Add($lbl5)
$lblUpdatedAtValue = New-Object System.Windows.Forms.Label; $lblUpdatedAtValue.Text = "-"; $lblUpdatedAtValue.AutoSize = $true; $lblUpdatedAtValue.Font = $fontValue; $lblUpdatedAtValue.Location = New-Object System.Drawing.Point(620, 88); $groupDetails.Controls.Add($lblUpdatedAtValue)
$lblSharedRootMainTitle = New-Object System.Windows.Forms.Label; $lblSharedRootMainTitle.Text = (T "synced_folder"); $lblSharedRootMainTitle.AutoSize = $true; $lblSharedRootMainTitle.Location = New-Object System.Drawing.Point(16, 152); $groupDetails.Controls.Add($lblSharedRootMainTitle)
$txtSharedRootMain = New-Object System.Windows.Forms.TextBox; $txtSharedRootMain.ReadOnly = $true; $txtSharedRootMain.Location = New-Object System.Drawing.Point(160, 149); $txtSharedRootMain.Size = New-Object System.Drawing.Size(680, 24)
$txtSharedRootMain.BackColor = [System.Drawing.Color]::FromArgb(30,30,30)
$txtSharedRootMain.ForeColor = $colorTextOnDark; $groupDetails.Controls.Add($txtSharedRootMain)

$groupGamePath = New-Object System.Windows.Forms.GroupBox
$groupGamePath.Text = (T "local_saves_folder")
$groupGamePath.Font = $fontLabel
$groupGamePath.ForeColor = $colorTextOnDark
$groupGamePath.BackColor = $colorDarkPanel
$groupGamePath.Location = New-Object System.Drawing.Point(18, 510)
$groupGamePath.Size = New-Object System.Drawing.Size(860, 66)
$mainContainer.Controls.Add($groupGamePath)

$txtGameSave = New-Object System.Windows.Forms.TextBox
$txtGameSave.ReadOnly = $true
$txtGameSave.Location = New-Object System.Drawing.Point(15, 26)
$txtGameSave.Size = New-Object System.Drawing.Size(830, 24)
$txtGameSave.BackColor = [System.Drawing.Color]::FromArgb(30,30,30)
$txtGameSave.ForeColor = $colorTextOnDark
$groupGamePath.Controls.Add($txtGameSave)

$groupLog = New-Object System.Windows.Forms.GroupBox
$groupLog.Text = (T "session_log")
$groupLog.Font = $fontLabel
$groupLog.ForeColor = $colorTextOnDark
$groupLog.BackColor = $colorDarkPanel
$groupLog.Location = New-Object System.Drawing.Point(18, 592)
$groupLog.Size = New-Object System.Drawing.Size(860, 156)
$mainContainer.Controls.Add($groupLog)

$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Multiline = $true
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = "Vertical"
$txtLog.Location = New-Object System.Drawing.Point(15, 24)
$txtLog.Size = New-Object System.Drawing.Size(830, 116)
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(22,22,22)
$txtLog.ForeColor = $colorTextOnDark
$groupLog.Controls.Add($txtLog)

$lblCredits = New-Object System.Windows.Forms.Label
$lblCredits.Text = (T "about_credit")
$lblCredits.Font = $fontSmall
$lblCredits.ForeColor = [System.Drawing.Color]::FromArgb(184,170,140)
$lblCredits.AutoSize = $true
$lblCredits.Anchor = "Left,Bottom"
$lblCredits.Location = New-Object System.Drawing.Point(18, 750)
$mainContainer.Controls.Add($lblCredits)

Set-ControlTreeForeColor $groupAction $colorTextOnDark
Set-ControlTreeForeColor $groupDetails $colorTextOnDark
Set-ControlTreeForeColor $groupGamePath $colorTextOnDark
Set-ControlTreeForeColor $groupLog $colorTextOnDark



function Apply-MainLanguage {
    $form.Text = (T "window_title")
    $lblTitle.Text = (T "window_title")
    $lblSubtitle.Text = (T "top_subtitle")
    $btnSettings.Text = (T "settings")
    $btnAbout.Text = (T "about")
    $lblLangTop.Text = (T "language")
    $lblCardsHint.Text = (T "quick_status")
    $lblCardWorldTitle.Text = (T "card_world")
    $lblCardWorldStatusTitle.Text = (T "card_world_status")
    $lblCardGameStatusTitle.Text = (T "card_game_status")
    $lblCardSaveTitle.Text = (T "card_save")
    $groupAction.Text = (T "group_actions")
    $lblHostName.Text = (T "your_name")
    $btnWizard.Text = (T "wizard")
    $btnRefresh.Text = (T "refresh")
    $btnHost.Text = (T "host")
    $btnEnd.Text = (T "end_host")
    $btnOpenShared.Text = (T "open_shared")
    $btnForce.Text = (T "force_unlock")
    $groupDetails.Text = (T "group_details")
    $lblMode.Text = (T "mode")
    $lbl1.Text = (T "current_host")
    $lbl2.Text = (T "current_machine")
    $lbl3.Text = (T "host_started")
    $lbl4.Text = (T "updated_by")
    $lbl5.Text = (T "updated_at")
    $lblSharedRootMainTitle.Text = (T "synced_folder")
    $groupGamePath.Text = (T "local_saves_folder")
    $groupLog.Text = (T "session_log")
    $lblCredits.Text = (T "about_credit")
}
$Script:AutoRefreshTimer = New-Object System.Windows.Forms.Timer
$interval = 15
try { $interval = [int]$Script:UserConfig.AutoRefreshSeconds } catch { $interval = 15 }
if ($interval -lt 5) { $interval = 5 }
$Script:AutoRefreshTimer.Interval = $interval * 1000
$Script:AutoRefreshTimer.Add_Tick({ Refresh-Status })
$Script:AutoRefreshTimer.Start()

Apply-MainLanguage
Refresh-Status
Write-UiLog "Ferramenta carregada."
Write-UiLog "Arquivo de config do usuario: $Script:UserConfigPath"
Write-UiLog "Versao: $Script:ToolVersion"
if (-not (Is-ConfigReady)) { Write-UiLog "Configure o app usando o Assistente Inicial." "ALERTA" }

[void]$form.ShowDialog()