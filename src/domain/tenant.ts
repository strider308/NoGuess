/**
 * Tenant and User domain model.
 *
 * Defines the fundamental multi-tenancy primitives:
 * - Tenant (an isolated organizational boundary)
 * - User (a human actor belonging to exactly one tenant)
 * - Role (the set of capabilities a user has within their tenant)
 *
 * Ownership and isolation guards live here so they can be reused
 * across every service boundary without duplicating logic.
 */
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type Role = "ADMIN" | "MANAGER" | "BILLING" | "SUPPORT" | "MEMBER";

export const ALL_ROLES: Role[] = [
  "ADMIN",
  "MANAGER",
  "BILLING",
  "SUPPORT",
  "MEMBER",
];

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number; // Unix ms from FakeClock
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface User {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  /** Hashed/fake credential stored by fake KMS — never a real password. */
  readonly passwordHash: string;
  readonly roles: Role[];
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Actor context
// ---------------------------------------------------------------------------

/**
 * ActorContext — passed explicitly to every service operation that reads or
 * mutates tenant-owned resources.
 *
 * Services must validate:
 * 1. tenantId matches the resource's tenantId.
 * 2. roles satisfy the operation's required role set.
 *
 * Knowing another tenant's resource ID must never be enough to access it.
 */
export interface ActorContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly roles: Role[];
}

// ---------------------------------------------------------------------------
// Ownership guard
// ---------------------------------------------------------------------------

/**
 * Assert that a resource's tenantId matches the actor's tenantId.
 * Returns Err with a descriptive message when the check fails.
 */
export function assertTenantOwns(
  resourceTenantId: string,
  actor: ActorContext
): Result<void, string> {
  if (resourceTenantId !== actor.tenantId) {
    return err(
      `tenant isolation violation: actor belongs to tenant ${actor.tenantId} ` +
        `but resource belongs to tenant ${resourceTenantId}`
    );
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Role authorization guard
// ---------------------------------------------------------------------------

/**
 * Assert that the actor holds at least one of the required roles.
 * Returns Err with a descriptive message when the check fails.
 */
export function assertHasRole(
  actor: ActorContext,
  required: Role[]
): Result<void, string> {
  const has = actor.roles.some((r) => (required as string[]).includes(r));
  if (!has) {
    return err(
      `authorization denied: actor ${actor.userId} has roles [${actor.roles.join(", ")}] ` +
        `but operation requires one of [${required.join(", ")}]`
    );
  }
  return ok(undefined);
}

/**
 * Convenience: assert both tenant ownership and role requirement in one call.
 */
export function assertAuthorized(
  resourceTenantId: string,
  actor: ActorContext,
  required: Role[]
): Result<void, string> {
  const ownerCheck = assertTenantOwns(resourceTenantId, actor);
  if (!ownerCheck.ok) return ownerCheck;
  return assertHasRole(actor, required);
}
