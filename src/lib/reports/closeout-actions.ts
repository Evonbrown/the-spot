/*
 * src/lib/reports/closeout-actions.ts
 *
 * WHAT: The Server Actions behind the closeout box (Step 36, FR-06 SR-6.6,
 *       SR-6.7, SR-6.8, SR-6.10):
 *         submitCloseoutCount(day, counted, note)  counter staff (TODAY) or
 *                                                  the Manager;
 *         approveCloseout(day, overrideReason)     Manager only;
 *         reopenCloseout(day, reason)              Manager only;
 *         setCashDifferenceLimit(limit)            Manager only.
 *
 * LAYER: Application layer. The box (Presentation) only calls these; the
 *        rules are in closeout-rules.ts AND in the database functions
 *        (Data layer, migration 0019), which check everything again and do
 *        the saving in one transaction.
 *
 * WHY THE SECRET KEY? Nobody can write closeouts with the public key (only
 * SELECT is granted). The write functions can only be run by our server,
 * and we pass WHO is acting from the login cookie, never from the browser.
 *
 * MESSAGES: the database functions raise clear, beginner-friendly messages
 * written by us (e.g. "2 order(s) from this day are still open..."). Those
 * arrive with error code "P0001" (= "raise exception"), so we show them as
 * they are. Any other database problem gets a general "try again".
 *
 * "use server" = the browser can ask the server to run these, but the code
 * itself never goes to the browser.
 */
"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { parseCashAmount, REASON_MIN, TEXT_MAX } from "@/lib/reports/closeout-rules";
import { createAdminClient } from "@/lib/supabase/admin";

/* What the box gets back: ok, or a message to show. */
export type CloseoutResult = { ok: true } | { ok: false; error: string };

/* Today's date in Jamaica, "YYYY-MM-DD" (the server runs on UTC). */
function jamaicaTodayNow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now());
}

/* A real "YYYY-MM-DD" date (the browser can send anything). */
function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/* A text field: a string, trimmed, at most 500 characters. */
function readText(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > TEXT_MAX ? null : text;
}

/*
 * whoCanDo(allowed) -> the logged-in profile if their role is allowed, or
 * a message. The id comes from the signed login cookie.
 */
type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;

async function whoCanDo(allowed: ("manager" | "counter_staff")[]): Promise<{ profile: Profile } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Please log in again." };
  if (!(allowed as string[]).includes(profile.role)) {
    return { error: "You aren't allowed to do this." };
  }
  return { profile };
}

/*
 * callDatabase(fn, args) -> ok, or a message. Our own messages from the
 * functions (code P0001) are shown as they are.
 */
async function callDatabase(fn: string, args: Record<string, unknown>): Promise<CloseoutResult> {
  const admin = createAdminClient();
  const { error } = await admin.rpc(fn, args);
  if (error) {
    console.error(`${fn} failed:`, error.message);
    return {
      ok: false,
      error: error.code === "P0001" ? error.message : "We couldn't save that. Please try again.",
    };
  }
  return { ok: true };
}

// ---- 1. Count the cash (SR-6.7) ---------------------------------------------
export async function submitCloseoutCount(
  rawDay: unknown,
  rawCounted: unknown,
  rawNote: unknown
): Promise<CloseoutResult> {
  const who = await whoCanDo(["manager", "counter_staff"]);
  if ("error" in who) return { ok: false, error: who.error };

  if (!isDay(rawDay)) return { ok: false, error: "That day isn't valid." };
  // SR-6.10: counter staff can only do TODAY (the database checks too).
  if (who.profile.role === "counter_staff" && rawDay !== jamaicaTodayNow()) {
    return { ok: false, error: "Counter staff can only close out today." };
  }
  if (typeof rawCounted !== "string") return { ok: false, error: "Enter the cash counted." };
  const counted = parseCashAmount(rawCounted);
  if ("error" in counted) return { ok: false, error: counted.error };
  const note = readText(rawNote);
  if (note === null) return { ok: false, error: `The explanation can be at most ${TEXT_MAX} characters.` };

  // The difference limit and open orders are checked by the database, with
  // the figures as they are RIGHT NOW (not as the page last saw them).
  return callDatabase("submit_closeout_count", {
    p_day: rawDay,
    p_counted: counted.amount,
    p_note: note,
    p_actor: who.profile.id,
  });
}

// ---- 2. Approve and lock (SR-6.8), Manager only -----------------------------
export async function approveCloseout(rawDay: unknown, rawOverrideReason: unknown): Promise<CloseoutResult> {
  const who = await whoCanDo(["manager"]);
  if ("error" in who) return { ok: false, error: who.error };
  if (!isDay(rawDay)) return { ok: false, error: "That day isn't valid." };
  const reason = readText(rawOverrideReason);
  if (reason === null) return { ok: false, error: `The reason can be at most ${TEXT_MAX} characters.` };

  return callDatabase("approve_closeout", {
    p_day: rawDay,
    p_override_reason: reason === "" ? null : reason,
    p_actor: who.profile.id,
  });
}

// ---- 3. Reopen (SR-6.8), Manager only, with a reason ------------------------
export async function reopenCloseout(rawDay: unknown, rawReason: unknown): Promise<CloseoutResult> {
  const who = await whoCanDo(["manager"]);
  if ("error" in who) return { ok: false, error: who.error };
  if (!isDay(rawDay)) return { ok: false, error: "That day isn't valid." };
  const reason = readText(rawReason);
  if (reason === null || reason.length < REASON_MIN) {
    return { ok: false, error: `Write why the day is being reopened (at least ${REASON_MIN} characters).` };
  }

  return callDatabase("reopen_closeout", { p_day: rawDay, p_reason: reason, p_actor: who.profile.id });
}

// ---- 4. The cash difference limit, Manager only -----------------------------
export async function setCashDifferenceLimit(rawLimit: unknown): Promise<CloseoutResult> {
  const who = await whoCanDo(["manager"]);
  if ("error" in who) return { ok: false, error: who.error };
  if (typeof rawLimit !== "string") return { ok: false, error: "Enter the limit." };
  const limit = parseCashAmount(rawLimit);
  if ("error" in limit) return { ok: false, error: limit.error };

  return callDatabase("set_cash_difference_limit", { p_limit: limit.amount, p_actor: who.profile.id });
}
