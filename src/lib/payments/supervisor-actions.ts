/*
 * src/lib/payments/supervisor-actions.ts
 *
 * WHAT: The Server Actions behind the Supervisor's Lynk buttons (Step 38a,
 *       FR-02, FR-06, UC-07):
 *         verifyLynkPayment(orderId)       "I can see the money in Lynk"
 *                                          -> the payment becomes PAID (and
 *                                          counts in the sales reports);
 *         flagNotReceived(orderId, note)   "It's NOT in Lynk" -> flagged,
 *                                          still UNPAID.
 *
 * LAYER: Application layer. The list (Presentation) only calls these. They
 *        check WHO is asking (Supervisor only), then call the database
 *        functions (Data layer, migration 0020), which check everything
 *        AGAIN and save in one transaction.
 *
 * WHY THE SECRET KEY? Nobody can change payments with the public key (only
 * SELECT is granted). The write functions can only be run by our server,
 * and we pass WHO is acting from the signed login cookie, never from the
 * browser.
 *
 * MESSAGES: our own database messages arrive with code "P0001" and are shown
 * as they are; a closed day (Step 36) gets the shared "This day is closed"
 * message; anything else gets a general "try again".
 *
 * "use server" = the browser can ask the server to run these, but the code
 * itself never goes to the browser.
 */
"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { readNote, readOrderId } from "@/lib/payments/supervisor-rules";
import { DAY_CLOSED_MESSAGE, isDayClosedError } from "@/lib/reports/closeout-rules";
import { createAdminClient } from "@/lib/supabase/admin";

/* What the list gets back: ok, or a message to show. */
export type SupervisorResult = { ok: true } | { ok: false; error: string };

/*
 * supervisorId() -> the logged-in Supervisor's id, or a message.
 * FR-02 / UC-07: ONLY the Supervisor verifies Lynk payments.
 */
async function supervisorId(): Promise<{ id: string } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Please log in again." };
  if (profile.role !== "supervisor") return { error: "Only the Supervisor can do this." };
  return { id: profile.id };
}

/*
 * callDatabase(fn, args, changedMessage) -> ok, or a message.
 * The functions return FALSE when the payment was already verified by
 * someone else a moment ago: then nothing changed, and we say so.
 */
async function callDatabase(
  fn: string,
  args: Record<string, unknown>,
  changedMessage: string
): Promise<SupervisorResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    console.error(`${fn} failed:`, error.message);
    if (isDayClosedError(error.message)) return { ok: false, error: DAY_CLOSED_MESSAGE };
    return {
      ok: false,
      error: error.code === "P0001" ? error.message : "We couldn't save that. Please try again.",
    };
  }
  if (data !== true) return { ok: false, error: changedMessage };
  return { ok: true };
}

// ---- 1. Verify: the money is in the Lynk app ---------------------------------
export async function verifyLynkPayment(rawOrderId: unknown): Promise<SupervisorResult> {
  const who = await supervisorId();
  if ("error" in who) return { ok: false, error: who.error };
  const orderId = readOrderId(rawOrderId);
  if (orderId === null) return { ok: false, error: "That Order ID isn't valid." };

  return callDatabase(
    "verify_lynk_payment",
    { p_order_id: orderId, p_supervisor: who.id },
    "Someone else already verified this payment."
  );
}

// ---- 2. Not received: flag it (it stays UNPAID) ------------------------------
export async function flagNotReceived(rawOrderId: unknown, rawNote: unknown): Promise<SupervisorResult> {
  const who = await supervisorId();
  if ("error" in who) return { ok: false, error: who.error };
  const orderId = readOrderId(rawOrderId);
  if (orderId === null) return { ok: false, error: "That Order ID isn't valid." };
  const note = readNote(rawNote);
  if ("error" in note) return { ok: false, error: note.error };

  return callDatabase(
    "flag_lynk_not_received",
    { p_order_id: orderId, p_note: note.note, p_supervisor: who.id },
    "This payment was verified meanwhile, so there's nothing to flag."
  );
}
