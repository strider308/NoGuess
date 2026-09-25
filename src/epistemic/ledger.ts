/**
 * M1 — LedgerPort: the public append-only event ledger interface.
 *
 * The ledger is the canonical source of truth.
 * No update or delete methods are exposed.
 */

import type { ClockPort } from "../lib/clock.js";
import type { EventType } from "./events.js";
import type { AppendInput, EventEnvelope } from "./event-envelope.js";

export type { ClockPort };
export type { AppendInput, EventEnvelope };
export type { EventType };

// ---------------------------------------------------------------------------
// Integrity check result
// ---------------------------------------------------------------------------

export interface IntegrityReport {
  readonly ok: boolean;
  readonly checkedCount: number;
  readonly failureReason?: string;
}

// ---------------------------------------------------------------------------
// LedgerPort — the public API
// ---------------------------------------------------------------------------

export interface LedgerPort {
  /**
   * Append one event to the ledger.
   * Returns the complete, immutable stored envelope.
   */
  append<T extends EventType>(input: AppendInput<T>): EventEnvelope<T>;

  /** Retrieve a single event by its ledger-assigned sequence number. */
  getBySequence(sequence: number): EventEnvelope | undefined;

  /** Retrieve a single event by its deterministic event ID. */
  getByEventId(eventId: string): EventEnvelope | undefined;

  /** List all events belonging to a given run, ordered by sequence. */
  listRun(runId: string): readonly EventEnvelope[];

  /** List every event in the ledger, ordered by sequence. */
  listAll(): readonly EventEnvelope[];

  /**
   * Independently recompute and verify:
   *   - sequence continuity (1, 2, 3, …)
   *   - deterministic event IDs
   *   - previousHash chain
   *   - canonical payload representation
   *   - event hashes
   *
   * Integrity failure must fail closed (ok: false with reason).
   */
  verifyIntegrity(): IntegrityReport;

  /** Close the underlying storage. */
  close(): void;
}
