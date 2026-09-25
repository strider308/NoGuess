/**
 * M1 — EventEnvelope: the immutable wrapper stored in the ledger.
 */

import type { EventType, EventPayloadMap } from "./events.js";

// ---------------------------------------------------------------------------
// Emitter closed vocabulary
// ---------------------------------------------------------------------------

export type Emitter = "SYSTEM" | "BOB" | "HUMAN" | "KERNEL" | "EVALUATOR";

// ---------------------------------------------------------------------------
// The first event's previousHash sentinel
// ---------------------------------------------------------------------------

export const GENESIS_HASH = "GENESIS";

// ---------------------------------------------------------------------------
// Schema version constant
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// EventEnvelope — the stored, immutable record
// ---------------------------------------------------------------------------

export interface EventEnvelope<T extends EventType = EventType> {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly sequence: number;
  readonly eventId: string;
  readonly runId: string;
  readonly type: T;
  readonly occurredAt: number;
  readonly emitter: Emitter;
  readonly causationEventId: string | undefined;
  readonly payload: EventPayloadMap[T];
  readonly previousHash: string;
  readonly hash: string;
}

// ---------------------------------------------------------------------------
// AppendInput — what callers supply to ledger.append()
// ---------------------------------------------------------------------------

export interface AppendInput<T extends EventType = EventType> {
  readonly runId: string;
  readonly type: T;
  readonly emitter: Emitter;
  readonly causationEventId?: string;
  readonly payload: EventPayloadMap[T];
}
