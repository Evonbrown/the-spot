/*
 * src/lib/auth/activity-actions.ts
 *
 * WHAT: stillHere(): the browser's "this staff member is really using the
 *       app" message (Step 39c). StaffIdleWatcher sends it when they tap,
 *       type or scroll, at most once a minute. The server then records the
 *       time (touch_staff_activity, migration 0025).
 *
 * LAYER: Application layer. Uses the secret key (only our server may record
 *        activity), and takes WHO from the signed login cookie, never from
 *        the browser.
 *
 * Returns { loggedOut: true } when the person is no longer logged in, or was
 * already idle too long: a late "still here" can't bring an idle session back.
 *
 * "use server" = runs on the server; the browser can only ask it to run.
 */
"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { isStaffRole } from "@/lib/auth/idle-rules";
import { createAdminClient } from "@/lib/supabase/admin";

export async function stillHere(): Promise<{ ok: true } | { loggedOut: true }> {
  // null = not logged in, OR a staff member who is already idle (get-profile.ts).
  const profile = await getCurrentProfile();
  if (!profile) return { loggedOut: true };
  if (!isStaffRole(profile.role)) return { ok: true }; // customers aren't tracked

  const admin = createAdminClient();
  const { error } = await admin.rpc("touch_staff_activity", { p_user_id: profile.id });
  if (error) console.error("touch_staff_activity failed:", error.message);
  return { ok: true };
}
