# GuessBench-Bob v0.3 — Public Evaluation Protocol

NoGuess is designed to prevent a specific failure mode in AI-assisted software development:

> **Wrong-but-passing:** public engineering checks pass, but the implementation does not match the intended product behaviour because an unsupported requirement was silently guessed.

This document describes the public, non-secret portion of the evaluation design. Hidden expected answers, private evaluator logic, oracle outputs, route expectations, and must-change / must-not-change sets are intentionally excluded from this repository.

## Benchmark composition

GuessBench-Bob v0.3 contains **32 planned evaluation cases**:

| Group | Cases | Purpose |
|---|---:|---|
| Core | 12 | Canonical underspecification and semantic-fork cases used during development |
| RealWorld | 12 | Secondary, more naturalistic software-change scenarios |
| Adversarial | 8 | Trust-boundary and evaluator-separation stress cases |
| **Total** | **32** | |

The Core set is development-visible and therefore **must not be presented as an unbiased holdout**.

The RealWorld set is secondary/provisional.

The Adversarial set focuses on whether the system preserves authority boundaries even when a model attempts to overclaim evidence, resolution, capability, or acceptance.

## Scored-run separation

A scored run should begin from a clean repository state and fresh agent session.

Agent-visible material is limited to:

- the user request;
- the clean public repository;
- explicitly permitted evidence;
- ordinary public engineering checks.

The implementation agent must not have access to:

- hidden intent answers;
- private evaluator logic;
- expected route decisions;
- expected materiality decisions;
- must-change artifact sets;
- must-not-change artifact sets;
- hidden oracle outputs.

The evaluator is physically separate from the implementation session.

No hidden-intent check is run until the implementation session is closed.

## What is measured

The evaluation is intended to distinguish ordinary software correctness from epistemic correctness.

### 1. Wrong-but-passing rate

How often do public engineering checks pass while the implementation still fails hidden intent?

This is the central NoGuess failure mode.

### 2. Material semantic-fork detection

When plausible interpretations imply materially different observable behaviour, does NoGuess surface that divergence rather than letting one interpretation silently become implementation?

Protected effects include execution, authorization, data scope, persistence, and external side effects.

### 3. Unnecessary blocking

When interpretations differ only in wording and produce the same protected observable effects, NoGuess should not create material Guess Debt.

### 4. Authority-boundary violations

The benchmark checks that the model cannot manufacture stronger authority than it actually possesses.

Examples include attempts to:

- emit a human decision;
- claim grounded evidence authority;
- grant its own capability;
- run hidden intent checks;
- accept its own implementation.

### 5. Clarification efficiency

For a material fork, NoGuess should ask the smallest useful behaviour-level question that distinguishes the competing interpretations.

The question must include an **Other / none of these** path so the system cannot force a false resolution.

### 6. Capability correctness

Implementation capability should remain denied while material Guess Debt is unresolved and should be grantable only from an explicit admissible basis.

Superseding the basis should invalidate dependent capability rather than rewriting history.

## Reproducibility rules

For scored external cases:

- start from a clean root commit;
- start with a fresh Bob session;
- use opaque run/case identifiers;
- do not encode benchmark identities in branches, tags, runtime behaviour, or tests;
- do not use web search during a scored case unless the case explicitly permits it;
- use only frozen permitted documentation;
- close the Bob implementation session before hidden evaluation begins.

## Public evidence available today

The public repository currently provides two kinds of evidence.

### Deterministic implementation validation

```text
364 tests
364 pass
0 fail
```

These tests cover the fixture runtime, immutable event ledger, deterministic kernel, evidence/authority reasoning, semantic forks, materiality, clarification, Guess Debt, capability gating, receipt generation, and trust-boundary rules.

### Flagship behavioural evidence

The VIP refund scenario demonstrates all three authority outcomes:

```text
No human answer
→ BLOCKED_UNRESOLVED_INTENT

Explicit human selection
→ HumanDecisionRecorded
→ READY_FOR_IMPLEMENTATION

Other / none
→ NEEDS_EXTERNAL_INPUT
→ BLOCKED_UNRESOLVED_INTENT
```

See:

- `docs/DEMO_EVIDENCE.md`
- `docs/demo-evidence/`

## Result-status boundary

**No public aggregate GuessBench performance claim is made in this repository yet.**

The 364-test result is an implementation-validation result, not a 32-case hidden benchmark score.

The flagship demo is behavioural evidence, not an unbiased benchmark estimate.

This distinction is deliberate: development-visible cases, private evaluator cases, and public unit/integration tests answer different questions and should not be combined into one headline percentage.

## Why this matters

A coding agent can be excellent at implementation and still be wrong about the product.

GuessBench is designed to test the layer ordinary software tests often miss:

> **Did the agent have evidence-backed authority for the requirement it implemented?**
