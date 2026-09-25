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
