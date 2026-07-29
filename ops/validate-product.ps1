[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$SwissPath = Join-Path $RepoRoot "src\domain\swiss.ts"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_tournaments.sql"
$BoardPath = Join-Path $RepoRoot "public\board.js"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$PublicDirectory = Join-Path $RepoRoot "public"

$RequiredFiles = @(
    "DECISIONS.md",
    "EXPERIMENT.md",
    "METRICS.md",
    "PRIVACY.md",
    "README.md",
    "SECURITY.md",
    "STACK.md",
    "public\app.js",
    "public\board.js",
    "public\favicon.svg",
    "public\manifest.webmanifest",
    "public\styles.css",
    "public\og.svg",
    "public\robots.txt",
    "public\sitemap.xml"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) {
        throw "Missing required release file: $RelativePath"
    }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Swiss = Get-Content -Raw -LiteralPath $SwissPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$Board = Get-Content -Raw -LiteralPath $BoardPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$ProductSurface = @($Worker, $Board) -join "`n"

if (-not $Worker.Contains('class="pairing-board"') -or
    -not $Worker.Contains('class="table-slip"') -or
    -not $Worker.Contains('class="round-dial"') -or
    -not $Board.Contains("match-status")) {
    throw "Expected the round dial, pairing slips, numbered tables, and result state visualization"
}
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') {
    throw "Research copy must not appear on the product surface"
}
if ($Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px') {
    throw "Primary heading is too large"
}
if ($Board -match '(?i)innerHTML|eval\(|new Function') {
    throw "User content must not be interpreted as markup or code"
}
if (-not $Board.Contains("location.hash") -or
    -not $Worker.Contains("organizer_token_hash") -or
    -not $Worker.Contains("token_hash") -or
    -not $Worker.Contains("await sha256(token)")) {
    throw "Capability URLs must keep raw tokens in fragments and store only hashes"
}
if (-not $Worker.Contains("constantTimeEqual") -or
    -not $Worker.Contains("enforceSameOrigin") -or
    -not $Worker.Contains("create_rate_limited") -or
    -not $Worker.Contains("contact_not_allowed_in_")) {
    throw "Expected capability, origin, rate, and contact-data boundaries"
}
if (-not $Worker.Contains("45 * 86400") -or
    -not $Worker.Contains("DELETE FROM tournaments WHERE expires_at <= ?") -or
    -not $Migration.Contains("ON DELETE CASCADE")) {
    throw "Expected bounded event and tournament retention"
}
if ($Migration -match '(?i)email|phone|real_name|photo|gender|birthday|payment|deck_list|message_thread') {
    throw "Identity, contact, profile, deck, payment, and chat data do not belong in this release"
}
if (-not $Migration.Contains("UNIQUE(tournament_id, session_id)") -or
    -not $Migration.Contains("UNIQUE(tournament_id, display_name_key)") -or
    -not $Migration.Contains("player1_report") -or
    -not $Migration.Contains("player2_report")) {
    throw "Expected duplicate-registration and dual-report constraints"
}
if (-not $Swiss.Contains("previousPairs") -or
    -not $Swiss.Contains("byeCount") -or
    -not $Swiss.Contains("Math.max(0.33")) {
    throw "Expected rematch avoidance, repeated-bye avoidance, and OMW floor"
}
if ($Worker -match '(?i)better-auth|betterAuth') {
    throw "Account authentication is not needed for the capability-based release"
}

$OgPath = Join-Path $PublicDirectory "og.svg"
if ((Get-Item -LiteralPath $OgPath).Length -lt 2500) {
    throw "Expected a product-specific OG SVG larger than 2.5 KB"
}

$KeyFiles = @(
    Get-ChildItem -LiteralPath $PublicDirectory -File |
        Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" }
)
if ($KeyFiles.Count -ne 1) {
    throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)"
}
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) {
    throw "IndexNow key file name and content do not match"
}

Write-Output "Product release contract is satisfied"
