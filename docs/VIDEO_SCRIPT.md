# NoGuess — Final Demo Video Script

Target length: **2:30–2:45**

## Recording setup

- 16:9 screen recording
- Terminal font large enough to read at 1080p
- Keep only the repository terminal and README/architecture visual visible
- Use `scripts/demo-showcase.ps1` for the terminal portion
- Do not show private evaluator material or hidden benchmark answers

## 0:00–0:18 — Problem

**Screen:** README hero + architecture visual.

**Narration:**

"AI coding agents are getting very good at writing code that compiles and passes tests. But when a requirement is ambiguous, an agent can still silently choose a plausible interpretation and build the wrong product. NoGuess is an epistemic control plane that stops that from becoming implementation authority."

## 0:18–0:35 — Flagship request

**Screen:** Zoom on the request in the visual.

**Narration:**

"Our example is simple: 'Make VIP refunds automatic.' The existing system says refunds above ten thousand rupees require approval, and VIP status currently gives no exemption. But the request can still mean several different things."

## 0:35–1:05 — Semantic fork + block

**Screen:** Start `scripts/demo-showcase.ps1`. Show section 1.

**Narration:**

"Bob proposes plausible interpretations. NoGuess compares their observable effects, not just their wording. Here, execution and authorization differ, so the deterministic kernel records a semantic fork. That creates one unresolved Guess Debt item. The code could still be green, but intent is not established, so implementation capability is denied."

Pause on:

```text
CODE MAY BE GREEN
INTENT IS NOT YET ESTABLISHED
BLOCKED_UNRESOLVED_INTENT
```

## 1:05–1:28 — Minimal human clarification

**Screen:** Keep the neutral question visible.

**Narration:**

"NoGuess asks the smallest behaviour-level question that distinguishes the competing interpretations: a VIP requests fifteen thousand rupees with no manager approval — what should happen? The model does not get to answer for the human, and 'Other or none of these' is always available."

## 1:28–1:55 — Explicit authority

**Screen:** Press Enter and show section 2.

**Narration:**

"Once a human explicitly selects an outcome, NoGuess records a HumanDecisionRecorded event. The corresponding Guess Debt is resolved. Only then can the kernel grant implementation capability from an explicit basis."

Pause on:

```text
HumanDecisionRecorded
INTENT ESTABLISHED BY HUMAN DECISION
CAPABILITY GRANTED FROM EXPLICIT BASIS
READY_FOR_IMPLEMENTATION
```

## 1:55–2:14 — Refuse fake resolution

**Screen:** Press Enter and show section 3.

**Narration:**

"If the human chooses 'Other or none', NoGuess does not force a choice just to keep the agent moving. It returns NEEDS_EXTERNAL_INPUT and remains blocked."

Pause on:

```text
NEEDS_EXTERNAL_INPUT
BLOCKED_UNRESOLVED_INTENT
```

## 2:14–2:35 — Architecture + trust boundary

**Screen:** Return to the architecture visual.

**Narration:**

"The immutable ledger is authoritative. Bob can propose interpretations and model inferences, but it cannot manufacture human authority, grant itself capability, rewrite accepted history, or accept its own result. AI proposes. The deterministic kernel disposes."

## 2:35–2:45 — Close

**Screen:** Final terminal validation or README validation section.

**Narration:**

"The current core passes 364 out of 364 tests with zero failures. The code passing is not enough. The code must be authorized by evidence."

## Recording notes

- `opt-00` is a demo selection only; never describe it as the objectively correct answer.
- The demo is reproducible, but the ledger head hash can differ between runs because the demo uses wall-clock timestamps.
- The deterministic claims apply to kernel admission, materiality logic, IDs under controlled inputs, and tests with injected clocks.
- Keep the video under 3 minutes.
