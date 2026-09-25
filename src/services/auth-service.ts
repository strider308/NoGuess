/**
 * AuthService — login, logout, and token validation.
 *
 * Issues sessions with fake-clock expiry. Tokens are opaque IDs
 * stored in the session store; no JWT library is used.
 */
import type { ClockPort } from "../lib/clock.js";
import type { IdFactory } from "../lib/ids.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { AuthSession, VerifiedToken } from "../domain/auth.js";
import { verifyTokenAgainstSession } from "../domain/auth.js";
import type { User } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";
import type { PolicyConfig } from "./policy.js";
import type { FakeKms } from "../infrastructure/fake-kms.js";

// ---------------------------------------------------------------------------
// Stores managed by this service
// ---------------------------------------------------------------------------

/** Sessions are keyed by session id AND indexed by token for fast lookup. */
export class AuthService {
  private readonly sessions = new TenantStore<AuthSession>();
  /** Secondary index: token → sessionId */
  private readonly tokenIndex = new Map<string, string>();

  constructor(
    private readonly userStore: TenantStore<User>,
    private readonly clock: ClockPort,
    private readonly ids: IdFactory,
    private readonly policy: PolicyConfig,
    private readonly kms: FakeKms
  ) {}

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  /**
   * Authenticate a user by tenantId, userId, and plaintext password.
   * Returns a new AuthSession on success.
   *
   * The password is compared against the stored passwordHash using FakeKms.
   * (FakeKms is TEST-ONLY; this is not real password security.)
   */
  login(
    tenantId: string,
    userId: string,
    plaintextPassword: string
  ): Result<AuthSession, string> {
    const user = this.userStore.get(userId);
    if (!user) {
      return err(`login failed: user ${userId} not found`);
    }
    if (user.tenantId !== tenantId) {
      return err(`login failed: user does not belong to tenant ${tenantId}`);
    }

    // Verify password via FakeKms round-trip.
    let storedPassword: string;
    try {
      storedPassword = this.kms.decrypt(user.passwordHash, this.kms.keyId);
    } catch {
      return err("login failed: credential verification error");
    }
    if (storedPassword !== plaintextPassword) {
      return err("login failed: invalid credentials");
    }

    const now = this.clock.now();
    const sessionId = this.ids.next("session");
    const token = this.ids.next("token");

    const session: AuthSession = {
      id: sessionId,
      tenantId,
      userId,
      token,
      issuedAt: now,
      expiresAt: now + this.policy.sessionTtlSeconds * 1_000,
      status: "ACTIVE",
    };

    this.sessions.set(session);
    this.tokenIndex.set(token, sessionId);
    return ok(session);
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  /**
   * Revoke a session by token. Idempotent — revoking an already-revoked
   * session is not an error.
   */
  logout(token: string): Result<void, string> {
    const sessionId = this.tokenIndex.get(token);
    if (!sessionId) {
      return err(`logout failed: token not found`);
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(`logout failed: session not found`);
    }
    session.status = "REVOKED";
    this.sessions.set(session);
    return ok(undefined);
  }

  // -------------------------------------------------------------------------
  // Token validation
  // -------------------------------------------------------------------------

  /** Validate a token and return verified identity information. */
  validateToken(token: string): Result<VerifiedToken, string> {
    const sessionId = this.tokenIndex.get(token);
    if (!sessionId) {
      return err("invalid token: not found");
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err("invalid token: session not found");
    }
    return verifyTokenAgainstSession(token, session, this.clock.now());
  }

  // -------------------------------------------------------------------------
  // Inspection helpers (for tests)
  // -------------------------------------------------------------------------

  getSession(sessionId: string): AuthSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByToken(token: string): AuthSession | undefined {
    const id = this.tokenIndex.get(token);
    return id ? this.sessions.get(id) : undefined;
  }
}
