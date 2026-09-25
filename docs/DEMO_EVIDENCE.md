# NoGuess Flagship Demo Evidence

Generated: 2026-09-25T23:40:11.7898803+05:30

Source commit before evidence capture:

`	ext
9a47fb498cf993bfdd4a4763ca6a394c0753ba2a
`

## Scenario

`	ext
Make VIP refunds automatic.
`

The demo intentionally contains no default human answer.

## Outcome 1 â€” no human answer

Expected and observed:

`	ext
CODE MAY BE GREEN
INTENT IS NOT YET ESTABLISHED
Guess Debt remains unresolved
Capability remains DENIED
BLOCKED_UNRESOLVED_INTENT
`

Evidence:

`	ext
docs/demo-evidence/01-blocked-no-human-answer.txt
SHA256 b3faa4f74021da8d731be7447bc8711093ef93dd0706c3a1a7737d01ed2245b3
`

## Outcome 2 â€” explicit human selection

For reproducibility, the demo command explicitly selects opt-00.

This is a demonstration selection only. It is not encoded as an objectively
correct hidden answer.

Expected and observed:

`	ext
HumanDecisionRecorded
INTENT ESTABLISHED BY HUMAN DECISION
CAPABILITY GRANTED FROM EXPLICIT BASIS
READY_FOR_IMPLEMENTATION
`

Evidence:

`	ext
docs/demo-evidence/02-explicit-human-selection.txt
SHA256 b945b85f52c0238e52c79d8ca9c0ae27b1b971735354b012c6826ea0817ff2f2
`

## Outcome 3 â€” Other / none

Expected and observed:

`	ext
NEEDS_EXTERNAL_INPUT
BLOCKED_UNRESOLVED_INTENT
`

No resolution is fabricated.

Evidence:

`	ext
docs/demo-evidence/03-other-none.txt
SHA256 fcb27bf1026eb39978a194eeee5b8222c924634bf2ca0c14a849a29eb2e84386
`

## Validation

Before evidence capture:

`	ext
npm run typecheck
npm test
`

Both commands completed successfully.

The current test suite contains:

`	ext
364 tests
364 pass
0 fail
`
