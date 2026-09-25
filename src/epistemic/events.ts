/**
 * M1 — Event vocabulary for the NoGuess Epistemic Control Plane.
 *
 * Defines the closed set of event types and their minimal payload shapes.
 * M1 records events only — no policy, no semantics enforcement.
 */

// ---------------------------------------------------------------------------
// Event type union
// ---------------------------------------------------------------------------

export type EventType =
  | "RequestReceived"
  | "EvidenceObserved"
  | "EvidenceSuperseded"
  | "EvidenceConflictDetected"
  | "InterpretationProposed"
  | "SemanticForkDetected"
  | "AmbiguityClassified"
  | "ClarificationRequested"
  | "HumanDecisionRecorded"
  | "DecisionSuperseded"
  | "CapabilityRequested"
  | "CapabilityGranted"
  | "CapabilityDenied"
  | "CapabilityExpired"
  | "ImplementationStarted"
  | "ArtifactChanged"
  | "ToolExecuted"
  | "ImplementationFinished"
  | "VerificationStarted"
  | "PublicCheckObserved"
  | "HiddenIntentCheckObserved"
  | "ScopeCheckObserved"
  | "VerificationObserved"
  | "AcceptanceComputed"
  | "RunClosed";

// ---------------------------------------------------------------------------
// Payload types (minimal — semantics belong to later milestones)
// ---------------------------------------------------------------------------

export interface RequestReceivedPayload {
  requestText: string;
}

export interface EvidenceObservedPayload {
  evidenceId: string;
  evidenceType: string;
  content: string;
}

export interface EvidenceSupersededPayload {
  evidenceId: string;
  supersededBy: string;
}

export interface EvidenceConflictDetectedPayload {
  evidenceIds: string[];
  description: string;
}

export interface InterpretationProposedPayload {
  interpretationId: string;
  description: string;
}

export interface SemanticForkDetectedPayload {
  interpretationIds: string[];
  description: string;
}

export interface AmbiguityClassifiedPayload {
  ambiguityId: string;
  classification: string;
}

export interface ClarificationRequestedPayload {
  clarificationId: string;
  question: string;
}

export interface HumanDecisionRecordedPayload {
  decisionId: string;
  choice: string;
}

export interface DecisionSupersededPayload {
  decisionId: string;
  supersededBy: string;
}

export interface CapabilityRequestedPayload {
  capabilityId: string;
  capabilityType: string;
}

export interface CapabilityGrantedPayload {
  capabilityId: string;
}

export interface CapabilityDeniedPayload {
  capabilityId: string;
  reason: string;
}

export interface CapabilityExpiredPayload {
  capabilityId: string;
}

export interface ImplementationStartedPayload {
  description: string;
}

export interface ArtifactChangedPayload {
  artifactPath: string;
  changeType: string;
}

export interface ToolExecutedPayload {
  toolName: string;
  summary: string;
}

export interface ImplementationFinishedPayload {
  summary: string;
}

export interface VerificationStartedPayload {
  description: string;
}

export interface PublicCheckObservedPayload {
  checkId: string;
  result: string;
}

export interface HiddenIntentCheckObservedPayload {
  checkId: string;
  result: string;
}

export interface ScopeCheckObservedPayload {
  checkId: string;
  result: string;
}

export interface VerificationObservedPayload {
  summary: string;
}

export interface AcceptanceComputedPayload {
  accepted: boolean;
  reason: string;
}

export interface RunClosedPayload {
  reason: string;
}

// ---------------------------------------------------------------------------
// Payload map — maps EventType → its payload interface
// ---------------------------------------------------------------------------

export interface EventPayloadMap {
  RequestReceived: RequestReceivedPayload;
  EvidenceObserved: EvidenceObservedPayload;
  EvidenceSuperseded: EvidenceSupersededPayload;
  EvidenceConflictDetected: EvidenceConflictDetectedPayload;
  InterpretationProposed: InterpretationProposedPayload;
  SemanticForkDetected: SemanticForkDetectedPayload;
  AmbiguityClassified: AmbiguityClassifiedPayload;
  ClarificationRequested: ClarificationRequestedPayload;
  HumanDecisionRecorded: HumanDecisionRecordedPayload;
  DecisionSuperseded: DecisionSupersededPayload;
  CapabilityRequested: CapabilityRequestedPayload;
  CapabilityGranted: CapabilityGrantedPayload;
  CapabilityDenied: CapabilityDeniedPayload;
  CapabilityExpired: CapabilityExpiredPayload;
  ImplementationStarted: ImplementationStartedPayload;
  ArtifactChanged: ArtifactChangedPayload;
  ToolExecuted: ToolExecutedPayload;
  ImplementationFinished: ImplementationFinishedPayload;
  VerificationStarted: VerificationStartedPayload;
  PublicCheckObserved: PublicCheckObservedPayload;
  HiddenIntentCheckObserved: HiddenIntentCheckObservedPayload;
  ScopeCheckObserved: ScopeCheckObservedPayload;
  VerificationObserved: VerificationObservedPayload;
  AcceptanceComputed: AcceptanceComputedPayload;
  RunClosed: RunClosedPayload;
}
