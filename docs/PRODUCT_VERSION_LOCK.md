# NoGuess — Product Version Lock

## Product

**Name:** NoGuess  
**Purpose:** Prevent unsupported assumptions from silently becoming implementation
requirements in AI-assisted software development.

Coding agents can produce technically valid implementations while silently
filling missing requirements with plausible assumptions. The result is code that
works but implements the wrong product. NoGuess is an epistemic control plane
that surfaces ambiguity before it becomes committed implementation.

---

## Canonical Future Architecture (ECP)

The authoritative future NoGuess architecture is an
**Epistemic Control Plane (ECP)**:

```
immutable event ledger
→ deterministic epistemic kernel
→ evidence / authority reasoning
→ Bob-generated interpretations
→ semantic fork + materiality detection
→ minimal discriminating clarification when required
→ authority / human decision
→ capability-scoped Bob implementation
→ Bob session closure
→ physically separate independent evaluator
→ acceptance result
```

### Event Ledger

The **immutable event ledger is authoritative**.
All epistemic state is derived from it.
Accepted event history must not be rewritten.

### Later Projections (not canonical state)

The following are downstream projections derived from the ledger.
They are not the canonical source of truth:

- Epistemic Graph
- Guess Debt
- Assumption Replay
- Epistemic Receipt

---

## Bob Authority Restrictions

The Bob agent must never be permitted to:

- Declare human ambiguity resolved by itself
- Manufacture a human decision
- Grant its own execution capability
- Access private evaluator answers during implementation
- Run the hidden intent oracle during implementation
- Accept its own implementation
- Rewrite accepted event history

---

## Public Fixture / Private Evaluator Separation

Agent-visible and public fixture material (this repository) and the private
evaluator remain **physically separated**.

The public repository must not contain:

- Hidden benchmark answers
- Expected routes or must-change artifact sets
- Must-not-change artifact sets
- Oracle outputs
- Benchmark case IDs encoded into runtime or test logic
- Private evaluator logic of any kind

---

## Current Benchmark Architecture

**GuessBench-Bob v0.3** — security-hardened.

The public fixture substrate (this repository) provides the neutral deterministic
application domain. The private evaluator is maintained separately and is never
present here.

---

## M0 Scope

**M0 is only the deterministic neutral fixture substrate.**

M0 does not implement:

- The event ledger
- The epistemic kernel
- The semantic fork detector
- The clarification engine
- The capability broker
- The evaluator or benchmark runner
- Any UI layer

M0 provides the smallest deterministic multi-tenant SaaS fixture capable of
expressing the business domains (authentication, refunds, exports, payments,
accounts, retention, webhooks, workers) that later NoGuess and GuessBench
experiments will operate against.

---

## Non-Authoritative Project Directions

The following older or separate project directions are **not authoritative** for
this repository and must not be merged or substituted:

- Counterfactual Acceptance Testing (CAT)
- Dark Factory
- EngineeringOS
- Counterfactual CI
- Intent Compiler
- Decision Mutation Testing
- Generic clarification assistants
- Other hackathon projects not listed here as canonical

---

## What This File Is

This file is **product-development context** for contributors and reviewers.

It is not:

- A hidden test expectation
- A frozen answer set
- An evaluator data file
- A must-change or must-not-change specification
