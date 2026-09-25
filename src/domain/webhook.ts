/**
 * Webhook domain model.
 *
 * Models webhook subscriptions and delivery attempts.
 *
 * A tenant may have multiple active webhook subscriptions.
 * Each delivery attempt is recorded regardless of outcome.
 * Failed deliveries are retry-eligible up to webhookMaxRetries.
 *
 * The delivery "endpoint" in this fixture is a fake handler function
 * reference — no real HTTP is performed.
 */
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookStatus = "ACTIVE" | "PAUSED" | "DELETED";

export interface WebhookSubscription {
  readonly id: string;
  readonly tenantId: string;
  /** Neutral human-readable label, e.g. "order.completed". */
  readonly eventType: string;
  /** Target endpoint label (fake — no real URL). */
  readonly endpointLabel: string;
  status: WebhookStatus;
  readonly createdAt: number;
}

export type DeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

export interface WebhookDelivery {
  readonly id: string;
  readonly subscriptionId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  status: DeliveryStatus;
  /** Number of delivery attempts made. */
  attempts: number;
  readonly createdAt: number;
  lastAttemptAt?: number;
}

// ---------------------------------------------------------------------------
// Retry eligibility
// ---------------------------------------------------------------------------

/**
 * Determine whether a delivery may be retried.
 *
 * @param delivery    The delivery record.
 * @param maxRetries  Max total attempts allowed (from PolicyConfig).
 */
export function isDeliveryRetryEligible(
  delivery: WebhookDelivery,
  maxRetries: number
): Result<void, string> {
  if (delivery.status !== "FAILED") {
    return err(
      `delivery ${delivery.id} is not in FAILED status (got ${delivery.status})`
    );
  }
  if (delivery.attempts >= maxRetries) {
    return err(
      `delivery ${delivery.id} has reached max retries ` +
        `(${delivery.attempts}/${maxRetries})`
    );
  }
  return ok(undefined);
}
