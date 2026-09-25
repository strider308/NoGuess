# NoGuess — Judge Demo Runbook

## Goal

Demonstrate one failure mode clearly:

> An AI coding agent can produce plausible, green code while silently choosing
> an unsupported product requirement.

NoGuess prevents implementation authority from being granted until material
intent ambiguity has an explicit basis.

## Flagship request

```text
Make VIP refunds automatic.
```

Existing evidence establishes that refunds above ₹10,000 require approval and
VIP status currently grants no exemption.

Bob may still propose multiple plausible interpretations.

## 2–3 minute recording sequence

### 0:00–0:20 — Problem

Show the README hero and architecture visual.

Say:

> "Coding agents are getting very good at writing code. But when the request is
> ambiguous, passing tests does not prove the agent built the product you meant.
> NoGuess controls that gap."

### 0:20–0:55 — Unresolved intent

Run:

```powershell
npm run demo:vip-refund
```

Point out:

- Bob proposes multiple plausible meanings.
- NoGuess compares observable effects.
- A material semantic fork is detected.
- Guess Debt becomes unresolved.
- Implementation capability is denied.

Land on:

```text
CODE MAY BE GREEN
INTENT IS NOT YET ESTABLISHED
BLOCKED_UNRESOLVED_INTENT
```

### 0:55–1:35 — One discriminating human question

Show:

```text
A VIP customer requests ₹15,000 and no manager has approved it.
What should happen?
```

Explain that the question is behaviour-level and includes `Other / none of
these`.

The agent does not get to choose the answer.

### 1:35–2:00 — Explicit decision unlocks authority

Run:

```powershell
node --import tsx scripts/demo-vip-refund.ts --answer opt-00
```

For the recording, `opt-00` is simply one explicit human demo selection, not
an encoded objectively-correct answer.

Highlight:

```text
HumanDecisionRecorded
INTENT ESTABLISHED BY HUMAN DECISION
CAPABILITY GRANTED FROM EXPLICIT BASIS
READY_FOR_IMPLEMENTATION
```

### 2:00–2:20 — Refusal to fake resolution

Run:

```powershell
node --import tsx scripts/demo-vip-refund.ts --answer opt-other
```

Highlight:

```text
NEEDS_EXTERNAL_INPUT
BLOCKED_UNRESOLVED_INTENT
```

Say:

> "If the offered interpretations are wrong, NoGuess stays blocked. It does not
> manufacture a decision just to keep the agent moving."

### 2:20–2:45 — Trust boundary + receipt

Return to the architecture visual.

Say:

> "Bob proposes. The deterministic kernel disposes. The ledger records what was
> known, what was inferred, where behaviour diverged, who decided, and why the
> capability was granted."

Show the validation line:

```text
364 tests
364 pass
0 fail
```

### Closing line

> **"The code passing is not enough. The code must be authorized by evidence."**

## Recording rules

- Do not show private benchmark answers or evaluator material.
- Do not imply that `opt-00` is objectively correct.
- Do not describe authority classes as a universal ranking.
- Keep the Bob session evidence visible in the repository, but do not spend time
  narrating Bobcoin accounting unless asked.
- Prefer one continuous recording over many cuts.
- Keep total duration below three minutes if possible.
