/**
 * Money — integer minor-unit currency value.
 *
 * All monetary amounts in this fixture are represented as integer minor units
 * (e.g. paise for INR, cents for USD). Never use floating-point for money.
 *
 * Examples:
 *   ₹10,000.00 = { amount: 1_000_000, currency: "INR" }
 *   $50.00     = { amount: 5_000,     currency: "USD" }
 */
export interface Money {
  readonly amount: number;   // integer minor units; must be >= 0
  readonly currency: string; // ISO 4217 currency code, e.g. "INR"
}

/** Create a Money value. Throws if amount is negative or non-integer. */
export function money(amount: number, currency: string): Money {
  if (!Number.isInteger(amount)) {
    throw new Error(`money: amount must be an integer, got ${amount}`);
  }
  if (amount < 0) {
    throw new Error(`money: amount must be >= 0, got ${amount}`);
  }
  return { amount, currency };
}

/** Add two Money values. Currencies must match. */
export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

/**
 * Subtract b from a. Currencies must match.
 * Throws if the result would be negative.
 */
export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  if (b.amount > a.amount) {
    throw new Error(
      `money.subtract: result would be negative (${a.amount} - ${b.amount})`
    );
  }
  return money(a.amount - b.amount, a.currency);
}

/**
 * Compare two Money values. Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

/** Return true if a <= b (same currency). */
export function lte(a: Money, b: Money): boolean {
  return compare(a, b) <= 0;
}

/** Return true if a > b (same currency). */
export function gt(a: Money, b: Money): boolean {
  return compare(a, b) > 0;
}

/**
 * Format a Money value as a human-readable string for logging/debugging.
 * NOT intended for production display (no locale formatting).
 */
export function format(m: Money): string {
  return `${m.currency} ${m.amount}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `money: currency mismatch: ${a.currency} vs ${b.currency}`
    );
  }
}
