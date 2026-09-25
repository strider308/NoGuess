/**
 * Auth domain model.
 *
 * Models authentication sessions and token verification.
 * No real cryptography — tokens are opaque string IDs managed by the
 * fake session store in the auth service.
 */
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export type SessionStatus = "ACTIVE" | "REVOKED";

export interface AuthSession {
  readonly id: string;         // session ID (opaque)
  readonly tenantId: string;
  readonly userId: string;
  readonly token: string;      // opaque token string; maps 1-to-1 with session
  readonly issuedAt: number;   // Unix ms (FakeClock)
  readonly expiresAt: number;  // Unix ms (FakeClock)
  status: SessionStatus;
}

// ---------------------------------------------------------------------------
// Token verification result
// ---------------------------------------------------------------------------

export interface VerifiedToken {
  readonly sessionId: string;
  readonly tenantId: string;
  readonly userId: string;
}

// ---------------------------------------------------------------------------
// Domain predicates
// ---------------------------------------------------------------------------

/**
 * Return whether the session is currently valid at the given clock time.
 * A session must be ACTIVE and not past its expiry.
 */
export function isSessionValid(session: AuthSession, nowMs: number): boolean {
  return session.status === "ACTIVE" && nowMs < session.expiresAt;
}

/**
 * Verify a token against a resolved session.
 * The caller is responsible for looking up the session by token from the store.
 *
 * Returns Err if:
 * - The token does not match the session's stored token.
 * - The session is not valid at the given clock time.
 */
export function verifyTokenAgainstSession(
  token: string,
  session: AuthSession,
  nowMs: number
): Result<VerifiedToken, string> {
  if (session.token !== token) {
    return err("token does not match session");
  }
  if (!isSessionValid(session, nowMs)) {
    return err(
      session.status === "REVOKED"
        ? "session has been revoked"
        : "session has expired"
    );
  }
  return ok({
    sessionId: session.id,
    tenantId: session.tenantId,
    userId: session.userId,
  });
}
