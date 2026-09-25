/**
 * M4-M6 — IntentService: semantic fork detection, materiality classification,
 * discriminating clarification planning, human resolution, and Guess Debt projection.
 *
 * Design invariants:
 *   - BOB may propose interpretations (InterpretationProposed).
 *   - KERNEL records SemanticForkDetected, AmbiguityClassified, ClarificationRequested.
 *   - HUMAN records HumanDecisionRecorded (via recordHumanAnswer).
 *   - BOB must not call recordHumanAnswer — the caller is responsible for emitter discipline.
 *   - Guess Debt is a pure ledger projection — no second source of truth.
 *   - No LLM calls. No randomness. No hidden answers.
 */

import { canonicalJson } from "../canonical-json.js";
import type { AppendInput, EventEnvelope } from "../event-envelope.js";
import type {
  InterpretationProposedPayload,
  SemanticForkDetectedPayload,
  AmbiguityClassifiedPayload,
  ClarificationRequestedPayload,
  ClarificationOption,
  HumanDecisionRecordedPayload,
  ProbeOutcome,
  ProtectedEffect,
  MaterialityClassification,
} from "../events.js";
import type { KernelGuardedLedger } from "../kernel/guarded-ledger.js";

// ---------------------------------------------------------------------------
// Protected effect keys used for materiality determination
// ---------------------------------------------------------------------------

const PROTECTED_EFFECTS: readonly ProtectedEffect[] = [
  "execution",
  "authorization",
  "dataScope",
  "persistence",
  "externalSideEffect",
];

// ---------------------------------------------------------------------------
// Interpretation — a parsed view of one InterpretationProposed
// ---------------------------------------------------------------------------

export interface Interpretation {
  readonly eventId: string;
  readonly interpretationId: string;
  readonly claimKey: string;
  readonly summary: string;
  readonly probeOutcomes: readonly ProbeOutcome[];
}

// ---------------------------------------------------------------------------
// SemanticForkResult — produced by detectSemanticFork (pure, no side effects)
// ---------------------------------------------------------------------------

export interface SemanticForkResult {
  readonly claimKey: string;
  readonly interpretationIds: string[];
  readonly divergingProbeIds: string[];
  /** probeId -> interpretationId -> canonical effect signature string */
  readonly effectSignatures: Record<string, Record<string, string>>;
  /** true when at least two interpretations differ on a PROTECTED effect */
  readonly hasMaterialDivergence: boolean;
}

// ---------------------------------------------------------------------------
// GuessDeptItem — one entry in the current Guess Debt projection
// ---------------------------------------------------------------------------

export interface GuessDebtItem {
  readonly claimKey: string;
  readonly forkEventId: string;
  readonly clarificationEventId: string | undefined;
  readonly status: "UNRESOLVED" | "RESOLVED";
}

// ---------------------------------------------------------------------------
// HumanAnswerResult — result of recordHumanAnswer
// ---------------------------------------------------------------------------

export type HumanAnswerResult =
  | { readonly kind: "RESOLVED"; readonly decisionEventId: string }
  | { readonly kind: "NEEDS_EXTERNAL_INPUT" };

// ---------------------------------------------------------------------------
// Canonical effect signature for one probe outcome
// Compares ONLY protected effects — not prose/description.
// ---------------------------------------------------------------------------

function effectSignature(outcome: ProbeOutcome): string {
  const relevant: Partial<Record<ProtectedEffect, string>> = {};
  for (const key of PROTECTED_EFFECTS) {
    const v = outcome.effects[key];
    if (v !== undefined) relevant[key] = v;
  }
  return canonicalJson(relevant);
}

// ---------------------------------------------------------------------------
// detectSemanticFork — pure deterministic fork analysis
//
// A semantic fork exists when at least two interpretations produce different
// canonical observable effect signatures for the same probe.
// Prose-only differences (same effects) do NOT create a fork.
// ---------------------------------------------------------------------------

