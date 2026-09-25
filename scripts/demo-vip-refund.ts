#!/usr/bin/env node
/**
 * NoGuess VIP Refund Demo — M4-M6 Vertical Slice
 *
 * Usage:
 *   npm run demo:vip-refund                         # interactive — stops at clarification
 *   node --import tsx scripts/demo-vip-refund.ts --answer <option-id> # supply human answer non-interactively
 *
 * There is NO default answer. An answer MUST be supplied explicitly.
 *
 * This demo uses the existing M0 refund fixture domain.
 * Scenario: "Make VIP refunds automatic."
 *
 * The demo proves:
 *   - BOB proposes interpretations (never decides)
 *   - KERNEL detects semantic forks
 *   - KERNEL classifies materiality
 *   - KERNEL requests discriminating clarification
 *   - HUMAN (only) resolves
 *   - KERNEL grants capability after valid resolution
 *   - Epistemic Receipt is auditable at every stage
 */

import { SQLiteLedger } from "../src/epistemic/sqlite-ledger.js";
import { SystemClock } from "../src/lib/clock.js";
import { KernelGuardedLedger } from "../src/epistemic/kernel/guarded-ledger.js";
import { IntentService } from "../src/epistemic/intent/intent-service.js";
import { CapabilityService } from "../src/epistemic/capability/capability-service.js";
import { buildEpistemicReceipt } from "../src/epistemic/receipt/receipt.js";
import type {
  InterpretationProposedPayload,
  EvidenceObservedPayload,
} from "../src/epistemic/events.js";
import type { AppendInput } from "../src/epistemic/event-envelope.js";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const answerIndex = args.indexOf("--answer");
const equalsAnswer = args.find((arg) => arg.startsWith("--answer="));

const suppliedAnswer: string | undefined =
  answerIndex !== -1
    ? args[answerIndex + 1]
    : equalsAnswer !== undefined
      ? equalsAnswer.slice("--answer=".length)
      : undefined;

// ---------------------------------------------------------------------------
// Setup: in-memory ledger for demo
// ---------------------------------------------------------------------------

const rawLedger = new SQLiteLedger(":memory:", new SystemClock());
const guarded = new KernelGuardedLedger(rawLedger);
const intentService = new IntentService(guarded);
const capabilityService = new CapabilityService(guarded);

const RUN_ID = "demo-vip-refund-run-001";

