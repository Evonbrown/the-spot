/*
 * src/lib/auth/safe-next.ts
 *
 * WHAT: safeNextPath(value) checks a "where to go after logging in" address
 *       (the ?next=... part of /login?next=/checkout) and only accepts paths
 *       inside OUR site.
 *
 * LAYER: Application layer (a security rule). Pure function, browser-safe.
 *
 * WHY: Usability: a customer who taps Checkout while logged out should land
 *      back on checkout after logging in or signing up, not on the Home page.
 *      Security: without this check, someone could share a trick link like
 *      /login?next=https://evil.example, and after logging in on OUR page the
 *      victim would be sent to a fake site (an "open redirect" attack).
 *
 * Accepts:  "/checkout", "/cart"
 * Refuses:  "https://evil.example", "//evil.example", "/\evil.example",
 *           "checkout" (no leading /), empty, very long values
 */
import { ROLE_HOME, type UserRole } from "@/lib/auth/roles";

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 200) return null;

  // Must be a path on our site: starts with ONE "/".
  // "//evil.example" and "/\evil.example" are read by browsers as OTHER websites.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;

  // No control characters (e.g. hidden line breaks).
  if (/[\u0000-\u001f]/.test(value)) return null;

  return value;
}

/*
 * pathAfterLogin(role, next) -> where a logged-in user should go.
 *   customer + a safe next (e.g. "/checkout") -> next
 *   otherwise                                 -> the role's own screen (ROLE_HOME)
 * Staff always go to their own screen (decision: strict role screens).
 *
 * WHY ONE SHARED FUNCTION? Two pieces of code send a logged-in user onwards:
 *   1. the logIn / signUp actions, right after logging in;
 *   2. RedirectIfLoggedIn on the login/sign-up pages.
 * Our bug: (2) didn't know about "next", so for a customer it said "go to /"
 * while (1) said "go to /checkout". Next.js keeps the login page alive in the
 * background and refreshes it after logging in, so (2) could win and the
 * customer landed on Home. With one rule, both always give the SAME answer.
 */
export function pathAfterLogin(role: UserRole, next: unknown): string {
  const safeNext = safeNextPath(next);
  if (role === "customer" && safeNext) return safeNext;
  return ROLE_HOME[role];
}
