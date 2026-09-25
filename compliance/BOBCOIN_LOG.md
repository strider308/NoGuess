# Bobcoin Log

Starting allocation recorded: 50

| Timestamp | Milestone | Task | Before | After | Delta | Result |
|---|---|---|---:|---:|---:|---|
| 2026-09-25T20:43:15.7459179+05:30 | Kickoff | Hackathon account verification | 50 | 50 | 0 | PASS |

## Usage policy

- Below 50% consumed: normal core development.
- 50-75% consumed: no low-value experimentation.
- Above 75% consumed: critical-path tasks only.
- Preserve roughly the final quarter for integration repair,
  final demo reproduction, and submission-critical fixes.

## Allocation correction

Bob IDE reports an authoritative hackathon allocation of 50 Bobcoins.

M0 task consumption shown in its Bob IDE task summary:
25.24 Bobcoins.

IDE-wide usage after M0:
25.45 / 50 Bobcoins.

Difference outside the M0 task:
0.21 Bobcoins.

Remaining IDE-wide allocation:
24.55 Bobcoins.
| 2026-09-25T21:30:23.1185325+05:30 | M0 | M0 deterministic fixture runtime and canonicalization | 50 | 24.76 | 25.24 | PASS |

## M1 IDE-wide reconciliation

M1 Bob task:
- Task ID: f3a4d1af00a9279c2c5940202857a29d
- Task Bobcoins consumed: 2.78
- Task balance basis: 24.55 -> 21.77

Authoritative Bob IDE totals:
- Before M1: 25.45 / 50 used
- After M1: 28.61 / 50 used
- Total IDE-wide consumption during interval: 3.16
- Usage outside the M1 task during interval: 0.38
- Remaining authoritative allocation: 21.39 / 50

The task-specific balance records only the 2.78 Bobcoins attributed to
the M1 task. The IDE-wide counter is authoritative for total remaining
hackathon allocation.
| 2026-09-25T21:58:42.2878982+05:30 | M1 | M1 immutable epistemic event ledger | 24.55 | 21.77 | 2.78 | PASS |
| 2026-09-25T22:12:52.2801411+05:30 | M2 | M2 deterministic epistemic kernel | 21.39 | 18.78 | 2.61 | PASS |

## M2 IDE-wide reconciliation

M2 Bob task:
- Task ID: 893ece7c77bd6bebe97ab6fbefed631d
- Task Bobcoins consumed: 2.61
- Task balance basis: 21.39 -> 18.78

Authoritative Bob IDE totals:
- Before M2: 28.61 / 50 used
- After M2: 31.25 / 50 used
- Total IDE-wide consumption during interval: 2.64
- Usage outside the M2 task during interval: 0.03
- Remaining authoritative allocation: 18.75 / 50

The task-specific balance reflects the 2.61 Bobcoins attributed to M2.
The Bob IDE-wide counter remains authoritative for total remaining allocation.
| 2026-09-25T22:45:37.2946556+05:30 | M3 | M3 evidence and authority reasoning with trust-boundary hardening | 18.75 | 5.74 | 13.01 | PASS |

## M3 IDE-wide reconciliation

M3 Bob task:
- Task ID: 77b43a15c957c1e14ecc3985065142c0
- Final task Bobcoins consumed: 13.01
- Task balance basis: 18.75 -> 5.74

Authoritative Bob IDE totals:
- Before M3: 31.25 / 50 used
- After M3: 44.34 / 50 used
- Total IDE-wide consumption during interval: 13.09
- Usage outside the M3 task during interval: 0.08
- Remaining authoritative allocation: 5.66 / 50

M3 includes the final trust-boundary corrective pass.

The task-specific balance records the 13.01 Bobcoins attributed to the
M3 task. The Bob IDE-wide counter is authoritative for total remaining
hackathon allocation.

| 2026-09-25T23:11:32.4100743+05:30 | FINAL_CORE | Final core vertical slice | 5.66 | -0.14 | 5.80 | BOB_LIMIT_REACHED |

## Final Core IDE-wide reconciliation

Final Bob task:
- Task ID: 2b7f2413ea8026927d46b70d3244efef
- Workspace: NoGuess
- Task Bobcoins consumed: 5.80
- Task-specific theoretical balance: 5.66 -> -0.14
- Bob stopped because the available trial/allocation was exhausted.

Authoritative Bob IDE totals:
- Before final task: 44.34 / 50 used
- After final task: 50.16 / 50 used
- IDE-wide consumption during interval: 5.82
- Usage outside the final task during interval: 0.02
- Nominal allocation exceeded by: 0.16
- Remaining usable Bobcoin allocation: 0

Important status distinction:
- The Bob task itself is recorded as BOB_LIMIT_REACHED, not PASS.
- Bob had implemented the final vertical slice and reached 364 passing tests
  before exhausting the allocation during demo validation.
- Final validation and small demo hardening were completed locally afterward.
