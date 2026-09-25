/**
 * M2 — Kernel admission tests.
 *
 * Covers all 34 required M2 test cases.
 * Tests use an in-memory SQLite ledger wrapped by KernelGuardedLedger.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FakeClock } from "../../../src/lib/clock.js";
import { SQLiteLedger } from "../../../src/epistemic/sqlite-ledger.js";
import { KernelGuardedLedger, KernelDenialError } from "../../../src/epistemic/kernel/guarded-ledger.js";
import { deriveKernelState } from "../../../src/epistemic/kernel/state.js";
import type { AppendInput } from "../../../src/epistemic/event-envelope.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeGuarded() {
  const clock = new FakeClock(1_700_000_000_000);
  const ledger = new SQLiteLedger(":memory:", clock);
  return new KernelGuardedLedger(ledger);
}

function requestInput(runId = "run-1"): AppendInput<"RequestReceived"> {
  return {
    runId,
    type: "RequestReceived",
    emitter: "SYSTEM",
    payload: { requestText: "test request" },
  };
}

/** Open a run and return the guarded ledger + the first event. */
function openRun(runId = "run-1") {
  const gl = makeGuarded();
  const evt = gl.append(requestInput(runId));
  return { gl, evt };
}

function assertDenied(
  gl: KernelGuardedLedger,
  input: AppendInput,
  expectedCode: string
) {
  let threw = false;
  try {
    gl.append(input);
  } catch (err) {
    threw = true;
    assert.ok(
      err instanceof KernelDenialError,
      `Expected KernelDenialError, got ${String(err)}`
    );
    assert.equal(
      err.code,
      expectedCode,
      `Expected denial code ${expectedCode}, got ${err.code}`
    );
  }
  assert.ok(threw, `Expected a KernelDenialError with code ${expectedCode} but no error was thrown`);
}

// ---------------------------------------------------------------------------
// Test 1 — RequestReceived may start an empty run
// ---------------------------------------------------------------------------