export function detectSemanticFork(
  interpretations: readonly Interpretation[]
): SemanticForkResult | null {
  if (interpretations.length < 2) return null;

  const claimKey = interpretations[0]!.claimKey;

  // Collect all probeIds appearing in any interpretation
  const allProbeIds = new Set<string>();
  for (const interp of interpretations) {
    for (const o of interp.probeOutcomes) {
      allProbeIds.add(o.probeId);
    }
  }

  const divergingProbeIds: string[] = [];
  const effectSignatures: Record<string, Record<string, string>> = {};

  for (const probeId of [...allProbeIds].sort()) {
    const sigsByInterp: Record<string, string> = {};
    for (const interp of interpretations) {
      const outcome = interp.probeOutcomes.find((o) => o.probeId === probeId);
      sigsByInterp[interp.interpretationId] =
        outcome !== undefined ? effectSignature(outcome) : canonicalJson({});
    }

    // Check whether any two interpretations differ on this probe
    const uniqueSigs = new Set(Object.values(sigsByInterp));
    if (uniqueSigs.size > 1) {
      divergingProbeIds.push(probeId);
      effectSignatures[probeId] = sigsByInterp;
    }
  }

  if (divergingProbeIds.length === 0) return null;

  // Materiality: fork is MATERIAL if any diverging probe differs on a PROTECTED effect
  const hasMaterialDivergence = divergingProbeIds.some((probeId) => {
    const sigs = effectSignatures[probeId]!;
    const signatureValues = Object.values(sigs);
    // Parse each sig and compare protected effects
    return PROTECTED_EFFECTS.some((eff) => {
      const effectValues = new Set(
        signatureValues.map((s) => {
          const parsed = JSON.parse(s) as Record<string, string>;
          return parsed[eff] ?? "__absent__";
        })
      );
      return effectValues.size > 1;
    });
  });

  return {
    claimKey,
    interpretationIds: interpretations.map((i) => i.interpretationId),
    divergingProbeIds,
    effectSignatures,
    hasMaterialDivergence,
  };
}

// ---------------------------------------------------------------------------
// pickDiscriminatingProbe — choose the probe that maximizes distinct outcome
// groups across interpretations; tie-break by lexical probeId order.
// ---------------------------------------------------------------------------

export function pickDiscriminatingProbe(
  interpretations: readonly Interpretation[],
  divergingProbeIds: readonly string[]
): string {
  let bestProbeId = divergingProbeIds[0]!;
  let bestGroups = 0;

  for (const probeId of [...divergingProbeIds].sort()) {
    const sigs = new Set<string>();
    for (const interp of interpretations) {
      const outcome = interp.probeOutcomes.find((o) => o.probeId === probeId);
      sigs.add(outcome !== undefined ? effectSignature(outcome) : canonicalJson({}));
    }
    // Use > not >= so first (lexically smallest) wins ties
    if (sigs.size > bestGroups) {
      bestGroups = sigs.size;
      bestProbeId = probeId;
    }
  }

  return bestProbeId;
}

// ---------------------------------------------------------------------------
// buildClarificationOptions — create stable deterministic options from outcomes
// ---------------------------------------------------------------------------

