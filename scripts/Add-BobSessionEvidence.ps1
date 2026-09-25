param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath,

    [Parameter(Mandatory = $true)]
    [string]$Task,

    [Parameter(Mandatory = $true)]
    [string]$Milestone,

    [decimal]$BalanceBefore = -1,

    [decimal]$BalanceAfter = -1
)

$ErrorActionPreference = "Stop"

$Root = git rev-parse --show-toplevel 2>$null
if (!$Root) {
    throw "Run this from inside the NoGuess repository."
}

$ImageFull = [System.IO.Path]::GetFullPath($ImagePath)
$SessionDir = [System.IO.Path]::GetFullPath(
    (Join-Path $Root "bob_sessions")
)

if (!(Test-Path $ImageFull)) {
    throw "Screenshot not found: $ImageFull"
}

if ([System.IO.Path]::GetExtension($ImageFull).ToLowerInvariant() -ne ".png") {
    throw "Bob session evidence must be PNG."
}

if (!$ImageFull.StartsWith(
    $SessionDir,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "Screenshot must be inside bob_sessions."
}

$Manifest = Join-Path $SessionDir "manifest.json"
$data = Get-Content $Manifest -Raw | ConvertFrom-Json

$relative = [System.IO.Path]::GetRelativePath(
    $Root,
    $ImageFull
).Replace("\", "/")

$sha = (
    Get-FileHash $ImageFull -Algorithm SHA256
).Hash.ToLowerInvariant()

$data.sessions += [pscustomobject]@{
    task        = $Task
    milestone   = $Milestone
    file        = $relative
    sha256      = $sha
    captured_at = (Get-Date).ToString("o")
}

$data |
    ConvertTo-Json -Depth 10 |
    Set-Content $Manifest -Encoding UTF8

Write-Host "Registered Bob evidence:" -ForegroundColor Green
Write-Host "  $relative"
Write-Host "  SHA256: $sha"

if ($BalanceBefore -ge 0 -and $BalanceAfter -ge 0) {

    $delta = $BalanceBefore - $BalanceAfter

    Add-Content `
        (Join-Path $Root "compliance\BOBCOIN_LOG.md") `
        "| $((Get-Date).ToString('o')) | $Milestone | $Task | $BalanceBefore | $BalanceAfter | $delta | PASS |"

    Write-Host "Bobcoin log updated." -ForegroundColor Green
}
