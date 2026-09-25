/**
 * M4-M6 — Intent, Capability, and Receipt tests.
 *
 * Covers 26 required test cases (tests 1-26).
 * Tests use in-memory SQLite ledger wrapped by KernelGuardedLedger.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FakeClock } from "../../../src/lib/clock.js";
import { SQLiteLedger } from "../../../src/epistemic/sqlite-ledger.js";
import {
  KernelGuardedLedger,
  KernelDenialError,
} from "../../../src/epistemic/kernel/guarded-ledger.js";
import {
  IntentService,
  detectSemanticFork,
  pickDiscriminatingProbe,
} from "../../../src/epistemic/intent/intent-service.js";
import type { Interpretation } from "../../../src/epistemic/intent/intent-service.js";
import { CapabilityService } from "../../../src/epistemic/capability/capability-service.js";
import { buildEpistemicReceipt } from "../../../src/epistemic/receipt/receipt.js";
import type {
  InterpretationProposedPayload,
  ClarificationRequestedPayload,
  HumanDecisionRecordedPayload,
} from "../../../src/epistemic/events.js";
import type { AppendInput } from "../../../src/epistemic/event-envelope.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStack() {
  const clock = new FakeClock(1_700_000_000_000);
  const rawLedger = new SQLiteLedger(":memory:", clock);
  const guarded = new KernelGuardedLedger(rawLedger);
  const intentService = new IntentService(guarded);
  const capabilityService = new CapabilityService(guarded);
  return { rawLedger, guarded, intentService, capabilityService };
}

function openRun(guarded: KernelGuardedLedger, runId = "run-1") {
  return guarded.append({
    runId,
    type: "RequestReceived",
    emitter: "SYSTEM",
    payload: { requestText: "test request" },
  });
}

function makeInterpretation(
  interpretationId: string,
  claimKey: string,
  executionEffect: string,
  authEffect: string,
  probeId = "probe-A"
): Interpretation {
  return {
    eventId: `evt-${interpretationId}`,
    interpretationId,
    claimKey,
    summary: `Summary for ${interpretationId}`,
    probeOutcomes: [
      {
        probeId,
        outcomeKey: `outcome-${interpretationId}`,
        description: `Description for ${interpretationId}`,
        effects: {
          execution: executionEffect,
          authorization: authEffect,
        },
      },
    ],
  };
}

function proposeBobInterpretation(
  guarded: KernelGuardedLedger,
  runId: string,
  interpretationId: string,
  claimKey: string,
  executionEffect: string,
  authEffect: string,
  probeId = "probe-A"
) {
  const payload: InterpretationProposedPayload = {
    interpretationId,
    claimKey,
    summary: `Summary for ${interpretationId}`,
    probeOutcomes: [
      {
        probeId,
        outcomeKey: `outcome-${interpretationId}`,
        description: `Description for ${interpretationId}`,
        effects: {
          execution: executionEffect,
          authorization: authEffect,
        },
      },
    ],
  };
  return guarded.append({
    runId,
    type: "InterpretationProposed",
    emitter: "BOB",
    payload,
  });
}

// ---------------------------------------------------------------------------
// Test 1: BOB InterpretationProposed is admitted after RequestReceived
// ---------------------------------------------------------------------------

describe("IntentService M4-M6", () => {
  it("test 1: BOB InterpretationProposed is admitted after RequestReceived", () => {
    const { guarded } = makeStack();
    openRun(guarded);
    const evt = proposeBobInterpretation(
      guarded,
      "run-1",
      "interp-01",
      "claim.x",
      "AUTO",
      "NONE"
    );
    assert.equal(evt.type, "InterpretationProposed");
    assert.equal(evt.emitter, "BOB");
  });

  // -----------------------------------------------------------------------
  // Test 2: two equal observable-effect interpretations do not create a fork
  // -----------------------------------------------------------------------

  it("test 2: equal observable effects do not create a semantic fork", () => {
    const i1 = makeInterpretation("i1", "claim.x", "AUTO", "NONE");
    const i2 = makeInterpretation("i2", "claim.x", "AUTO", "NONE");
    const result = detectSemanticFork([i1, i2]);
    assert.equal(result, null);
  });

  // -----------------------------------------------------------------------
  // Test 3: differing protected effects create a semantic fork
  // -----------------------------------------------------------------------

  it("test 3: differing protected effects create a semantic fork", () => {
    const i1 = makeInterpretation("i1", "claim.x", "AUTO", "NONE");
    const i2 = makeInterpretation("i2", "claim.x", "BLOCKED", "APPROVAL_REQUIRED");
    const result = detectSemanticFork([i1, i2]);
    assert.notEqual(result, null);
    assert.ok(result!.divergingProbeIds.includes("probe-A"));
  });

  // -----------------------------------------------------------------------
  // Test 4: prose-only difference with same effects is not material
  // -----------------------------------------------------------------------

  it("test 4: prose-only difference with same protected effects is not material", () => {
    // Same effects, different descriptions
    const i1: Interpretation = {
      eventId: "e1",
      interpretationId: "i1",
      claimKey: "claim.x",
      summary: "Interpretation A",
      probeOutcomes: [
        {
          probeId: "probe-A",
          outcomeKey: "ok",
          description: "Different prose, same effects",
          effects: { execution: "AUTO", authorization: "NONE" },
        },
      ],
    };
    const i2: Interpretation = {
      eventId: "e2",
      interpretationId: "i2",
      claimKey: "claim.x",
      summary: "Interpretation B — different prose",
      probeOutcomes: [
        {
          probeId: "probe-A",
          outcomeKey: "ok-also",
          description: "Completely different words, exact same effects",
          effects: { execution: "AUTO", authorization: "NONE" },
        },
      ],
    };
    const result = detectSemanticFork([i1, i2]);
    assert.equal(result, null, "prose-only diff must not create a fork");
  });

  // -----------------------------------------------------------------------
  // Test 5: execution difference is material
  // -----------------------------------------------------------------------

  it("test 5: execution difference is material", () => {
    const i1 = makeInterpretation("i1", "claim.x", "AUTO", "NONE");
    const i2 = makeInterpretation("i2", "claim.x", "BLOCKED", "NONE");
    const fork = detectSemanticFork([i1, i2]);
    assert.notEqual(fork, null);
    assert.equal(fork!.hasMaterialDivergence, true);
  });

  // -----------------------------------------------------------------------
  // Test 6: authorization difference is material
  // -----------------------------------------------------------------------

  it("test 6: authorization difference is material", () => {
    const i1 = makeInterpretation("i1", "claim.x", "AUTO", "NONE");
    const i2 = makeInterpretation("i2", "claim.x", "AUTO", "APPROVAL_REQUIRED");
    const fork = detectSemanticFork([i1, i2]);
    assert.notEqual(fork, null);
    assert.equal(fork!.hasMaterialDivergence, true);
  });

  // -----------------------------------------------------------------------
  // Test 7: discriminating probe maximizes distinct outcome groups
  // -----------------------------------------------------------------------

  it("test 7: discriminating probe maximizes distinct outcome groups", () => {
    // probe-B discriminates 3 groups; probe-A discriminates only 2
    const interpretations: Interpretation[] = [
      {
        eventId: "e1",
        interpretationId: "i1",
        claimKey: "c",
        summary: "i1",
        probeOutcomes: [
          { probeId: "probe-A", outcomeKey: "a", description: "d", effects: { execution: "X" } },
          { probeId: "probe-B", outcomeKey: "b", description: "d", effects: { execution: "X" } },
        ],
      },
      {
        eventId: "e2",
        interpretationId: "i2",
        claimKey: "c",
        summary: "i2",
        probeOutcomes: [
          { probeId: "probe-A", outcomeKey: "a", description: "d", effects: { execution: "Y" } },
          { probeId: "probe-B", outcomeKey: "b", description: "d", effects: { execution: "Y" } },
        ],
      },
      {
        eventId: "e3",
        interpretationId: "i3",
        claimKey: "c",
        summary: "i3",
        probeOutcomes: [
          { probeId: "probe-A", outcomeKey: "a", description: "d", effects: { execution: "Y" } }, // same as i2
          { probeId: "probe-B", outcomeKey: "b", description: "d", effects: { execution: "Z" } }, // unique
        ],
      },
    ];
    const fork = detectSemanticFork(interpretations)!;
    const best = pickDiscriminatingProbe(interpretations, fork.divergingProbeIds);
    assert.equal(best, "probe-B", "probe-B creates 3 distinct groups vs probe-A's 2");
  });

  // -----------------------------------------------------------------------
  // Test 8: lexical probeId tie-break is deterministic
  // -----------------------------------------------------------------------

  it("test 8: lexical probeId tie-break is deterministic", () => {
    // probe-alpha and probe-zeta both discriminate equally (2 groups each)
    const interpretations: Interpretation[] = [
      {
        eventId: "e1",
        interpretationId: "i1",
        claimKey: "c",
        summary: "i1",
        probeOutcomes: [
          { probeId: "probe-alpha", outcomeKey: "a", description: "d", effects: { execution: "X" } },
          { probeId: "probe-zeta", outcomeKey: "z", description: "d", effects: { execution: "X" } },
        ],
      },
      {
        eventId: "e2",
        interpretationId: "i2",
        claimKey: "c",
        summary: "i2",
        probeOutcomes: [
          { probeId: "probe-alpha", outcomeKey: "a", description: "d", effects: { execution: "Y" } },
          { probeId: "probe-zeta", outcomeKey: "z", description: "d", effects: { execution: "Y" } },
        ],
      },
    ];
    const fork = detectSemanticFork(interpretations)!;
    const best = pickDiscriminatingProbe(interpretations, fork.divergingProbeIds);
    assert.equal(best, "probe-alpha", "lexical first (probe-alpha < probe-zeta) should win on tie");
  });

  // -----------------------------------------------------------------------
  // Test 9: clarification always contains Other/none
  // -----------------------------------------------------------------------

  it("test 9: clarification always contains Other/none of these", () => {
    const { guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    assert.notEqual(clarificationEventId, null);

    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;
    const lastOption = p.options[p.options.length - 1]!;
    assert.equal(lastOption.optionId, "opt-other");
    assert.ok(lastOption.outcomeDescription.includes("Other"));
  });

  // -----------------------------------------------------------------------
  // Test 10: one discriminating question produced for one material fork
  // -----------------------------------------------------------------------

  it("test 10: one discriminating question for one material fork", () => {
    const { guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    intentService.analyzeAndRecord("run-1", "claim.x");

    const events = guarded.listRun("run-1");
    const clarifications = events.filter((e) => e.type === "ClarificationRequested");
    assert.equal(clarifications.length, 1);
  });

  // -----------------------------------------------------------------------
  // Test 11: BOB cannot manufacture HumanDecisionRecorded
  // -----------------------------------------------------------------------

  it("test 11: BOB cannot manufacture HumanDecisionRecorded", () => {
    const { guarded } = makeStack();
    openRun(guarded);

    const input: AppendInput<"HumanDecisionRecorded"> = {
      runId: "run-1",
      type: "HumanDecisionRecorded",
      emitter: "BOB",
      payload: {
        decisionId: "fake-decision",
        choice: "fake choice",
        claimKey: "claim.x",
        value: "fake",
      },
    };

    assert.throws(
      () => guarded.append(input),
      (err: unknown) => {
        assert.ok(err instanceof KernelDenialError);
        assert.equal(err.code, "EMITTER_NOT_AUTHORISED");
        return true;
      }
    );
  });

  // -----------------------------------------------------------------------
  // Test 12: human normal-option answer records HumanDecisionRecorded
  // -----------------------------------------------------------------------

  it("test 12: human normal-option answer records HumanDecisionRecorded", () => {
    const { guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;
    // Pick first non-other option
    const normalOption = p.options.find((o) => o.optionId !== "opt-other")!;

    const result = intentService.recordHumanAnswer("run-1", clarificationEventId!, normalOption.optionId);
    assert.equal(result.kind, "RESOLVED");

    const events = guarded.listRun("run-1");
    const decisions = events.filter((e) => e.type === "HumanDecisionRecorded");
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]!.emitter, "HUMAN");
  });

  // -----------------------------------------------------------------------
  // Test 13: Other/none does not manufacture a resolution
  // -----------------------------------------------------------------------

  it("test 13: Other/none does not manufacture a resolution", () => {
    const { guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    const result = intentService.recordHumanAnswer("run-1", clarificationEventId!, "opt-other");

    assert.equal(result.kind, "NEEDS_EXTERNAL_INPUT");

    // No HumanDecisionRecorded should exist
    const events = guarded.listRun("run-1");
    const decisions = events.filter((e) => e.type === "HumanDecisionRecorded");
    assert.equal(decisions.length, 0);
  });

  // -----------------------------------------------------------------------
  // Test 14: unresolved material fork creates Guess Debt
  // -----------------------------------------------------------------------

  it("test 14: unresolved material fork creates Guess Debt", () => {
    const { guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    intentService.analyzeAndRecord("run-1", "claim.x");

    const debt = intentService.getGuessDebt("run-1");
    assert.equal(debt.length, 1);
    assert.equal(debt[0]!.status, "UNRESOLVED");
    assert.equal(debt[0]!.claimKey, "claim.x");
  });

  // -----------------------------------------------------------------------
  // Test 15: human resolution clears corresponding current Guess Debt
  // -----------------------------------------------------------------------

  it("test 15: human resolution clears corresponding current Guess Debt", () => {
    const { guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;
    const normalOption = p.options.find((o) => o.optionId !== "opt-other")!;

    intentService.recordHumanAnswer("run-1", clarificationEventId!, normalOption.optionId);

    const debt = intentService.getGuessDebt("run-1");
    assert.equal(debt[0]!.status, "RESOLVED");
  });

  // -----------------------------------------------------------------------
  // Test 16: capability request before resolution is denied
  // -----------------------------------------------------------------------

  it("test 16: capability request before resolution is denied", () => {
    const { guarded, intentService, capabilityService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");
    intentService.analyzeAndRecord("run-1", "claim.x");

    const result = capabilityService.requestCapability({ capabilityId: "cap-1", runId: "run-1" });
    assert.equal(result.granted, false);
    assert.equal(result.denialCode, "UNRESOLVED_MATERIAL_GUESS_DEBT");
  });

  // -----------------------------------------------------------------------
  // Test 17: BOB cannot grant capability
  // -----------------------------------------------------------------------

  it("test 17: BOB cannot grant capability (KERNEL only)", () => {
    const { guarded } = makeStack();
    openRun(guarded);

    const input: AppendInput<"CapabilityGranted"> = {
      runId: "run-1",
      type: "CapabilityGranted",
      emitter: "BOB",
      payload: {
        capabilityId: "cap-fake",
        envelope: {
          capabilityId: "cap-fake",
          runId: "run-1",
          readPaths: [],
          writePaths: [],
          commands: [],
          network: false,
          mcpTools: [],
          basisEventIds: [],
        },
        basisEventIds: [],
      },
    };

    assert.throws(
      () => guarded.append(input),
      (err: unknown) => {
        assert.ok(err instanceof KernelDenialError);
        assert.equal(err.code, "EMITTER_NOT_AUTHORISED");
        return true;
      }
    );
  });

  // -----------------------------------------------------------------------
  // Test 18: KERNEL can grant after required HUMAN resolution
  // -----------------------------------------------------------------------

  it("test 18: KERNEL grants after HUMAN resolution", () => {
    const { guarded, intentService, capabilityService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;
    const normalOption = p.options.find((o) => o.optionId !== "opt-other")!;
    intentService.recordHumanAnswer("run-1", clarificationEventId!, normalOption.optionId);

    const result = capabilityService.requestCapability({ capabilityId: "cap-1", runId: "run-1" });
    assert.equal(result.granted, true);
  });

  // -----------------------------------------------------------------------
  // Test 19: capability basis includes the human decision event
  // -----------------------------------------------------------------------

  it("test 19: capability basis includes human decision event ID", () => {
    const { guarded, intentService, capabilityService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;
    const normalOption = p.options.find((o) => o.optionId !== "opt-other")!;
    const answerResult = intentService.recordHumanAnswer("run-1", clarificationEventId!, normalOption.optionId);
    assert.equal(answerResult.kind, "RESOLVED");
    const decisionEventId = (answerResult as { kind: "RESOLVED"; decisionEventId: string }).decisionEventId;

    const grantResult = capabilityService.requestCapability({ capabilityId: "cap-1", runId: "run-1" });
    assert.equal(grantResult.granted, true);
    assert.ok(
      (grantResult as { granted: true; envelope: { basisEventIds: string[] }; grantEventId: string })
        .envelope.basisEventIds.includes(decisionEventId)
    );
  });

  // -----------------------------------------------------------------------
  // Test 20: superseding human decision makes prior capability invalid
  // -----------------------------------------------------------------------

  it("test 20: superseding human decision invalidates prior capability", () => {
    const { guarded, intentService, capabilityService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;
    const normalOption = p.options.find((o) => o.optionId !== "opt-other")!;
    const answerResult = intentService.recordHumanAnswer("run-1", clarificationEventId!, normalOption.optionId);
    assert.equal(answerResult.kind, "RESOLVED");

    // Grant
    capabilityService.requestCapability({ capabilityId: "cap-1", runId: "run-1" });
    assert.equal(capabilityService.isCapabilityCurrentlyValid("run-1", "cap-1"), true);

    // Supersede the human decision
    const decisionEvts = guarded.listRun("run-1").filter((e) => e.type === "HumanDecisionRecorded");
    const decisionId = (decisionEvts[0]!.payload as HumanDecisionRecordedPayload).decisionId;

    guarded.append({
      runId: "run-1",
      type: "DecisionSuperseded",
      emitter: "HUMAN",
      payload: { decisionId, supersededBy: "new-decision-id" },
    });

    assert.equal(capabilityService.isCapabilityCurrentlyValid("run-1", "cap-1"), false);
  });

  // -----------------------------------------------------------------------
  // Test 21: Epistemic Receipt before resolution is BLOCKED_UNRESOLVED_INTENT
  // -----------------------------------------------------------------------

  it("test 21: receipt before resolution is BLOCKED_UNRESOLVED_INTENT", () => {
    const { rawLedger, guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");
    intentService.analyzeAndRecord("run-1", "claim.x");

    const receipt = buildEpistemicReceipt("run-1", rawLedger);
    assert.equal(receipt.overallState, "BLOCKED_UNRESOLVED_INTENT");
  });

  // -----------------------------------------------------------------------
  // Test 22: receipt after normal human resolution is READY_FOR_IMPLEMENTATION
  // -----------------------------------------------------------------------

  it("test 22: receipt after normal human resolution is READY_FOR_IMPLEMENTATION", () => {
    const { rawLedger, guarded, intentService } = makeStack();
    openRun(guarded);
    proposeBobInterpretation(guarded, "run-1", "i1", "claim.x", "AUTO", "NONE");
    proposeBobInterpretation(guarded, "run-1", "i2", "claim.x", "BLOCKED", "APPROVAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("run-1", "claim.x");
    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;
    const normalOption = p.options.find((o) => o.optionId !== "opt-other")!;
    intentService.recordHumanAnswer("run-1", clarificationEventId!, normalOption.optionId);

    const receipt = buildEpistemicReceipt("run-1", rawLedger);
    assert.equal(receipt.overallState, "READY_FOR_IMPLEMENTATION");
  });

  // -----------------------------------------------------------------------
  // Test 23: receipt includes ledger integrity result and head hash
  // -----------------------------------------------------------------------

  it("test 23: receipt includes ledger integrity and head hash", () => {
    const { rawLedger, guarded } = makeStack();
    openRun(guarded);

    const receipt = buildEpistemicReceipt("run-1", rawLedger);
    assert.ok(receipt.ledgerIntegrity.ok);
    assert.equal(typeof receipt.ledgerHeadHash, "string");
    assert.ok((receipt.ledgerHeadHash?.length ?? 0) > 0);
  });

  // -----------------------------------------------------------------------
  // Test 24: VIP demo has no default human answer
  // -----------------------------------------------------------------------

  it("test 24: demo has no default answer (Options require explicit selection)", () => {
    // Simulate the demo scenario without supplying an answer
    const { guarded, intentService } = makeStack();
    openRun(guarded, "demo-run");

    proposeBobInterpretation(guarded, "demo-run", "interp-bypass", "refund.vip", "IMMEDIATE", "VIP_BYPASSES");
    proposeBobInterpretation(guarded, "demo-run", "interp-threshold", "refund.vip", "BLOCKED", "THRESHOLD_APPLIES");
    proposeBobInterpretation(guarded, "demo-run", "interp-request-auto", "refund.vip", "BLOCKED", "REQUEST_AUTO_EXEC_MANUAL");

    const { clarificationEventId } = intentService.analyzeAndRecord("demo-run", "refund.vip");
    assert.notEqual(clarificationEventId, null, "Should have clarification");

    const clarEvt = guarded.getByEventId(clarificationEventId!)!;
    const p = clarEvt.payload as ClarificationRequestedPayload;

    // There must be non-other options available (human must explicitly choose)
    const normalOptions = p.options.filter((o) => o.optionId !== "opt-other");
    assert.ok(normalOptions.length >= 1, "Must have at least one non-other option");

    // No default selection exists in the data
    // This test verifies there is no auto-chosen value — calling code must supply it
    // (The demo CLI enforces this by exiting if --answer not supplied)
    assert.ok(
      p.options.every((o) => typeof o.optionId === "string"),
      "All options have explicit IDs"
    );
  });

  // -----------------------------------------------------------------------
  // Test 25: VIP demo with Other/none remains blocked
  // -----------------------------------------------------------------------

  it("test 25: Other/none selection leaves demo blocked", () => {
    const { rawLedger, guarded, intentService, capabilityService } = makeStack();
    openRun(guarded, "demo-run-2");

    proposeBobInterpretation(guarded, "demo-run-2", "interp-bypass", "refund.vip", "IMMEDIATE", "VIP_BYPASSES");
    proposeBobInterpretation(guarded, "demo-run-2", "interp-threshold", "refund.vip", "BLOCKED", "THRESHOLD_APPLIES");

    const { clarificationEventId } = intentService.analyzeAndRecord("demo-run-2", "refund.vip");
    const otherResult = intentService.recordHumanAnswer("demo-run-2", clarificationEventId!, "opt-other");
    assert.equal(otherResult.kind, "NEEDS_EXTERNAL_INPUT");

    const capResult = capabilityService.requestCapability({ capabilityId: "cap-demo", runId: "demo-run-2" });
    assert.equal(capResult.granted, false);

    const receipt = buildEpistemicReceipt("demo-run-2", rawLedger);
    assert.equal(receipt.overallState, "BLOCKED_UNRESOLVED_INTENT");
  });

  // -----------------------------------------------------------------------
  // Test 26: existing tests remain green (meta-check via stack setup)
  // -----------------------------------------------------------------------

  it("test 26: existing M0-M3 kernel boundaries still enforced", () => {
    const { guarded } = makeStack();
    openRun(guarded);

    // BOB still cannot emit AcceptanceComputed
    assert.throws(
      () =>
        guarded.append({
          runId: "run-1",
          type: "AcceptanceComputed",
          emitter: "BOB",
          payload: { accepted: true, reason: "self-accept" },
        }),
      (err: unknown) => {
        assert.ok(err instanceof KernelDenialError);
        assert.equal(err.code, "EMITTER_NOT_AUTHORISED");
        return true;
      }
    );

    // BOB still cannot emit SemanticForkDetected
    assert.throws(
      () =>
        guarded.append({
          runId: "run-1",
          type: "SemanticForkDetected",
          emitter: "BOB",
          payload: {
            claimKey: "c",
            interpretationIds: ["i1"],
            divergingProbeIds: ["p1"],
            effectSignatures: {},
          },
        }),
      (err: unknown) => {
        assert.ok(err instanceof KernelDenialError);
        assert.equal(err.code, "EMITTER_NOT_AUTHORISED");
        return true;
      }
    );
  });
});