function buildClarificationOptions(
  interpretations: readonly Interpretation[],
  probeId: string
): ClarificationOption[] {
  // Group interpretation IDs by their effect signature for this probe
  const sigToInterpIds = new Map<string, string[]>();
  const sigToDescription = new Map<string, string>();

  for (const interp of interpretations) {
    const outcome = interp.probeOutcomes.find((o) => o.probeId === probeId);
    const sig = outcome !== undefined ? effectSignature(outcome) : canonicalJson({});
    const desc = outcome?.description ?? "(no observable effect described)";
    const list = sigToInterpIds.get(sig);
    if (list !== undefined) {
      list.push(interp.interpretationId);
    } else {
      sigToInterpIds.set(sig, [interp.interpretationId]);
      sigToDescription.set(sig, desc);
    }
  }

  // Sort by sig for determinism, generate stable optionIds
  const options: ClarificationOption[] = [];
  let optionIndex = 0;
  for (const [sig, interpIds] of [...sigToInterpIds.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    options.push({
      optionId: `opt-${String(optionIndex).padStart(2, "0")}`,
      outcomeDescription: sigToDescription.get(sig)!,
      interpretationIds: interpIds.sort(),
    });
    optionIndex++;
  }

  // Always append Other / none of these as the final option
  options.push({
    optionId: "opt-other",
    outcomeDescription: "Other / none of these",
    interpretationIds: [],
  });

  return options;
}

// ---------------------------------------------------------------------------
// IntentService
// ---------------------------------------------------------------------------

export class IntentService {
  private readonly guarded: KernelGuardedLedger;

  constructor(guarded: KernelGuardedLedger) {
    this.guarded = guarded;
  }

  // -------------------------------------------------------------------------
  // getInterpretations — replay InterpretationProposed for a run
  // -------------------------------------------------------------------------

  getInterpretations(runId: string): Interpretation[] {
    const events = this.guarded.listRun(runId);
    const result: Interpretation[] = [];
    for (const evt of events) {
      if (evt.type === "InterpretationProposed") {
        const p = evt.payload as InterpretationProposedPayload;
        result.push({
          eventId: evt.eventId,
          interpretationId: p.interpretationId,
          claimKey: p.claimKey,
          summary: p.summary,
          probeOutcomes: p.probeOutcomes,
        });
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // analyzeAndRecord — detect fork, classify materiality, emit ClarificationRequested
  // if MATERIAL. All KERNEL-emitted events go through KernelGuardedLedger.
  //
  // Returns: the ClarificationRequested eventId if MATERIAL, or null.
  // -------------------------------------------------------------------------

  analyzeAndRecord(
    runId: string,
    claimKey: string,
    causationEventId?: string
  ): { forkEventId: string | null; clarificationEventId: string | null } {
    const allInterps = this.getInterpretations(runId).filter(
      (i) => i.claimKey === claimKey
    );

    const fork = detectSemanticFork(allInterps);
    if (fork === null) {
      return { forkEventId: null, clarificationEventId: null };
    }

    // Record SemanticForkDetected (KERNEL)
    const forkPayload: SemanticForkDetectedPayload = {
      claimKey: fork.claimKey,
      interpretationIds: fork.interpretationIds,
      divergingProbeIds: fork.divergingProbeIds,
      effectSignatures: fork.effectSignatures,
    };
    const forkInput: AppendInput<"SemanticForkDetected"> = {
      runId,
      type: "SemanticForkDetected",
      emitter: "KERNEL",
      causationEventId,
      payload: forkPayload,
    };
    const forkEvt = this.guarded.append(forkInput);

    // Record AmbiguityClassified (KERNEL)
    const classification: MaterialityClassification = fork.hasMaterialDivergence
      ? "MATERIAL"
      : "NON_MATERIAL";
    const ambiguityId = `ambiguity:${runId}:${claimKey}`;
    const classPayload: AmbiguityClassifiedPayload = {
      ambiguityId,
      forkEventId: forkEvt.eventId,
      claimKey,
      classification,
    };
    const classInput: AppendInput<"AmbiguityClassified"> = {
      runId,
      type: "AmbiguityClassified",
      emitter: "KERNEL",
      causationEventId: forkEvt.eventId,
      payload: classPayload,
    };
    this.guarded.append(classInput);

    if (classification !== "MATERIAL") {
      return { forkEventId: forkEvt.eventId, clarificationEventId: null };
    }

    // Pick discriminating probe and build clarification
    const probeId = pickDiscriminatingProbe(allInterps, fork.divergingProbeIds);
    const options = buildClarificationOptions(allInterps, probeId);

    // questionId is deterministic
    const questionId = `clarification:${runId}:${claimKey}:${probeId}`;
    // Build the question from the scenario text shared by all competing
    // outcomes, never from one candidate outcome. This prevents the
    // clarification itself from privileging an interpretation.
    const probeDescriptions = allInterps
      .map(
        (interp) =>
          interp.probeOutcomes.find((o) => o.probeId === probeId)?.description
      )
      .filter((description): description is string => description !== undefined);

    const sharedPrefix =
      probeDescriptions.length === 0
        ? ""
        : probeDescriptions.reduce((prefix, description) => {
            let i = 0;
            const limit = Math.min(prefix.length, description.length);
            while (i < limit && prefix[i] === description[i]) i++;
            return prefix.slice(0, i);
          });

    // Prefer the complete shared scenario sentence. Anything after it is
    // candidate-specific outcome text and must not leak into the question.
    const lastSentenceEnd = sharedPrefix.lastIndexOf(".");
    const scenario =
      lastSentenceEnd >= 0
        ? sharedPrefix.slice(0, lastSentenceEnd + 1).trim()
        : sharedPrefix.trim();

    const prompt =
      scenario.length >= 20
        ? `${scenario} What should happen?`
        : `Which observable behaviour should apply for probe "${probeId}"?`;

    const clarPayload: ClarificationRequestedPayload = {
      questionId,
      claimKey,
      probeId,
      prompt,
      options,
    };
    const clarInput: AppendInput<"ClarificationRequested"> = {
      runId,
      type: "ClarificationRequested",
      emitter: "KERNEL",
      causationEventId: forkEvt.eventId,
      payload: clarPayload,
    };
    const clarEvt = this.guarded.append(clarInput);

    return { forkEventId: forkEvt.eventId, clarificationEventId: clarEvt.eventId };
  }

  // -------------------------------------------------------------------------
  // recordHumanAnswer — a HUMAN answers a ClarificationRequested.
  //
  // IMPORTANT: The caller MUST supply emitter: "HUMAN".
  // BOB must not call this method with emitter "BOB".
  // "opt-other" → NEEDS_EXTERNAL_INPUT (no resolution manufactured).
  // Normal option → records HumanDecisionRecorded as HUMAN.
  // -------------------------------------------------------------------------

  recordHumanAnswer(
    runId: string,
    clarificationEventId: string,
    selectedOptionId: string
  ): HumanAnswerResult {
    // Look up the clarification
    const clarEvt = this.guarded.getByEventId(clarificationEventId);
    if (clarEvt === undefined || clarEvt.type !== "ClarificationRequested") {
      throw new Error(`ClarificationRequested event "${clarificationEventId}" not found.`);
    }
    const clarPayload = clarEvt.payload as ClarificationRequestedPayload;

    // Validate option exists
    const option = clarPayload.options.find((o) => o.optionId === selectedOptionId);
    if (option === undefined) {
      throw new Error(`Option "${selectedOptionId}" is not a valid option for this clarification.`);
    }

    // "Other / none of these" → blocked, no resolution
    if (selectedOptionId === "opt-other" || option.interpretationIds.length === 0) {
      return { kind: "NEEDS_EXTERNAL_INPUT" };
    }

    // Normal option — record HumanDecisionRecorded
    const decisionId = `decision:${runId}:${clarPayload.claimKey}:${selectedOptionId}`;
    const decisionPayload: HumanDecisionRecordedPayload = {
      decisionId,
      choice: option.outcomeDescription,
      selectedOptionId,
      causationEventId: clarificationEventId,
      claimKey: clarPayload.claimKey,
      value: option.outcomeDescription,
    };
    const decisionInput: AppendInput<"HumanDecisionRecorded"> = {
      runId,
      type: "HumanDecisionRecorded",
      emitter: "HUMAN",
      causationEventId: clarificationEventId,
      payload: decisionPayload,
    };
    const decisionEvt = this.guarded.append(decisionInput);

    return { kind: "RESOLVED", decisionEventId: decisionEvt.eventId };
  }

  // -------------------------------------------------------------------------
  // getGuessDebt — pure projection from ledger replay
  // No second source of truth. Derived entirely from events.
  // -------------------------------------------------------------------------

  getGuessDebt(runId: string): GuessDebtItem[] {
    const events = this.guarded.listRun(runId);
    return deriveGuessDebt(runId, events);
  }
}

// ---------------------------------------------------------------------------
// deriveGuessDebt — pure replay function (exported for receipt builder)
// ---------------------------------------------------------------------------

export function deriveGuessDebt(
  runId: string,
  events: readonly EventEnvelope[]
): GuessDebtItem[] {
  // Collect material fork event IDs
  const materialForkByClaimKey = new Map<string, string>(); // claimKey -> forkEventId

  // Collect clarification event IDs per fork
  const clarificationByClaimKey = new Map<string, string>(); // claimKey -> clarEventId

  // Collect human decisions that resolve a claimKey
  const resolvedClaimKeys = new Set<string>();

  for (const evt of events) {
    if (evt.runId !== runId) continue;

    if (evt.type === "AmbiguityClassified") {
      const p = evt.payload as AmbiguityClassifiedPayload;
      if (p.classification === "MATERIAL") {
        materialForkByClaimKey.set(p.claimKey, p.forkEventId);
      }
    }

    if (evt.type === "ClarificationRequested") {
      const p = evt.payload as ClarificationRequestedPayload;
      clarificationByClaimKey.set(p.claimKey, evt.eventId);
    }

    if (evt.type === "HumanDecisionRecorded") {
      const p = evt.payload as HumanDecisionRecordedPayload;
      if (p.claimKey !== undefined) {
        resolvedClaimKeys.add(p.claimKey);
      }
    }
  }

  const result: GuessDebtItem[] = [];
  for (const [claimKey, forkEventId] of materialForkByClaimKey) {
    const resolved = resolvedClaimKeys.has(claimKey);
    result.push({
      claimKey,
      forkEventId,
      clarificationEventId: clarificationByClaimKey.get(claimKey),
      status: resolved ? "RESOLVED" : "UNRESOLVED",
    });
  }

  return result;
}

