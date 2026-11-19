/*
 * src/components/RedirectIfLoggedIn.tsx
 *
 * WHAT: Put this on the log-in and sign-up pages. If you are ALREADY logged in,
 *       it sends you to your own screen instead (e.g. a manager goes to /manager).
 *       If you're not logged in, it shows nothing and the form appears as normal.
 * LAYER: Presentation (uses getCurrentProfile from the Application layer).
 *
 * It must be placed inside <Suspense>, because it reads the login cookie.
 */

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { ROLE_HOME } from "@/lib/auth/roles";

export default async function RedirectIfLoggedIn() {
  const profile = await getCurrentProfile();
  if (profile) redirect(ROLE_HOME[profile.role]);
  return null; // not logged in: render nothing
}
