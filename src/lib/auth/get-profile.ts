/*
 * src/lib/auth/get-profile.ts
 *
 * WHAT: Answers "who is logged in, and what is their role?"
 *         getLoginState()     -> { profile, idle }: the logged-in user's row
 *                                from "profiles" (or null), and whether a
 *                                STAFF member has been idle too long
 *                                (Step 39c);
 *         getCurrentProfile() -> the profile, or null if nobody is logged in
 *                                OR a staff member is idle (then they count
 *                                as logged out everywhere: header, pages,
 *                                every Server Action).
 * LAYER: Application layer (server only). The header, requireRole and every
 *        Server Action use it.
 */

import { connection } from "next/server";
import { isStaffIdle } from "@/lib/auth/idle-rules";
import type { UserRole } from "@/lib/auth/roles"; // the 5 role names live in roles.ts
import { idleTimes } from "@/lib/auth/security-settings";
import { createClient } from "@/lib/supabase/server";

// What one row of the profiles table looks like (plus the email from Supabase Auth).
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  student_id: string | null; // Step 39a: optional, 9 digits (log in with it)
  role: UserRole;
  last_active_at: string | null; // Step 39c: staff only (null = not recorded yet)
};

/*
 * getLoginState()
 * Step 1: ask Supabase Auth who is logged in. getClaims() reads the login token
 *         from the cookie and CHECKS ITS SIGNATURE, so a faked cookie is rejected.
 *         (Never trust a user id that just comes from the browser.)
 * Step 2: load that user's row from profiles. RLS (Part 2) only allows a user to
 *         read their OWN row, so this can never return someone else's profile.
 * Step 3 (Step 39c, SRS Section 3): a STAFF member whose last activity is
 *         older than the limit (30 min + 2 min grace) is "idle". Customers
 *         never are.
 *
 * WHY "await connection()" FIRST?
 * Next.js tries to prepare ("prerender") pages ahead of time, before anyone asks
 * for them. But to check whether a login token has expired, Supabase compares it
 * with the current time (Date.now()). A time worked out in advance would be wrong
 * by the time the user sees the page, so Next.js stops with a "Blocking Route" error.
 * connection() tells Next.js: "wait for the real visitor's request before running
 * the rest". So the login check always uses the real current time and is never
 * prepared in advance or saved for later.
 */
export async function getLoginState(): Promise<{ profile: Profile | null; idle: boolean }> {
  await connection(); // login/role info must be worked out fresh on every request
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) {
    console.error("getCurrentProfile: could not read auth claims:", claimsError.message);
    return { profile: null, idle: false };
  }
  const claims = claimsData?.claims;
  if (!claims) return { profile: null, idle: false }; // nobody is logged in

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone, student_id, role, last_active_at")
    .eq("id", claims.sub) // "sub" (subject) = the logged-in user's id
    .maybeSingle();

  if (profileError) {
    console.error("getCurrentProfile: could not read profile:", profileError.message);
    return { profile: null, idle: false };
  }
  if (!profile) return { profile: null, idle: false };

  const full = { ...profile, email: claims.email ?? "" } as Profile;
  const lastActive = full.last_active_at ? Date.parse(full.last_active_at) : null;
  const idle = isStaffIdle(full.role, lastActive, Date.now(), idleTimes().serverLimitMs);
  return { profile: full, idle };
}

/*
 * getCurrentProfile() -> the profile, or null.
 * An IDLE staff member gets null too, so every page and Server Action treats
 * them as logged out (pages send them to log in; actions say "Please log in
 * again."). requireRole uses getLoginState to also clear their cookies.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const { profile, idle } = await getLoginState();
  return idle ? null : profile;
}
