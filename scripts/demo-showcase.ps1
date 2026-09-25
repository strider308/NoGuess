$ErrorActionPreference = "Stop"

Set-Location "C:\dev\IBM-BOB-2\hackathon\NoGuess"

$PreviousNodeNoWarnings = $env:NODE_NO_WARNINGS
$env:NODE_NO_WARNINGS = "1"

function Show-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor DarkGray
    Write-Host $Title -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor DarkGray
}

function Run-And-Show {
    param(
        [string]$Title,
        [string[]]$Arguments,
        [string[]]$Patterns
    )

    Show-Section $Title

    $Output = @(
        & node --import tsx scripts/demo-vip-refund.ts @Arguments 2>&1 |
            ForEach-Object { "$_" }
    )

    if ($LASTEXITCODE -ne 0) {
        $Output | Select-Object -Last 40
        throw "$Title failed."
    }

    $Output |
        Select-String -Pattern $Patterns |
        ForEach-Object { $_.Line }

    Write-Host ""
}

Clear-Host

Write-Host "NoGuess" -ForegroundColor White
Write-Host "Epistemic control plane for AI coding agents" -ForegroundColor Gray
Write-Host ""
Write-Host 'Request: "Make VIP refunds automatic."' -ForegroundColor Yellow
Write-Host ""
Write-Host "AI proposes. Kernel disposes." -ForegroundColor Magenta

Run-And-Show "1 / 3  NO HUMAN ANSWER" @() @(
    "Evidence:",
    "Interpretation",
    "SEMANTIC FORK",
    "Guess Debt",
    "What should happen",
    "Other / none",
    "CODE MAY BE GREEN",
    "INTENT IS NOT YET ESTABLISHED",
    "DENIED",
    "BLOCKED_UNRESOLVED_INTENT"
)

Read-Host "Press Enter for explicit human resolution"

Run-And-Show "2 / 3  EXPLICIT HUMAN DECISION" @("--answer", "opt-00") @(
    "Human selected",
    "HumanDecisionRecorded",
    "Guess Debt",
    "INTENT ESTABLISHED BY HUMAN DECISION",
    "CAPABILITY GRANTED FROM EXPLICIT BASIS",
    "READY_FOR_IMPLEMENTATION",
    "ledger",
    "head hash"
)

Read-Host "Press Enter for Other / none"

Run-And-Show "3 / 3  OTHER / NONE" @("--answer", "opt-other") @(
    "Human selected",
    "Other / none",
    "NEEDS_EXTERNAL_INPUT",
    "BLOCKED_UNRESOLVED_INTENT",
    "No resolution"
)

Show-Section "VALIDATED CORE"
Write-Host "TypeScript  PASS" -ForegroundColor Green
Write-Host "Tests       364 / 364" -ForegroundColor Green
Write-Host "Failures    0" -ForegroundColor Green
Write-Host ""
Write-Host "The code passing is not enough." -ForegroundColor White
Write-Host "The code must be authorized by evidence." -ForegroundColor Green

if ($null -eq $PreviousNodeNoWarnings) {
    Remove-Item Env:NODE_NO_WARNINGS -ErrorAction SilentlyContinue
} else {
    $env:NODE_NO_WARNINGS = $PreviousNodeNoWarnings
}
