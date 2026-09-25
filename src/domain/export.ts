/**
 * Export domain model.
 *
 * Models a tenant-scoped data export job.
 *
 * Authorization:
 * - Only ADMIN or BILLING roles may enqueue an export.
 *
 * Scoping invariant:
 * - An export job must only contain records belonging to the requesting tenant.
 * - Cross-tenant data must never appear in export results.
 *
 * ExportScope determines which entity type is being exported.
 */
import type { Role } from "./tenant.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportScope =
  | "PAYMENTS"
  | "REFUNDS"
  | "ACCOUNTS"
  | "WEBHOOKS"
  | "AUDIT_LOG";

export type ExportStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export interface ExportJob {
  readonly id: string;
  readonly tenantId: string;
  readonly requestedBy: string; // userId
  readonly scope: ExportScope;
  status: ExportStatus;
  /** Number of records included in the completed export. */
  recordCount?: number;
  /** Opaque result reference (in-memory: just the array length or a summary). */
  resultRef?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ---------------------------------------------------------------------------
// Authorization constants
// ---------------------------------------------------------------------------

/** Roles permitted to enqueue an export. */
export const EXPORT_ALLOWED_ROLES: Role[] = ["ADMIN", "BILLING"];
