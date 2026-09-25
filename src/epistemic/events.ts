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

// ---------------------------------------------------------------------------
// M3 — Canonical epistemic state and authority class
// (Defined here alongside payloads so they travel with events)
// ---------------------------------------------------------------------------

export type EpistemicState =
  | "EXPLICIT"
  | "REPO_DERIVED"
  | "RUNTIME_OBSERVED"
  | "HUMAN_RESOLVED"
  | "INFERRED"
  | "AMBIGUOUS"
  | "CONFLICTING"
  | "UNKNOWN"
  | "EXTERNAL_DECISION";

export type AuthorityClass =
  | "HUMAN_RESOLVED"
  | "EXECUTABLE_CONTRACT"
  | "VERSIONED_POLICY"
  | "RUNTIME_OBSERVED"
  | "IMPLEMENTATION"
  | "DOCUMENTATION"
  | "MODEL_INFERENCE";

// ---------------------------------------------------------------------------
// M3 — canonical JSON-compatible value type
// ---------------------------------------------------------------------------

export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

// ---------------------------------------------------------------------------
// M3-extended evidence payloads
// ---------------------------------------------------------------------------

export interface EvidenceObservedPayload {
  evidenceId: string;
  claimKey: string;
  value: CanonicalValue;
  epistemicState: EpistemicState;
  authorityClass: AuthorityClass;
  sourceRef: string;
  /** Optional metadata. Must be finite 0..1 if present. NEVER affects authority. */
  confidence?: number;
}

export interface EvidenceSupersededPayload {
  /** The evidenceId being superseded (must reference an existing EvidenceObserved). */
  evidenceId: string;
  /** The evidenceId of the evidence that supersedes it. */
  supersededBy: string;
}

export interface EvidenceConflictDetectedPayload {
  /** The evidenceIds involved in the conflict. */
  evidenceIds: string[];
  /** The claimKey the conflict is about. */
  claimKey: string;
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
  /** M3 — optional claim projection fields. When present, the decision projects
   *  as HUMAN_RESOLVED evidence for the given claimKey/value. */
  claimKey?: string;
  value?: CanonicalValue;
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
