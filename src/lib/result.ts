/**
 * Result<T, E> — explicit success/failure discriminated union.
 *
 * Domain functions return Result instead of throwing, keeping error paths
 * visible at the call site. Services may propagate or unwrap as needed.
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Construct a success result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construct a failure result. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Narrow to success. */
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok === true;
}

/** Narrow to failure. */
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return r.ok === false;
}

/**
 * Unwrap a Result, throwing a descriptive error if it is Err.
 * Only use in tests or at top-level service boundaries where you
 * truly cannot recover.
 */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`Result.unwrap called on Err: ${String(r.error)}`);
}

/**
 * Map the value of an Ok result; pass Err through unchanged.
 */
export function map<T, U, E>(
  r: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (r.ok) return ok(fn(r.value));
  return r;
}
