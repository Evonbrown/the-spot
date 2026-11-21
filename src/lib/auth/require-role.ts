/*
 * src/lib/auth/require-role.ts
 *
 * WHAT: requireRole(["manager"]) is the guard for protected screens. It:
 *         - sends you to /login if you are NOT logged in;
 *         - sends you to /no-access if your role is not in the allowed list;
 *         - otherwise gives back your profile so the page can use it.
 * LAYER: Application layer (runs on the server only).
 *
 * WHY IN EVERY PAGE (and not once in a shared layout)?
 * In this Next.js version a layout does NOT re-run when you move between pages,
 * so a check that only lives in a layout can be skipped. The Next.js docs say to
 * do auth checks close to the page/data instead. So each protected page calls
 * requireRole itself. Later, every Server Action that changes data (e.g. "update
 * order status") will call it too, because an action can be called directly,
 * without the page.
 *
 * SRS 3 Security: role-based access enforced by server checks (this) + RLS (database).
 */

import { redirect } from "next/navigation";
import { getCurrentProfile, type Profile } from "@/lib/auth/get-profile";
import type { UserRole } from "@/lib/auth/roles";

/*
 * options.returnTo: where to come back to after logging in, e.g. "/checkout".
 * It's added to the login address (/login?next=/checkout), so a customer who
 * was sent to log in during checkout lands back on checkout afterwards.
 */
export async function requireRole(
  allowedRoles: UserRole[],
  options: { returnTo?: string } = {}
): Promise<Profile> {
  const profile = await getCurrentProfile();

  // Authentication: WHO are you? Not logged in -> go and log in.
  if (!profile) {
    redirect(
      options.returnTo ? `/login?next=${encodeURIComponent(options.returnTo)}` : "/login"
    );
  }

  // Authorization: are you ALLOWED here? Wrong role -> the "no access" page.
  // (Strict for now: each role may only open its own screen.)
  if (!allowedRoles.includes(profile.role)) redirect("/no-access");

  return profile;
}
