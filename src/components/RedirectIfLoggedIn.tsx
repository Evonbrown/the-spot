/*
 * src/components/RedirectIfLoggedIn.tsx
 *
 * WHAT: Put this on the log-in and sign-up pages. If you are ALREADY logged in,
 *       it sends you onwards instead (e.g. a manager goes to /manager, and a
 *       customer who came from checkout goes back to /checkout).
 *       If you're not logged in, it shows nothing and the form appears as normal.
 * LAYER: Presentation (uses getCurrentProfile and pathAfterLogin from the
 *        Application layer).
 *
 * It must be placed inside <Suspense>, because it reads the login cookie and
 * the address (?next=...).
 */

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { pathAfterLogin } from "@/lib/auth/safe-next";

/*
 * searchParams = the ?...=... part of the address, handed over by the page.
 * It's a Promise (a value that arrives later) in this Next.js version, so we
 * "await" it, and only when someone is logged in.
 *
 * WHY pathAfterLogin and not just ROLE_HOME? Right after a customer logs in,
 * Next.js refreshes this (still loaded) login page too. If this said "go to /"
 * while the logIn action said "go to /checkout", the customer could land on
 * Home. Using the same rule as the action means both say /checkout.
 */
export default async function RedirectIfLoggedIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null; // not logged in: render nothing

  const { next } = await searchParams;
  redirect(pathAfterLogin(profile.role, next));
}
