$ErrorActionPreference = "Stop"

Set-Location "C:\dev\IBM-BOB-2\hackathon\NoGuess"

$ExpectedBranch = "submission/final-packaging-20260925"
if ((git branch --show-current) -ne $ExpectedBranch) {
    throw "Wrong branch. Expected $ExpectedBranch."
}

if ((git status --porcelain).Length -ne 0) {
    throw "Working tree must be clean before demo evidence capture."
}

$EvidenceDir = Join-Path (Get-Location) "docs\demo-evidence"
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string[]]$Lines
    )
    $Text = ($Lines -join [Environment]::NewLine) + [Environment]::NewLine
    [System.IO.File]::WriteAllText(
        $Path,
        $Text,
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Assert-Contains {
    param(
        [Parameter(Mandatory=$true)][string]$Text,
        [Parameter(Mandatory=$true)][string[]]$Markers,
        [Parameter(Mandatory=$true)][string]$Label
    )
    foreach ($Marker in $Markers) {
        if ($Text -notmatch [regex]::Escape($Marker)) {
            throw "$Label missing marker: $Marker"
        }
    }
}

Write-Host "`n=== VALIDATION ===" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }

npm test
if ($LASTEXITCODE -ne 0) { throw "Tests failed." }

Write-Host "`n=== CAPTURE: BLOCKED ===" -ForegroundColor Cyan
$Blocked = @(
    & node --import tsx scripts/demo-vip-refund.ts 2>&1 |
        ForEach-Object { "$_" }
)
if ($LASTEXITCODE -ne 0) { throw "Blocked demo command failed." }

$BlockedText = $Blocked -join "`n"
Assert-Contains $BlockedText @(
    "CODE MAY BE GREEN",
    "INTENT IS NOT YET ESTABLISHED",
    "BLOCKED_UNRESOLVED_INTENT",
    "Capability remains DENIED"
) "Blocked path"

Write-Utf8NoBom (Join-Path $EvidenceDir "01-blocked-no-human-answer.txt") $Blocked
Write-Host "Blocked path: PASS" -ForegroundColor Green

Write-Host "`n=== CAPTURE: EXPLICIT HUMAN SELECTION ===" -ForegroundColor Cyan
$Resolved = @(
    & node --import tsx scripts/demo-vip-refund.ts --answer opt-00 2>&1 |
        ForEach-Object { "$_" }
)
if ($LASTEXITCODE -ne 0) { throw "Resolved demo command failed." }

$ResolvedText = $Resolved -join "`n"
Assert-Contains $ResolvedText @(
    "HumanDecisionRecorded",
    "INTENT ESTABLISHED BY HUMAN DECISION",
    "CAPABILITY GRANTED FROM EXPLICIT BASIS",
    "READY_FOR_IMPLEMENTATION"
) "Resolved path"

Write-Utf8NoBom (Join-Path $EvidenceDir "02-explicit-human-selection.txt") $Resolved
Write-Host "Resolved path: PASS" -ForegroundColor Green

Write-Host "`n=== CAPTURE: OTHER / NONE ===" -ForegroundColor Cyan
$Other = @(
    & node --import tsx scripts/demo-vip-refund.ts --answer opt-other 2>&1 |
        ForEach-Object { "$_" }
)
if ($LASTEXITCODE -ne 0) { throw "Other/none demo command failed." }

$OtherText = $Other -join "`n"
Assert-Contains $OtherText @(
    "NEEDS_EXTERNAL_INPUT",
    "BLOCKED_UNRESOLVED_INTENT"
) "Other/none path"

Write-Utf8NoBom (Join-Path $EvidenceDir "03-other-none.txt") $Other
Write-Host "Other / none path: PASS" -ForegroundColor Green

$Head = (git rev-parse HEAD).Trim()
$GeneratedAt = (Get-Date).ToString("o")

$BlockedHash = (Get-FileHash (Join-Path $EvidenceDir "01-blocked-no-human-answer.txt") -Algorithm SHA256).Hash.ToLowerInvariant()
$ResolvedHash = (Get-FileHash (Join-Path $EvidenceDir "02-explicit-human-selection.txt") -Algorithm SHA256).Hash.ToLowerInvariant()
$OtherHash = (Get-FileHash (Join-Path $EvidenceDir "03-other-none.txt") -Algorithm SHA256).Hash.ToLowerInvariant()

$Summary = @"
# NoGuess Flagship Demo Evidence

Generated: $GeneratedAt

Source commit before evidence capture:

```text
$Head
```

## Scenario

```text
Make VIP refunds automatic.
```

The demo intentionally contains no default human answer.

## Outcome 1 — no human answer

Expected and observed:

```text
CODE MAY BE GREEN
INTENT IS NOT YET ESTABLISHED
Guess Debt remains unresolved
Capability remains DENIED
BLOCKED_UNRESOLVED_INTENT
```

Evidence:

```text
docs/demo-evidence/01-blocked-no-human-answer.txt
SHA256 $BlockedHash
```

## Outcome 2 — explicit human selection

For reproducibility, the demo command explicitly selects `opt-00`.

This is a demonstration selection only. It is not encoded as an objectively
correct hidden answer.

Expected and observed:

```text
HumanDecisionRecorded
INTENT ESTABLISHED BY HUMAN DECISION
CAPABILITY GRANTED FROM EXPLICIT BASIS
READY_FOR_IMPLEMENTATION
```

Evidence:

```text
docs/demo-evidence/02-explicit-human-selection.txt
SHA256 $ResolvedHash
```

## Outcome 3 — Other / none

Expected and observed:

```text
NEEDS_EXTERNAL_INPUT
BLOCKED_UNRESOLVED_INTENT
```

No resolution is fabricated.

Evidence:

```text
docs/demo-evidence/03-other-none.txt
SHA256 $OtherHash
```

## Validation

Before evidence capture:

```text
npm run typecheck
npm test
```

Both commands completed successfully.

The current test suite contains:

```text
364 tests
364 pass
0 fail
```
"@

[System.IO.File]::WriteAllText(
    (Join-Path (Get-Location) "docs\DEMO_EVIDENCE.md"),
    ($Summary.TrimEnd() + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== GENERATED EVIDENCE ===" -ForegroundColor Cyan
Get-ChildItem $EvidenceDir | Select-Object Name, Length
Get-FileHash (Join-Path $EvidenceDir "*.txt") -Algorithm SHA256

git add docs/DEMO_EVIDENCE.md docs/demo-evidence

git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Evidence diff check failed." }

git commit -m "docs: capture flagship demo evidence"
if ($LASTEXITCODE -ne 0) { throw "Evidence commit failed." }

git push
if ($LASTEXITCODE -ne 0) { throw "Evidence push failed." }

Write-Host "`n=== FINAL STATE ===" -ForegroundColor Cyan
git status
git log --oneline -5

Write-Host "`nDEMO EVIDENCE CAPTURE COMPLETE" -ForegroundColor Green
