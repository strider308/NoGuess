/**
 * M1 — SQLiteLedger: append-only event ledger backed by node:sqlite.
 *
 * Characteristics:
 *   - One append-only `events` table
 *   - sequence is the canonical ordering (INTEGER PRIMARY KEY AUTOINCREMENT)
 *   - event_id UNIQUE, deterministic
 *   - run_id indexed, event_type indexed
 *   - SQLite triggers prevent UPDATE and DELETE on the events table
 *   - Raw database connection is never exposed
 */

// @ts-ignore — node:sqlite is experimental in Node 22; types may not be present
import { DatabaseSync } from "node:sqlite";
import type { ClockPort } from "../lib/clock.js";
import type { EventType } from "./events.js";
import type { AppendInput, EventEnvelope } from "./event-envelope.js";
import { GENESIS_HASH, SCHEMA_VERSION } from "./event-envelope.js";
import type { LedgerPort, IntegrityReport } from "./ledger.js";
import { canonicalJson } from "./canonical-json.js";
import { computeEventHash } from "./event-hash.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a sequence number as a zero-padded deterministic event ID. */
function sequenceToEventId(sequence: number): string {
  return `evt-${String(sequence).padStart(10, "0")}`;
}

/** Parse a stored row back to an EventEnvelope. */
function rowToEnvelope(row: Record<string, unknown>): EventEnvelope {
  const payloadJson = row["payload"] as string;
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;

  return {
    schemaVersion: row["schema_version"] as typeof SCHEMA_VERSION,
    sequence: row["sequence"] as number,
    eventId: row["event_id"] as string,
    runId: row["run_id"] as string,
    type: row["event_type"] as EventType,
    occurredAt: row["occurred_at"] as number,
    emitter: row["emitter"] as EventEnvelope["emitter"],
    causationEventId: (row["causation_event_id"] as string | null) ?? undefined,
    payload: payload as never,
    previousHash: row["previous_hash"] as string,
    hash: row["event_hash"] as string,
  };
}

// ---------------------------------------------------------------------------
// SQLiteLedger
// ---------------------------------------------------------------------------

