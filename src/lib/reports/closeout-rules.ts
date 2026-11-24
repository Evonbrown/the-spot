/*
 * src/lib/reports/closeout-rules.ts
 *
 * WHAT: Small rules for the daily closeout (Step 36, FR-06 SR-6.7 / SR-6.8),
 *       shared by the closeout box (instant hints) and the server actions
 *       (which decide):
 *         parseCashAmount(text)          -> the J$ amount typed, or a message;
 *         needsExplanation(diff, limit)  -> is the difference too big to pass
 *                                           without a written explanation?
 *       The database functions (migration 0019) check the same rules again.
 *
 * LAYER: Application layer (business rules). Browser-safe.
 */

/* Explanations and reasons must say something real ... */
export const REASON_MIN = 10;
/* ... but not a whole essay (same limits as the database). */
export const TEXT_MAX = 500;
/* The largest amount the database accepts for a cash count. */
const MAX_AMOUNT = 99_999_999;

/*
 * parseCashAmount("J$2,650.50") -> { amount: 2650.5 } or { error }.
 * People type money in many ways, so we remove "J$", "$", commas and spaces
 * first. Then it must be a plain number with at most 2 decimals (cents).
 */
export function parseCashAmount(text: string): { amount: number } | { error: string } {
  const cleaned = text.replace(/j\$|\$|,|\s/gi, "");
  if (cleaned === "") return { error: "Enter the amount (J$0 or more)." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { error: "Enter a plain amount, e.g. 2650 or 2650.50." };
  }
  const amount = Number(cleaned);
  if (amount > MAX_AMOUNT) return { error: "That amount is too large." };
  return { amount };
}

/*
 * needsExplanation(difference, limit) -> true when the difference (over OR
 * short) is MORE than the Manager's limit. Compared in cents (whole numbers),
 * so J$500.00 vs J$500 never goes wrong by a fraction.
 */
export function needsExplanation(difference: number, limit: number): boolean {
  return Math.abs(Math.round(difference * 100)) > Math.round(limit * 100);
}

/* counted - expected, in cents and back (no 0.1 + 0.2 surprises). */
export function cashDifference(counted: number, expected: number): number {
  return (Math.round(counted * 100) - Math.round(expected * 100)) / 100;
}

// =============================================================================
// A CLOSED day (the lock from migration 0019)
// =============================================================================

/* What staff see when they try to change an order of a closed day. */
export const DAY_CLOSED_MESSAGE = "This day is closed. The Manager must reopen it before orders can change.";

/*
 * isDayClosedError(message) -> true if a database error is the LOCK
 * refusing a change ("Order 1061: the business day 2026-11-24 is closed, so
 * it can't change ..."; written by us in 0019's lock triggers). Used by the
 * status, driver and delivery actions, so they show DAY_CLOSED_MESSAGE
 * instead of a general "try again".
 */
export function isDayClosedError(message: string | undefined): boolean {
  return typeof message === "string" && /the business day \d{4}-\d{2}-\d{2} is closed/.test(message);
}
