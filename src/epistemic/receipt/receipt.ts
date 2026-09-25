/**
 * M6 — Epistemic Receipt: a pure projection of run state for audit.
 *
 * buildEpistemicReceipt() is NOT canonical state.
 * It is derived entirely from ledger replay.
 * It must never be stored as the source of truth.
 *
 * The receipt makes it easy for a judge to answer:
 *   "What did the AI know?"
 *   "What did it infer?"
 *   "Where did interpretations diverge?"
 *   "What did the human decide?"
 *   "Why was Bob allowed or denied permission to act?"
 */

import type { EventEnvelope } from "../event-envelope.js";
import type { LedgerPort, IntegrityReport } from "../ledger.js";
import type {
  InterpretationProposedPayload,
  SemanticForkDetectedPayload,
  AmbiguityClassifiedPayload,
  ClarificationRequestedPayload,
  HumanDecisionRecordedPayload,
  CapabilityGrantedPayload,
  CapabilityDeniedPayload,
  RequestReceivedPayload,
  EvidenceObservedPayload,
  MaterialityClassification,
} from "../events.js";
import { deriveGuessDebt } from "../intent/intent-service.js";
import type { GuessDebtItem } from "../intent/intent-service.js";

// ---------------------------------------------------------------------------
// Receipt overall state
// ---------------------------------------------------------------------------

export type ReceiptState =
  | "BLOCKED_UNRESOLVED_INTENT"
  | "READY_FOR_IMPLEMENTATION"
  | "CLOSED";

// ---------------------------------------------------------------------------
// Receipt shape
// ---------------------------------------------------------------------------

export interface InterpretationSummary {
  interpretationId: string;
  claimKey: string;
  summary: string;
}

export interface ForkSummary {
  claimKey: string;
  interpretationIds: string[];
  divergingProbeIds: string[];
}

export interface MaterialitySummary {
  claimKey: string;
  classification: MaterialityClassification;
  forkEventId: string;
}

export interface ClarificationSummary {
  questionId: string;
  claimKey: string;
  probeId: string;
  prompt: string;
  optionCount: number;
  hasOtherOption: boolean;
}

export interface HumanDecisionSummary {
  decisionId: string;
  claimKey: string | undefined;
  choice: string;
  eventId: string;
}

export interface CapabilitySummary {
  capabilityId: string;
  granted: boolean;
  basisEventIds: string[];
  denialCode?: string;
}

export interface EpistemicReceipt {
  readonly runId: string;
  readonly request: string | undefined;
  readonly evidenceSummary: { claimKey: string; count: number }[];
  readonly interpretations: InterpretationSummary[];
  readonly semanticForks: ForkSummary[];
  readonly materiality: MaterialitySummary[];
  readonly clarifications: ClarificationSummary[];
  readonly humanDecisions: HumanDecisionSummary[];
  readonly guessDebt: GuessDebtItem[];
  readonly capabilities: CapabilitySummary[];
  readonly ledgerIntegrity: IntegrityReport;
  readonly ledgerHeadHash: string | undefined;
  readonly overallState: ReceiptState;
}

// ---------------------------------------------------------------------------
// buildEpistemicReceipt — pure projection
// ---------------------------------------------------------------------------

