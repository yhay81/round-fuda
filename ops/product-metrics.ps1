[CmdletBinding()]
param(
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute round-fuda $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) {
    throw "D1 metrics query failed with exit code $LASTEXITCODE"
}

$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) {
    throw "D1 metrics query returned no result"
}

function Get-Percent {
    param([int]$Numerator, [int]$Denominator)
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
$Creators = [int]$Row.creators
$Registrants = [int]$Row.registrants
$CheckedIn = [int]$Row.checked_in
$Started = [int]$Row.started

[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "round-fuda"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        creators = $Creators
        registrants = $Registrants
        checked_in = $CheckedIn
        started_tournaments = $Started
        tournaments_with_results = [int]$Row.with_results
        completed_tournaments = [int]$Row.completed
        returned = [int]$Row.returned
        created_7d = [int]$Row.created_7d
        checked_in_7d = [int]$Row.checked_in_7d
    }
    live_state = [ordered]@{
        registration_open = [int]$Row.registration_open
        active = [int]$Row.active
        completed = [int]$Row.completed_live
        registered_players = [int]$Row.registered_players
        checked_in_players = [int]$Row.checked_in_players
    }
    rates = [ordered]@{
        creator_percent = Get-Percent $Creators $Users
        registrant_percent = Get-Percent $Registrants $Users
        check_in_percent = Get-Percent $CheckedIn $Registrants
        start_percent = Get-Percent $Started $Creators
        completion_percent = Get-Percent ([int]$Row.completed) $Started
    }
} | ConvertTo-Json -Depth 4

