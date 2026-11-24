/*
 * src/lib/payments/supervisor-rules.ts
 *
 * WHAT: Small checks for the Supervisor screen:
 *       Step 38a (Lynk, FR-02):
 *         NOTE_MAX           -> the longest "not received" note (200);
 *         readNote(value)    -> the note, trimmed, or a message if too long;
 *         readOrderId(value) -> a real Order ID, or null.
 *       Step 38b (refunds, UC-07):
 *         parseRefundAmount(text), refundableAmount(paid, refunded),
 *         checkRefund(amount, refundable), readRefundReason(value).
 *
 * LAYER: Application layer. Used by the Server Actions (supervisor-actions.ts)
 *        and by the screen for an instant hint. The database checks the
 *        same rules again (migrations 0020 and 0021).
 *
 * WHY A SEPARATE FILE? A "use server" file may only export async functions,
 * so plain helpers and numbers that the screen also uses live here.
 */

/* Same number as the database CHECK (0020): change both together. */
export const NOTE_MAX = 200;

/*
 * readNote(value) -> { note } (may be "") or { error }.
 * The browser can send anything, so we check the type too.
 */
export function readNote(value: unknown): { note: string } | { error: string } {
  if (value === undefined || value === null) return { note: "" };
  if (typeof value !== "string") return { error: "That note isn't valid." };
  const note = value.trim();
  if (note.length > NOTE_MAX) return { error: `The note can be at most ${NOTE_MAX} characters.` };
  return { note };
}

/* readOrderId(1043) -> 1043; anything that isn't a positive whole number -> null. */
export function readOrderId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

// =============================================================================
// Step 38b: refunds (UC-07). The database checks all of this AGAIN
// (issue_refund, migration 0021).
// =============================================================================

/* The reason's length (same numbers as the database CHECK, 0021). */
export const REFUND_REASON_MIN = 10;
export const REFUND_REASON_MAX = 500;

/* Biggest amount we accept (anything bigger is a typing mistake). */
const MAX_REFUND = 99_999_999;

/*
 * parseRefundAmount("J$1,200.50") -> { amount: 1200.5 } or { error }.
 * The Supervisor may type "J$", "$", commas or spaces; at most 2 decimals;
 * more than 0.
 */
export function parseRefundAmount(text: string): { amount: number } | { error: string } {
  const cleaned = text.replace(/j\$|\$|,|\s/gi, "");
  if (cleaned === "") return { error: "Enter the amount to refund." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: "Enter a plain amount, e.g. 500 or 500.50." };
  const amount = Number(cleaned);
  if (amount <= 0) return { error: "The refund must be more than J$0." };
  if (amount > MAX_REFUND) return { error: "That amount is too large." };
  return { amount };
}

/*
 * refundableAmount(paid, refunded) -> what can still be refunded.
 * Worked out in CENTS (whole numbers), so 1000 - 333.33 is exactly 666.67.
 */
export function refundableAmount(paid: number, refunded: number): number {
  return Math.max(0, Math.round(paid * 100) - Math.round(refunded * 100)) / 100;
}

/*
 * checkRefund(amount, refundable) -> null (OK) or a message.
 * All refunds together can never be more than what was paid.
 */
export function checkRefund(amount: number, refundable: number): string | null {
  if (refundable <= 0) return "This order is already fully refunded.";
  if (Math.round(amount * 100) > Math.round(refundable * 100)) {
    const most = refundable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `You can refund at most J$${most}.`;
  }
  return null;
}

/* readRefundReason(value) -> { reason } (trimmed) or { error }. */
export function readRefundReason(value: unknown): { reason: string } | { error: string } {
  if (typeof value !== "string") return { error: "Write the reason for the refund." };
  const reason = value.trim();
  if (reason.length < REFUND_REASON_MIN) {
    return { error: `Write the reason for the refund (at least ${REFUND_REASON_MIN} characters).` };
  }
  if (reason.length > REFUND_REASON_MAX) {
    return { error: `The reason can be at most ${REFUND_REASON_MAX} characters.` };
  }
  return { reason };
}
