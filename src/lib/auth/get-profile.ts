/*
 * src/lib/auth/get-profile.ts
 *
 * WHAT: getCurrentProfile() answers "who is logged in, and what is their role?"
 *       It returns the logged-in user's row from the "profiles" table, or null
 *       if nobody is logged in.
 * LAYER: Application layer (server only). The header uses it now; in the next
 *        part, the role checks (e.g. "only managers may open /manager") reuse it.
 */

import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles"; // the 5 role names live in roles.ts

// What one row of the profiles table looks like (plus the email from Supabase Auth).
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
};

/*
 * getCurrentProfile()
 * Step 1: ask Supabase Auth who is logged in. getClaims() reads the login token
 *         from the cookie and CHECKS ITS SIGNATURE, so a faked cookie is rejected.
 *         (Never trust a user id that just comes from the browser.)
 * Step 2: load that user's row from profiles. RLS (Part 2) only allows a user to
 *         read their OWN row, so this can never return someone else's profile.
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
export async function getCurrentProfile(): Promise<Profile | null> {
  await connection(); // login/role info must be worked out fresh on every request
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) {
    console.error("getCurrentProfile: could not read auth claims:", claimsError.message);
    return null;
  }
  const claims = claimsData?.claims;
  if (!claims) return null; // nobody is logged in

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role")
    .eq("id", claims.sub) // "sub" (subject) = the logged-in user's id
    .maybeSingle();

  if (profileError) {
    console.error("getCurrentProfile: could not read profile:", profileError.message);
    return null;
  }
  if (!profile) return null;

  return { ...profile, email: claims.email ?? "" } as Profile;
}
