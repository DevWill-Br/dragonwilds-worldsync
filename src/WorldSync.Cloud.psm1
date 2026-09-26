Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-CloudClientParameters {
    param(
        [Parameter(Mandatory)][string]$ApiBaseUrl,
        [Parameter(Mandatory)][string]$WorldId,
        [Parameter(Mandatory)][string]$ApiToken
    )
    if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) { throw 'ApiBaseUrl is required.' }
    if (-not [Uri]::IsWellFormedUriString($ApiBaseUrl,[UriKind]::Absolute)) { throw 'ApiBaseUrl must be an absolute http/https URL.' }
    $uri=[Uri]$ApiBaseUrl
    if ($uri.Scheme -notin @('http','https')) { throw 'ApiBaseUrl must use http or https.' }
    if ($WorldId -notmatch '^[a-z0-9][a-z0-9_-]{0,63}$') { throw 'WorldId must use lowercase letters, digits, dash or underscore.' }
    if ([string]::IsNullOrWhiteSpace($ApiToken) -or $ApiToken.Length -lt 24) { throw 'ApiToken is missing or too short.' }
}

function Get-CloudAuthHeaders {
    param([Parameter(Mandatory)][string]$ApiToken)
    return @{ Authorization = "Bearer $ApiToken" }
}

function Invoke-CloudJsonRequest {
    param(
        [Parameter(Mandatory)][ValidateSet('GET','POST')][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$ApiToken,
        $Body
    )
    $headers=Get-CloudAuthHeaders $ApiToken
    try {
        if ($Method -eq 'GET') {
            $response=Invoke-WebRequest -UseBasicParsing -Method Get -Uri $Uri -Headers $headers
        } else {
            $json=$Body | ConvertTo-Json -Depth 8 -Compress
            $response=Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Uri -Headers $headers -ContentType 'application/json' -Body $json
        }
        if ([string]::IsNullOrWhiteSpace($response.Content)) { return $null }
        return $response.Content | ConvertFrom-Json
    } catch {
        $detail=$null
        if ($_.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) { $detail=$_.ErrorDetails.Message }
        if ($detail) { throw "WorldSync Cloud request failed: $detail" }
        throw
    }
}

function Get-CloudWorldStatus {
    param(
        [Parameter(Mandatory)][string]$ApiBaseUrl,
        [Parameter(Mandatory)][string]$WorldId,
        [Parameter(Mandatory)][string]$ApiToken
    )
    Assert-CloudClientParameters $ApiBaseUrl $WorldId $ApiToken
    $base=$ApiBaseUrl.TrimEnd('/')
    $world=[Uri]::EscapeDataString($WorldId)
    Invoke-CloudJsonRequest -Method GET -Uri "$base/v1/worlds/$world/status" -ApiToken $ApiToken
}

function Start-CloudWorldSession {
    param(
        [Parameter(Mandatory)][string]$ApiBaseUrl,
        [Parameter(Mandatory)][string]$WorldId,
        [Parameter(Mandatory)][string]$ApiToken,
        [Parameter(Mandatory)][string]$HostName,
        [Parameter(Mandatory)][string]$MachineId
    )
    Assert-CloudClientParameters $ApiBaseUrl $WorldId $ApiToken
    if ([string]::IsNullOrWhiteSpace($HostName)) { throw 'HostName is required.' }
    if ([string]::IsNullOrWhiteSpace($MachineId)) { throw 'MachineId is required.' }
    $base=$ApiBaseUrl.TrimEnd('/')
    $world=[Uri]::EscapeDataString($WorldId)
    Invoke-CloudJsonRequest -Method POST -Uri "$base/v1/worlds/$world/acquire" -ApiToken $ApiToken -Body @{
        host=$HostName
        machineId=$MachineId
    }
}

function Update-CloudWorldHeartbeat {
    param(
        [Parameter(Mandatory)][string]$ApiBaseUrl,
        [Parameter(Mandatory)][string]$WorldId,
        [Parameter(Mandatory)][string]$ApiToken,
        [Parameter(Mandatory)][string]$SessionId
    )
    Assert-CloudClientParameters $ApiBaseUrl $WorldId $ApiToken
    if ([string]::IsNullOrWhiteSpace($SessionId)) { throw 'SessionId is required.' }
    $base=$ApiBaseUrl.TrimEnd('/')
    $world=[Uri]::EscapeDataString($WorldId)
    Invoke-CloudJsonRequest -Method POST -Uri "$base/v1/worlds/$world/heartbeat" -ApiToken $ApiToken -Body @{
        sessionId=$SessionId
    }
}

Export-ModuleMember -Function Get-CloudWorldStatus,Start-CloudWorldSession,Update-CloudWorldHeartbeat
