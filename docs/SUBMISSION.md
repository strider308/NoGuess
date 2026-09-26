# IBM Bob 2.0 Submission Notes

## Project

**NoGuess — Epistemic control plane for AI coding agents**

Bob can write the code. NoGuess makes sure nobody silently invented the requirement.

## Submission repository

https://github.com/strider308/NoGuess

## Flagship workflow

```text
Developer request
→ grounded evidence
→ Bob-proposed interpretations
→ semantic fork detection
→ deterministic materiality
→ Guess Debt
→ neutral discriminating question
→ explicit human decision
→ capability decision
→ Epistemic Receipt
```

## Reproduce

```bash
npm ci
npm run typecheck
npm test
npm run demo:vip-refund
node --import tsx scripts/demo-vip-refund.ts --answer opt-00
node --import tsx scripts/demo-vip-refund.ts --answer opt-other
```

## Expected authority outcomes

- no human answer → `BLOCKED_UNRESOLVED_INTENT`
- explicit human decision → `READY_FOR_IMPLEMENTATION`
- Other / none → `NEEDS_EXTERNAL_INPUT` and remains blocked

## IBM Bob evidence

All relevant Bob task-session consumption summaries are committed under
[`bob_sessions/`](../bob_sessions/) and registered in
[`bob_sessions/manifest.json`](../bob_sessions/manifest.json).

## Validation target

- TypeScript: PASS
- Full suite: 364 / 364
- Failures: 0

This document contains no hidden benchmark answers or private evaluator material.