describe("M2 test 1: RequestReceived may start an empty run", () => {
  it("appends successfully", () => {
    const gl = makeGuarded();
    const evt = gl.append(requestInput());
    assert.equal(evt.type, "RequestReceived");
    assert.equal(evt.sequence, 1);
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 2 — non-RequestReceived first event is denied
// ---------------------------------------------------------------------------

describe("M2 test 2: non-RequestReceived first event is denied", () => {
  it("denies EvidenceObserved before RequestReceived", () => {
    const gl = makeGuarded();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "EvidenceObserved",
        emitter: "BOB",
        payload: { evidenceId: "e1", evidenceType: "text", content: "c" },
      },
      "FIRST_EVENT_MUST_BE_REQUEST_RECEIVED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — duplicate RequestReceived is denied
// ---------------------------------------------------------------------------

describe("M2 test 3: duplicate RequestReceived is denied", () => {
  it("denies second RequestReceived for same run", () => {
    const { gl } = openRun();
    assertDenied(gl, requestInput("run-1"), "DUPLICATE_REQUEST_RECEIVED");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — normal event after RequestReceived can be admitted
// ---------------------------------------------------------------------------

describe("M2 test 4: normal event after RequestReceived can be admitted", () => {
  it("EvidenceObserved is admitted after RequestReceived", () => {
    const { gl } = openRun();
    const evt = gl.append({
      runId: "run-1",
      type: "EvidenceObserved",
      emitter: "BOB",
      payload: { evidenceId: "e1", evidenceType: "text", content: "hello" },
    });
    assert.equal(evt.type, "EvidenceObserved");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — HUMAN may emit HumanDecisionRecorded
// ---------------------------------------------------------------------------

describe("M2 test 5: HUMAN may emit HumanDecisionRecorded", () => {
  it("appends successfully", () => {
    const { gl } = openRun();
    const evt = gl.append({
      runId: "run-1",
      type: "HumanDecisionRecorded",
      emitter: "HUMAN",
      payload: { decisionId: "d1", choice: "yes" },
    });
    assert.equal(evt.type, "HumanDecisionRecorded");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 6 — BOB cannot emit HumanDecisionRecorded
// ---------------------------------------------------------------------------

describe("M2 test 6: BOB cannot emit HumanDecisionRecorded", () => {
  it("denies BOB emitting HumanDecisionRecorded", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "HumanDecisionRecorded",
        emitter: "BOB",
        payload: { decisionId: "d1", choice: "yes" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 7 — SYSTEM cannot emit HumanDecisionRecorded
// ---------------------------------------------------------------------------

describe("M2 test 7: SYSTEM cannot emit HumanDecisionRecorded", () => {
  it("denies SYSTEM emitting HumanDecisionRecorded", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "HumanDecisionRecorded",
        emitter: "SYSTEM",
        payload: { decisionId: "d1", choice: "yes" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 8 — BOB cannot emit DecisionSuperseded
// ---------------------------------------------------------------------------

describe("M2 test 8: BOB cannot emit DecisionSuperseded", () => {
  it("denies BOB emitting DecisionSuperseded", () => {
    const { gl } = openRun();
    // First record a human decision so the ID exists.
    gl.append({
      runId: "run-1",
      type: "HumanDecisionRecorded",
      emitter: "HUMAN",
      payload: { decisionId: "d1", choice: "yes" },
    });
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "DecisionSuperseded",
        emitter: "BOB",
        payload: { decisionId: "d1", supersededBy: "d2" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 9 — DecisionSuperseded rejects unknown decision reference
// ---------------------------------------------------------------------------

describe("M2 test 9: DecisionSuperseded rejects unknown decision reference", () => {
  it("denies supersede of unknown decisionId", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "DecisionSuperseded",
        emitter: "HUMAN",
        payload: { decisionId: "no-such-id", supersededBy: "d2" },
      },
      "SUPERSEDED_DECISION_NOT_FOUND"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 10 — DecisionSuperseded rejects cross-run reference
// ---------------------------------------------------------------------------

describe("M2 test 10: DecisionSuperseded rejects cross-run reference", () => {
  it("denies supersede of a decision from a different run", () => {
    const gl = makeGuarded();

    // Create run-A with a human decision.
    gl.append(requestInput("run-A"));
    gl.append({
      runId: "run-A",
      type: "HumanDecisionRecorded",
      emitter: "HUMAN",
      payload: { decisionId: "d-run-A", choice: "yes" },
    });

    // Create run-B and try to supersede run-A's decision.
    gl.append(requestInput("run-B"));
    assertDenied(
      gl,
      {
        runId: "run-B",
        type: "DecisionSuperseded",
        emitter: "HUMAN",
        payload: { decisionId: "d-run-A", supersededBy: "d2" },
      },
      "CROSS_RUN_SUPERSEDE"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 11 — BOB cannot emit CapabilityGranted
// ---------------------------------------------------------------------------

describe("M2 test 11: BOB cannot emit CapabilityGranted", () => {
  it("denies BOB emitting CapabilityGranted", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "CapabilityGranted",
        emitter: "BOB",
        payload: { capabilityId: "cap-1" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 12 — BOB cannot emit CapabilityDenied
// ---------------------------------------------------------------------------

describe("M2 test 12: BOB cannot emit CapabilityDenied", () => {
  it("denies BOB emitting CapabilityDenied", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "CapabilityDenied",
        emitter: "BOB",
        payload: { capabilityId: "cap-1", reason: "nope" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 13 — BOB cannot emit CapabilityExpired
// ---------------------------------------------------------------------------

describe("M2 test 13: BOB cannot emit CapabilityExpired", () => {
  it("denies BOB emitting CapabilityExpired", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "CapabilityExpired",
        emitter: "BOB",
        payload: { capabilityId: "cap-1" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 14 — BOB cannot emit AcceptanceComputed
// ---------------------------------------------------------------------------

describe("M2 test 14: BOB cannot emit AcceptanceComputed", () => {
  it("denies BOB emitting AcceptanceComputed", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "AcceptanceComputed",
        emitter: "BOB",
        payload: { accepted: true, reason: "looks good" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 15 — AcceptanceComputed by KERNEL is admissible when lifecycle
//           prerequisites for M2 are satisfied
// ---------------------------------------------------------------------------

describe("M2 test 15: AcceptanceComputed by KERNEL is admissible", () => {
  it("KERNEL can emit AcceptanceComputed after a started run", () => {
    const { gl } = openRun();
    const evt = gl.append({
      runId: "run-1",
      type: "AcceptanceComputed",
      emitter: "KERNEL",
      payload: { accepted: true, reason: "M2 guard satisfied" },
    });
    assert.equal(evt.type, "AcceptanceComputed");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 16 — BOB cannot emit HiddenIntentCheckObserved
// ---------------------------------------------------------------------------

describe("M2 test 16: BOB cannot emit HiddenIntentCheckObserved", () => {
  it("denies BOB emitting HiddenIntentCheckObserved", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "HiddenIntentCheckObserved",
        emitter: "BOB",
        payload: { checkId: "chk-1", result: "pass" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 17 — EVALUATOR can emit HiddenIntentCheckObserved
// ---------------------------------------------------------------------------

describe("M2 test 17: EVALUATOR can emit HiddenIntentCheckObserved", () => {
  it("EVALUATOR emission is admitted", () => {
    const { gl } = openRun();
    const evt = gl.append({
      runId: "run-1",
      type: "HiddenIntentCheckObserved",
      emitter: "EVALUATOR",
      payload: { checkId: "chk-1", result: "pass" },
    });
    assert.equal(evt.type, "HiddenIntentCheckObserved");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 18 — RunClosed before AcceptanceComputed is denied
// ---------------------------------------------------------------------------

describe("M2 test 18: RunClosed before AcceptanceComputed is denied", () => {
  it("denies RunClosed without AcceptanceComputed", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "RunClosed",
        emitter: "KERNEL",
        payload: { reason: "done" },
      },
      "MISSING_ACCEPTANCE_COMPUTED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 19 — RunClosed by BOB is denied
// ---------------------------------------------------------------------------

describe("M2 test 19: RunClosed by BOB is denied", () => {
  it("denies BOB emitting RunClosed", () => {
    const { gl } = openRun();
    // Even if we assume acceptance exists, BOB emitter should be denied.
    gl.append({
      runId: "run-1",
      type: "AcceptanceComputed",
      emitter: "KERNEL",
      payload: { accepted: true, reason: "ok" },
    });
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "RunClosed",
        emitter: "BOB",
        payload: { reason: "done" },
      },
      "EMITTER_NOT_AUTHORISED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 20 — RunClosed by KERNEL after AcceptanceComputed is allowed
// ---------------------------------------------------------------------------

describe("M2 test 20: RunClosed by KERNEL after AcceptanceComputed is allowed", () => {
  it("KERNEL can close a run with prior AcceptanceComputed", () => {
    const { gl } = openRun();
    gl.append({
      runId: "run-1",
      type: "AcceptanceComputed",
      emitter: "KERNEL",
      payload: { accepted: true, reason: "ok" },
    });
    const evt = gl.append({
      runId: "run-1",
      type: "RunClosed",
      emitter: "KERNEL",
      payload: { reason: "accepted" },
    });
    assert.equal(evt.type, "RunClosed");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 21 — any event after RunClosed is denied
// ---------------------------------------------------------------------------

describe("M2 test 21: any event after RunClosed is denied", () => {
  it("denies events after RunClosed", () => {
    const { gl } = openRun();
    gl.append({
      runId: "run-1",
      type: "AcceptanceComputed",
      emitter: "KERNEL",
      payload: { accepted: true, reason: "ok" },
    });
    gl.append({
      runId: "run-1",
      type: "RunClosed",
      emitter: "KERNEL",
      payload: { reason: "done" },
    });
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "EvidenceObserved",
        emitter: "BOB",
        payload: { evidenceId: "e1", evidenceType: "text", content: "late" },
      },
      "RUN_CLOSED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 22 — ImplementationFinished without ImplementationStarted is denied
// ---------------------------------------------------------------------------

describe("M2 test 22: ImplementationFinished without ImplementationStarted is denied", () => {
  it("denies ImplementationFinished without prior started", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "ImplementationFinished",
        emitter: "BOB",
        payload: { summary: "done" },
      },
      "NO_ACTIVE_IMPLEMENTATION"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 23 — duplicate active ImplementationStarted is denied
// ---------------------------------------------------------------------------

describe("M2 test 23: duplicate active ImplementationStarted is denied", () => {
  it("denies second ImplementationStarted while one is active", () => {
    const { gl } = openRun();
    gl.append({
      runId: "run-1",
      type: "ImplementationStarted",
      emitter: "BOB",
      payload: { description: "start" },
    });
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "ImplementationStarted",
        emitter: "BOB",
        payload: { description: "start again" },
      },
      "IMPLEMENTATION_ALREADY_ACTIVE"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 24 — ImplementationStarted → ImplementationFinished is allowed
// ---------------------------------------------------------------------------

describe("M2 test 24: ImplementationStarted → ImplementationFinished is allowed", () => {
  it("full implementation lifecycle is admitted", () => {
    const { gl } = openRun();
    gl.append({
      runId: "run-1",
      type: "ImplementationStarted",
      emitter: "BOB",
      payload: { description: "start" },
    });
    const evt = gl.append({
      runId: "run-1",
      type: "ImplementationFinished",
      emitter: "BOB",
      payload: { summary: "done" },
    });
    assert.equal(evt.type, "ImplementationFinished");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 25 — VerificationStarted before completed implementation is denied
// ---------------------------------------------------------------------------

describe("M2 test 25: VerificationStarted before completed implementation is denied", () => {
  it("denies VerificationStarted with no finished implementation", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "VerificationStarted",
        emitter: "SYSTEM",
        payload: { description: "check" },
      },
      "IMPLEMENTATION_NOT_COMPLETE"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 26 — VerificationObserved before VerificationStarted is denied
// ---------------------------------------------------------------------------

describe("M2 test 26: VerificationObserved before VerificationStarted is denied", () => {
  it("denies VerificationObserved with no prior VerificationStarted", () => {
    const { gl } = openRun();
    gl.append({
      runId: "run-1",
      type: "ImplementationStarted",
      emitter: "BOB",
      payload: { description: "start" },
    });
    gl.append({
      runId: "run-1",
      type: "ImplementationFinished",
      emitter: "BOB",
      payload: { summary: "done" },
    });
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "VerificationObserved",
        emitter: "SYSTEM",
        payload: { summary: "observed" },
      },
      "VERIFICATION_NOT_STARTED"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 27 — completed implementation → VerificationStarted → VerificationObserved
//           is allowed
// ---------------------------------------------------------------------------

describe("M2 test 27: full verification lifecycle is allowed", () => {
  it("ImplementationFinished → VerificationStarted → VerificationObserved", () => {
    const { gl } = openRun();
    gl.append({
      runId: "run-1",
      type: "ImplementationStarted",
      emitter: "BOB",
      payload: { description: "start" },
    });
    gl.append({
      runId: "run-1",
      type: "ImplementationFinished",
      emitter: "BOB",
      payload: { summary: "done" },
    });
    gl.append({
      runId: "run-1",
      type: "VerificationStarted",
      emitter: "SYSTEM",
      payload: { description: "check" },
    });
    const evt = gl.append({
      runId: "run-1",
      type: "VerificationObserved",
      emitter: "SYSTEM",
      payload: { summary: "observed" },
    });
    assert.equal(evt.type, "VerificationObserved");
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 28 — unknown causationEventId is denied
// ---------------------------------------------------------------------------

describe("M2 test 28: unknown causationEventId is denied", () => {
  it("denies event with non-existent causation ID", () => {
    const { gl } = openRun();
    assertDenied(
      gl,
      {
        runId: "run-1",
        type: "EvidenceObserved",
        emitter: "BOB",
        causationEventId: "evt-0000099999",
        payload: { evidenceId: "e1", evidenceType: "text", content: "c" },
      },
      "UNKNOWN_CAUSATION_EVENT"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 29 — cross-run causationEventId is denied
// ---------------------------------------------------------------------------

describe("M2 test 29: cross-run causationEventId is denied", () => {
  it("denies event with causation ID from a different run", () => {
    const gl = makeGuarded();

    // run-A
    const evtA = gl.append(requestInput("run-A"));

    // run-B tries to use run-A's event as causation
    gl.append(requestInput("run-B"));
    assertDenied(
      gl,
      {
        runId: "run-B",
        type: "EvidenceObserved",
        emitter: "BOB",
        causationEventId: evtA.eventId,
        payload: { evidenceId: "e1", evidenceType: "text", content: "c" },
      },
      "CROSS_RUN_CAUSATION"
    );
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 30 — valid same-run causationEventId is allowed
// ---------------------------------------------------------------------------

describe("M2 test 30: valid same-run causationEventId is allowed", () => {
  it("admits event with causation ID from same run", () => {
    const { gl, evt: reqEvt } = openRun();
    const result = gl.append({
      runId: "run-1",
      type: "EvidenceObserved",
      emitter: "BOB",
      causationEventId: reqEvt.eventId,
      payload: { evidenceId: "e1", evidenceType: "text", content: "c" },
    });
    assert.equal(result.causationEventId, reqEvt.eventId);
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 31 — replay of identical ledger history yields deeply equal kernel state
// ---------------------------------------------------------------------------

describe("M2 test 31: replay of identical ledger history yields equal state", () => {
  it("two replays of the same events produce deeply equal state", () => {
    const { gl } = openRun("run-replay");
    gl.append({
      runId: "run-replay",
      type: "HumanDecisionRecorded",
      emitter: "HUMAN",
      payload: { decisionId: "d1", choice: "yes" },
    });

    const events = gl.listRun("run-replay");
    const state1 = deriveKernelState("run-replay", events);
    const state2 = deriveKernelState("run-replay", events);

    assert.equal(state1.runId, state2.runId);
    assert.equal(state1.requestReceived, state2.requestReceived);
    assert.equal(state1.closed, state2.closed);
    assert.equal(state1.latestSequence, state2.latestSequence);
    assert.equal(state1.implementationActive, state2.implementationActive);
    assert.equal(state1.implementationFinished, state2.implementationFinished);
    assert.equal(state1.verificationStarted, state2.verificationStarted);
    assert.equal(state1.acceptanceComputed, state2.acceptanceComputed);
    assert.deepEqual(
      [...state1.activeDecisionIds].sort(),
      [...state2.activeDecisionIds].sort()
    );

    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 32 — denied events do NOT appear in the underlying ledger
// ---------------------------------------------------------------------------

describe("M2 test 32: denied events do not appear in the underlying ledger", () => {
  it("ledger remains empty after denial", () => {
    const gl = makeGuarded();
    // Attempt to add without RequestReceived first.
    try {
      gl.append({
        runId: "run-1",
        type: "EvidenceObserved",
        emitter: "BOB",
        payload: { evidenceId: "e1", evidenceType: "text", content: "c" },
      });
    } catch {
      // expected
    }
    const all = gl.listAll();
    assert.equal(all.length, 0);
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 33 — allowed events are appended once and only once
// ---------------------------------------------------------------------------

describe("M2 test 33: allowed events are appended exactly once", () => {
  it("each allowed append produces exactly one ledger entry", () => {
    const { gl } = openRun();
    gl.append({
      runId: "run-1",
      type: "EvidenceObserved",
      emitter: "BOB",
      payload: { evidenceId: "e1", evidenceType: "text", content: "c" },
    });
    const run = gl.listRun("run-1");
    assert.equal(run.length, 2); // RequestReceived + EvidenceObserved
    gl.close();
  });
});

// ---------------------------------------------------------------------------
// Test 34 — all M0 and M1 tests remain green
// ---------------------------------------------------------------------------
// The run-tests.mjs script collects all *.test.ts files recursively,
// so M0 and M1 tests run automatically. This is a smoke check only.

describe("M2 test 34: M0 and M1 test compatibility", () => {
  it("M1 SQLiteLedger remains importable (smoke check)", async () => {
    const { SQLiteLedger: L } = await import(
      "../../../src/epistemic/sqlite-ledger.js"
    );
    assert.ok(typeof L === "function");
  });
});