export class SQLiteLedger implements LedgerPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;
  private readonly clock: ClockPort;

  /**
   * Open (or create) the ledger.
   *
   * @param path  File path for the SQLite database, or ":memory:" for an
   *              in-memory database.
   * @param clock Injected clock — ledger logic never calls Date.now().
   */
  constructor(path: string, clock: ClockPort) {
    this.clock = clock;
    this.db = new DatabaseSync(path);
    this.initSchema();
  }

  // -------------------------------------------------------------------------
  // Schema initialisation
  // -------------------------------------------------------------------------

  private initSchema(): void {
    // WAL mode for better concurrent read performance.
    this.db.exec("PRAGMA journal_mode = WAL;");

    // Main events table — append-only.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        sequence          INTEGER PRIMARY KEY AUTOINCREMENT,
        schema_version    INTEGER NOT NULL,
        event_id          TEXT    NOT NULL UNIQUE,
        run_id            TEXT    NOT NULL,
        event_type        TEXT    NOT NULL,
        occurred_at       INTEGER NOT NULL,
        emitter           TEXT    NOT NULL,
        causation_event_id TEXT,
        payload           TEXT    NOT NULL,
        previous_hash     TEXT    NOT NULL,
        event_hash        TEXT    NOT NULL UNIQUE
      );
    `);

    // Indexes for common query patterns.
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_run_id     ON events (run_id);
      CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
    `);

    // Immutability triggers — RAISE(ABORT) prevents UPDATE and DELETE.
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS no_update_events
        BEFORE UPDATE ON events
        BEGIN
          SELECT RAISE(ABORT, 'events table is immutable: UPDATE is not allowed');
        END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS no_delete_events
        BEFORE DELETE ON events
        BEGIN
          SELECT RAISE(ABORT, 'events table is immutable: DELETE is not allowed');
        END;
    `);
  }

  // -------------------------------------------------------------------------
  // LedgerPort — append
  // -------------------------------------------------------------------------

  append<T extends EventType>(input: AppendInput<T>): EventEnvelope<T> {
    const occurredAt = this.clock.now();

    const insertStmt = this.db.prepare(`
      INSERT INTO events
        (schema_version, event_id, run_id, event_type, occurred_at,
         emitter, causation_event_id, payload, previous_hash, event_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let stored!: EventEnvelope<T>;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Determine next sequence and previousHash atomically.
      const stateRow = this.db.prepare(
        `SELECT
           COALESCE(MAX(sequence), 0) AS m,
           (SELECT event_hash FROM events ORDER BY sequence DESC LIMIT 1) AS last_hash
         FROM events`
      ).get() as { m: number; last_hash: string | null };

      const nextSequence = stateRow.m + 1;
      const previousHash: string =
        stateRow.last_hash != null ? stateRow.last_hash : GENESIS_HASH;

      const eventId = sequenceToEventId(nextSequence);
      const payloadJson = canonicalJson(input.payload as unknown);

      const hash = computeEventHash({
        schemaVersion: SCHEMA_VERSION,
        sequence: nextSequence,
        eventId,
        runId: input.runId,
        type: input.type,
        occurredAt,
        emitter: input.emitter,
        causationEventId: input.causationEventId,
        payload: input.payload,
        previousHash,
      });

      insertStmt.run(
        SCHEMA_VERSION,
        eventId,
        input.runId,
        input.type,
        occurredAt,
        input.emitter,
        input.causationEventId ?? null,
        payloadJson,
        previousHash,
        hash
      );

      this.db.exec("COMMIT");

      stored = {
        schemaVersion: SCHEMA_VERSION,
        sequence: nextSequence,
        eventId,
        runId: input.runId,
        type: input.type,
        occurredAt,
        emitter: input.emitter,
        causationEventId: input.causationEventId,
        payload: input.payload,
        previousHash,
        hash,
      } as EventEnvelope<T>;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }

    return stored;
  }

  // -------------------------------------------------------------------------
  // LedgerPort — read methods
  // -------------------------------------------------------------------------

  getBySequence(sequence: number): EventEnvelope | undefined {
    const row = this.db.prepare(
      "SELECT * FROM events WHERE sequence = ?"
    ).get(sequence) as Record<string, unknown> | undefined;
    return row !== undefined ? rowToEnvelope(row) : undefined;
  }

  getByEventId(eventId: string): EventEnvelope | undefined {
    const row = this.db.prepare(
      "SELECT * FROM events WHERE event_id = ?"
    ).get(eventId) as Record<string, unknown> | undefined;
    return row !== undefined ? rowToEnvelope(row) : undefined;
  }

  listRun(runId: string): readonly EventEnvelope[] {
    const rows = this.db.prepare(
      "SELECT * FROM events WHERE run_id = ? ORDER BY sequence ASC"
    ).all(runId) as Record<string, unknown>[];
    return rows.map(rowToEnvelope);
  }

  listAll(): readonly EventEnvelope[] {
    const rows = this.db.prepare(
      "SELECT * FROM events ORDER BY sequence ASC"
    ).all() as Record<string, unknown>[];
    return rows.map(rowToEnvelope);
  }

  // -------------------------------------------------------------------------
  // LedgerPort — verifyIntegrity
  // -------------------------------------------------------------------------

  verifyIntegrity(): IntegrityReport {
    const rows = this.db.prepare(
      "SELECT * FROM events ORDER BY sequence ASC"
    ).all() as Record<string, unknown>[];

    if (rows.length === 0) {
      return { ok: true, checkedCount: 0 };
    }

    let expectedSequence = 1;
    let expectedPreviousHash = GENESIS_HASH;

    for (const row of rows) {
      const sequence = row["sequence"] as number;
      const eventId = row["event_id"] as string;
      const storedHash = row["event_hash"] as string;
      const storedPreviousHash = row["previous_hash"] as string;
      const payloadJson = row["payload"] as string;

      // 1. Sequence continuity
      if (sequence !== expectedSequence) {
        return {
          ok: false,
          checkedCount: expectedSequence - 1,
          failureReason: `sequence gap: expected ${expectedSequence}, got ${sequence}`,
        };
      }

      // 2. Deterministic event ID
      const expectedEventId = sequenceToEventId(sequence);
      if (eventId !== expectedEventId) {
        return {
          ok: false,
          checkedCount: sequence - 1,
          failureReason: `eventId mismatch at sequence ${sequence}: expected ${expectedEventId}, got ${eventId}`,
        };
      }

      // 3. previousHash chain
      if (storedPreviousHash !== expectedPreviousHash) {
        return {
          ok: false,
          checkedCount: sequence - 1,
          failureReason: `previousHash mismatch at sequence ${sequence}`,
        };
      }

      // 4. Canonical payload representation — re-parse and re-serialize
      let reserializedPayload: string;
      try {
        const parsed = JSON.parse(payloadJson) as unknown;
        reserializedPayload = canonicalJson(parsed);
      } catch {
        return {
          ok: false,
          checkedCount: sequence - 1,
          failureReason: `payload re-serialization failed at sequence ${sequence}`,
        };
      }
      if (reserializedPayload !== payloadJson) {
        return {
          ok: false,
          checkedCount: sequence - 1,
          failureReason: `payload is not canonical JSON at sequence ${sequence}`,
        };
      }

      // 5. Recompute hash
      const occurredAt = row["occurred_at"] as number;
      const emitter = row["emitter"] as EventEnvelope["emitter"];
      const causationEventId =
        (row["causation_event_id"] as string | null) ?? undefined;
      const type = row["event_type"] as EventType;
      const runId = row["run_id"] as string;
      const schemaVersion = row["schema_version"] as number;
      const payload = JSON.parse(payloadJson) as never;

      const recomputedHash = computeEventHash({
        schemaVersion,
        sequence,
        eventId,
        runId,
        type,
        occurredAt,
        emitter,
        causationEventId,
        payload,
        previousHash: storedPreviousHash,
      });

      if (recomputedHash !== storedHash) {
        return {
          ok: false,
          checkedCount: sequence - 1,
          failureReason: `hash mismatch at sequence ${sequence}`,
        };
      }

      expectedPreviousHash = storedHash;
      expectedSequence += 1;
    }

    return { ok: true, checkedCount: rows.length };
  }

  // -------------------------------------------------------------------------
  // LedgerPort — close
  // -------------------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