export function buildEpistemicReceipt(
  runId: string,
  ledger: LedgerPort
): EpistemicReceipt {
  const events = ledger.listRun(runId);
  const allEvents = ledger.listAll();
  const ledgerIntegrity = ledger.verifyIntegrity();

  // Head hash: hash of the last event in the entire ledger
  const lastAll = allEvents[allEvents.length - 1];
  const ledgerHeadHash = lastAll?.hash;

  // Request
  let request: string | undefined;
  const reqEvt = events.find((e) => e.type === "RequestReceived");
  if (reqEvt !== undefined) {
    request = (reqEvt.payload as RequestReceivedPayload).requestText;
  }

  // Evidence summary: count active EvidenceObserved per claimKey
  const evidenceCountByKey = new Map<string, number>();
  for (const evt of events) {
    if (evt.type === "EvidenceObserved") {
      const p = evt.payload as EvidenceObservedPayload;
      evidenceCountByKey.set(p.claimKey, (evidenceCountByKey.get(p.claimKey) ?? 0) + 1);
    }
  }
  const evidenceSummary = [...evidenceCountByKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([claimKey, count]) => ({ claimKey, count }));

  // Interpretations
  const interpretations: InterpretationSummary[] = [];
  for (const evt of events) {
    if (evt.type === "InterpretationProposed") {
      const p = evt.payload as InterpretationProposedPayload;
      interpretations.push({
        interpretationId: p.interpretationId,
        claimKey: p.claimKey,
        summary: p.summary,
      });
    }
  }

  // Semantic forks
  const semanticForks: ForkSummary[] = [];
  for (const evt of events) {
    if (evt.type === "SemanticForkDetected") {
      const p = evt.payload as SemanticForkDetectedPayload;
      semanticForks.push({
        claimKey: p.claimKey,
        interpretationIds: p.interpretationIds,
        divergingProbeIds: p.divergingProbeIds,
      });
    }
  }

  // Materiality
  const materiality: MaterialitySummary[] = [];
  for (const evt of events) {
    if (evt.type === "AmbiguityClassified") {
      const p = evt.payload as AmbiguityClassifiedPayload;
      materiality.push({
        claimKey: p.claimKey,
        classification: p.classification,
        forkEventId: p.forkEventId,
      });
    }
  }

  // Clarifications
  const clarifications: ClarificationSummary[] = [];
  for (const evt of events) {
    if (evt.type === "ClarificationRequested") {
      const p = evt.payload as ClarificationRequestedPayload;
      clarifications.push({
        questionId: p.questionId,
        claimKey: p.claimKey,
        probeId: p.probeId,
        prompt: p.prompt,
        optionCount: p.options.length,
        hasOtherOption: p.options.some((o) => o.optionId === "opt-other"),
      });
    }
  }

  // Human decisions
  const humanDecisions: HumanDecisionSummary[] = [];
  for (const evt of events) {
    if (evt.type === "HumanDecisionRecorded") {
      const p = evt.payload as HumanDecisionRecordedPayload;
      humanDecisions.push({
        decisionId: p.decisionId,
        claimKey: p.claimKey,
        choice: p.choice,
        eventId: evt.eventId,
      });
    }
  }

  // Guess Debt
  const guessDebt = deriveGuessDebt(runId, events);

  // Capabilities
  const capabilities: CapabilitySummary[] = [];
  for (const evt of events) {
    if (evt.type === "CapabilityGranted") {
      const p = evt.payload as CapabilityGrantedPayload;
      capabilities.push({
        capabilityId: p.capabilityId,
        granted: true,
        basisEventIds: p.basisEventIds,
      });
    } else if (evt.type === "CapabilityDenied") {
      const p = evt.payload as CapabilityDeniedPayload;
      capabilities.push({
        capabilityId: p.capabilityId,
        granted: false,
        basisEventIds: [],
        denialCode: p.denialCode,
      });
    }
  }

  // Overall state
  const runClosed = events.some((e) => e.type === "RunClosed");
  const hasUnresolved = guessDebt.some((d) => d.status === "UNRESOLVED");
  const overallState: ReceiptState = runClosed
    ? "CLOSED"
    : hasUnresolved
    ? "BLOCKED_UNRESOLVED_INTENT"
    : "READY_FOR_IMPLEMENTATION";

  return {
    runId,
    request,
    evidenceSummary,
    interpretations,
    semanticForks,
    materiality,
    clarifications,
    humanDecisions,
    guessDebt,
    capabilities,
    ledgerIntegrity,
    ledgerHeadHash,
    overallState,
  };
}
