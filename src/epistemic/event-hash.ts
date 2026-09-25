/**
 * M1 — Deterministic event hash using node:crypto SHA-256.
 *
 * The hash covers: schemaVersion, sequence, eventId, runId, type,
 * occurredAt, emitter, causationEventId, payload (canonical JSON),
 * and previousHash.
 *
 * No random input. Same inputs always produce the same hash.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import type { Emitter } from "./event-envelope.js";
import type { EventType, EventPayloadMap } from "./events.js";

export interface HashInput<T extends EventType = EventType> {
  schemaVersion: number;
  sequence: number;
  eventId: string;
  runId: string;
  type: T;
  occurredAt: number;
  emitter: Emitter;
  causationEventId: string | undefined;
  payload: EventPayloadMap[T];
  previousHash: string;
}

/**
 * Compute the SHA-256 hash for an event.
 * Returns a lowercase hex string.
 */
export function computeEventHash(input: HashInput): string {
  const canonical = canonicalJson({
    schemaVersion: input.schemaVersion,
    sequence: input.sequence,
    eventId: input.eventId,
    runId: input.runId,
    type: input.type,
    occurredAt: input.occurredAt,
    emitter: input.emitter,
    causationEventId: input.causationEventId ?? null,
    payload: input.payload,
    previousHash: input.previousHash,
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