// ---------------------------------------------------------------------------
// Helper: section header
// ---------------------------------------------------------------------------

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function bullet(label: string, value: string): void {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

// ---------------------------------------------------------------------------
// STEP 1: Record RequestReceived
// ---------------------------------------------------------------------------

section("STEP 1 — Request Received");

guarded.append({
  runId: RUN_ID,
  type: "RequestReceived",
  emitter: "SYSTEM",
  payload: { requestText: "Make VIP refunds automatic." },
});

console.log('  Request: "Make VIP refunds automatic."');

// ---------------------------------------------------------------------------
// STEP 2: SYSTEM observes grounded policy evidence
// ---------------------------------------------------------------------------

section("STEP 2 — Grounding Evidence (SYSTEM)");

const evidenceItems: AppendInput<"EvidenceObserved">[] = [
  {
    runId: RUN_ID,
    type: "EvidenceObserved",
    emitter: "SYSTEM",
    payload: {
      evidenceId: "ev-refund-auto-threshold",
      claimKey: "refund.automatic_approval_threshold_inr",
      value: 10000,
      epistemicState: "EXPLICIT",
      authorityClass: "VERSIONED_POLICY",
      sourceRef: "src/domain/refund.ts:AUTOMATIC_APPROVAL_THRESHOLD",
    } satisfies EvidenceObservedPayload,
  },
  {
    runId: RUN_ID,
    type: "EvidenceObserved",
    emitter: "SYSTEM",
    payload: {
      evidenceId: "ev-refund-approval-required",
      claimKey: "refund.above_threshold_requires_approval",
      value: true,
      epistemicState: "EXPLICIT",
      authorityClass: "VERSIONED_POLICY",
      sourceRef: "src/domain/refund.ts:requiresApproval",
    } satisfies EvidenceObservedPayload,
  },
  {
    runId: RUN_ID,
    type: "EvidenceObserved",
    emitter: "SYSTEM",
    payload: {
      evidenceId: "ev-vip-no-exemption",
      claimKey: "refund.vip_has_approval_exemption",
      value: false,
      epistemicState: "EXPLICIT",
      authorityClass: "VERSIONED_POLICY",
      sourceRef: "src/domain/refund.ts:VIP tier has no special refund exemption",
    } satisfies EvidenceObservedPayload,
  },
];

for (const item of evidenceItems) {
  guarded.append(item);
  const p = item.payload as EvidenceObservedPayload;
  bullet(`  ${p.claimKey}`, String(p.value));
}

// ---------------------------------------------------------------------------
// STEP 3: BOB proposes three interpretations
//
// These are PROPOSALS. BOB does not decide which is correct.
// ---------------------------------------------------------------------------

section("STEP 3 — BOB Proposes Interpretations");

const CLAIM_KEY = "refund.vip_automatic_behaviour";
const PROBE_ID = "probe-vip-15k-no-approval";

const interpretationPayloads: AppendInput<"InterpretationProposed">[] = [
  {
    runId: RUN_ID,
    type: "InterpretationProposed",
    emitter: "BOB",
    payload: {
      interpretationId: "interp-bypass-entirely",
      claimKey: CLAIM_KEY,
      summary: "VIP refunds bypass approval entirely (full exemption).",
      probeOutcomes: [
        {
          probeId: PROBE_ID,
          outcomeKey: "vip-bypass-approved",
          description:
            "A VIP customer requests ₹15,000 and no manager has approved it. " +
            "The refund executes automatically — the approval rule is skipped entirely.",
          effects: {
            execution: "IMMEDIATE_AUTOMATIC",
            authorization: "VIP_EXEMPTION_BYPASSES_APPROVAL",
            persistence: "REFUND_COMPLETED",
          },
        },
      ],
    } satisfies InterpretationProposedPayload,
  },
  {
    runId: RUN_ID,
    type: "InterpretationProposed",
    emitter: "BOB",
    payload: {
      interpretationId: "interp-threshold-only",
      claimKey: CLAIM_KEY,
      summary:
        "VIP refunds become automatic only where the existing ≤₹10,000 threshold already allows it.",
      probeOutcomes: [
        {
          probeId: PROBE_ID,
          outcomeKey: "vip-threshold-blocked",
          description:
            "A VIP customer requests ₹15,000 and no manager has approved it. " +
            "The refund is BLOCKED — existing threshold (₹10,000) still applies; VIP gets no extra benefit above threshold.",
          effects: {
            execution: "BLOCKED_PENDING_APPROVAL",
            authorization: "EXISTING_THRESHOLD_APPLIES",
            persistence: "REFUND_PENDING",
          },
        },
      ],
    } satisfies InterpretationProposedPayload,
  },
  {
    runId: RUN_ID,
    type: "InterpretationProposed",
    emitter: "BOB",
    payload: {
      interpretationId: "interp-request-auto-execution-manual",
      claimKey: CLAIM_KEY,
      summary:
        "VIP refund-request creation is automatic; execution still requires approval for >₹10,000.",
      probeOutcomes: [
        {
          probeId: PROBE_ID,
          outcomeKey: "vip-request-created-execution-blocked",
          description:
            "A VIP customer requests ₹15,000 and no manager has approved it. " +
            "The refund request is created automatically, but execution is BLOCKED until approved.",
          effects: {
            execution: "BLOCKED_PENDING_APPROVAL",
            authorization: "APPROVAL_STILL_REQUIRED_FOR_EXECUTION",
            persistence: "REFUND_REQUEST_CREATED_AWAITING_APPROVAL",
          },
        },
      ],
    } satisfies InterpretationProposedPayload,
  },
];

for (const item of interpretationPayloads) {
  guarded.append(item);
  const p = item.payload as InterpretationProposedPayload;
  console.log(`  [BOB PROPOSED] ${p.interpretationId}: ${p.summary}`);
}

// ---------------------------------------------------------------------------
// STEP 4: KERNEL analyses — fork detection, materiality, clarification
// ---------------------------------------------------------------------------

section("STEP 4 — KERNEL Analysis");

const { forkEventId, clarificationEventId } = intentService.analyzeAndRecord(
  RUN_ID,
  CLAIM_KEY
);

if (forkEventId !== null) {
  bullet("Semantic fork detected", forkEventId);
} else {
  console.log("  No semantic fork detected.");
}

// ---------------------------------------------------------------------------
// STEP 5: Show receipt BEFORE human resolution
// ---------------------------------------------------------------------------

section("STEP 5 — Epistemic Receipt BEFORE Human Resolution");

const receiptBefore = buildEpistemicReceipt(RUN_ID, rawLedger);

bullet("Overall state", receiptBefore.overallState);
bullet("Guess Debt items", String(receiptBefore.guessDebt.length));
bullet(
  "Unresolved Guess Debt",
  String(receiptBefore.guessDebt.filter((d) => d.status === "UNRESOLVED").length)
);
bullet("Interpretations", String(receiptBefore.interpretations.length));
bullet("Semantic forks", String(receiptBefore.semanticForks.length));
if (receiptBefore.materiality.length > 0) {
  bullet("Materiality", receiptBefore.materiality[0]!.classification);
}
if (receiptBefore.clarifications.length > 0) {
  const clar = receiptBefore.clarifications[0]!;
  bullet("Clarification", `${clar.questionId}`);
  bullet("Prompt", clar.prompt.substring(0, 60) + "...");
  bullet("Option count", String(clar.optionCount));
  bullet("Has Other option", String(clar.hasOtherOption));
}

console.log("\n  ┌─────────────────────────────────────────────────────┐");
console.log("  │  CODE MAY BE GREEN                                  │");
console.log("  │  INTENT IS NOT YET ESTABLISHED                      │");
console.log("  └─────────────────────────────────────────────────────┘");

// ---------------------------------------------------------------------------
// STEP 6: Capability request BEFORE resolution — must be DENIED
// ---------------------------------------------------------------------------

section("STEP 6 — Capability Request (Before Resolution)");

const decisionBefore = capabilityService.requestCapability({
  capabilityId: "cap-vip-refund-impl-before",
  runId: RUN_ID,
  writePaths: ["src/domain/refund.ts"],
  network: false,
  mcpTools: [],
});

if (!decisionBefore.granted) {
  bullet("Result", "DENIED ✓");
  bullet("Reason", decisionBefore.denialCode);
} else {
  bullet("Result", "GRANTED (unexpected)");
}

// ---------------------------------------------------------------------------
// STEP 7: Show clarification options
// ---------------------------------------------------------------------------

if (clarificationEventId === null) {
  console.error("\n[ERROR] Expected a ClarificationRequested event but none was recorded.");
  process.exit(1);
}

const clarEvt = guarded.getByEventId(clarificationEventId)!;
const clarPayload = clarEvt.payload as import("../src/epistemic/events.js").ClarificationRequestedPayload;

section("STEP 7 — Clarification Options");
console.log(`  Probe: ${clarPayload.probeId}`);
console.log(`  Prompt: ${clarPayload.prompt}\n`);
for (const opt of clarPayload.options) {
  console.log(`  [${opt.optionId}] ${opt.outcomeDescription}`);
  if (opt.interpretationIds.length > 0) {
    console.log(`         → consistent with: ${opt.interpretationIds.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// STEP 8: Human resolution
// ---------------------------------------------------------------------------

section("STEP 8 — Human Resolution");

if (suppliedAnswer === undefined) {
  console.log("  No --answer supplied.");
  console.log("  Run with: npm run demo:vip-refund -- --answer <option-id>");
  console.log(`  Valid option IDs: ${clarPayload.options.map((o) => o.optionId).join(", ")}`);
  console.log("\n  Demo ends here (blocked state). Capability remains DENIED.");
  console.log("\n  Final state: BLOCKED_UNRESOLVED_INTENT");
  process.exit(0);
}

// Validate supplied answer
const validOptionIds = clarPayload.options.map((o) => o.optionId);
if (!validOptionIds.includes(suppliedAnswer)) {
  console.error(
    `\n[ERROR] Invalid option ID: "${suppliedAnswer}". ` +
      `Valid options: ${validOptionIds.join(", ")}`
  );
  process.exit(1);
}

bullet("Human selected", suppliedAnswer);

const answerResult = intentService.recordHumanAnswer(
  RUN_ID,
  clarificationEventId,
  suppliedAnswer
);

if (answerResult.kind === "NEEDS_EXTERNAL_INPUT") {
  console.log('\n  Selected "Other / none of these".');
  console.log("  Result: NEEDS_EXTERNAL_INPUT — capability remains blocked.");
  console.log("  Intent is NOT established. No capability will be granted.");

  const receiptOther = buildEpistemicReceipt(RUN_ID, rawLedger);
  bullet("Overall state", receiptOther.overallState);

  process.exit(0);
}

bullet("Decision event", answerResult.decisionEventId);
console.log("  HumanDecisionRecorded ✓");

// ---------------------------------------------------------------------------
// STEP 9: Receipt AFTER resolution
// ---------------------------------------------------------------------------

section("STEP 9 — Epistemic Receipt AFTER Human Resolution");

const receiptAfter = buildEpistemicReceipt(RUN_ID, rawLedger);

bullet("Overall state", receiptAfter.overallState);
bullet("Guess Debt items", String(receiptAfter.guessDebt.length));
bullet(
  "Resolved Guess Debt",
  String(receiptAfter.guessDebt.filter((d) => d.status === "RESOLVED").length)
);
bullet("Human decisions", String(receiptAfter.humanDecisions.length));
bullet("Ledger integrity", receiptAfter.ledgerIntegrity.ok ? "OK ✓" : "FAILED ✗");
bullet(
  "Ledger head hash",
  (receiptAfter.ledgerHeadHash ?? "").substring(0, 16) + "..."
);

// ---------------------------------------------------------------------------
// STEP 10: Capability grant AFTER resolution
// ---------------------------------------------------------------------------

section("STEP 10 — Capability Request (After Resolution)");

const decisionAfter = capabilityService.requestCapability({
  capabilityId: "cap-vip-refund-impl-after",
  runId: RUN_ID,
  writePaths: ["src/domain/refund.ts"],
  network: false,
  mcpTools: [],
});

if (decisionAfter.granted) {
  bullet("Result", "GRANTED ✓");
  bullet("Basis events", decisionAfter.envelope.basisEventIds.join(", "));
  bullet(
    "Capability valid",
    String(capabilityService.isCapabilityCurrentlyValid(RUN_ID, "cap-vip-refund-impl-after"))
  );
} else {
  bullet("Result", "DENIED (unexpected)");
  bullet("Reason", decisionAfter.denialCode);
}

console.log("\n  ┌─────────────────────────────────────────────────────┐");
console.log("  │  INTENT ESTABLISHED BY HUMAN DECISION               │");
console.log("  │  CAPABILITY GRANTED FROM EXPLICIT BASIS             │");
console.log("  └─────────────────────────────────────────────────────┘");

console.log("\n  NOTE: The selected answer is the HUMAN's decision — not");
console.log("  the objectively correct implementation requirement.");
console.log("  NoGuess records WHAT was decided and WHO decided it.");

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------

section("FINAL SUMMARY");
bullet("Receipt state", receiptAfter.overallState);
bullet("Ledger events", String(rawLedger.listRun(RUN_ID).length));
bullet("Integrity", receiptAfter.ledgerIntegrity.ok ? "PASS" : "FAIL");

rawLedger.close();
