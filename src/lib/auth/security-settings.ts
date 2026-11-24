/*
 * src/lib/auth/security-settings.ts   (SERVER ONLY)
 *
 * WHAT: The security numbers from SRS Section 3, in ONE place (Step 39):
 *         LOCK_AFTER_FAILS = 5   -> failed logins in a row before a lock;
 *         lockMinutes()          -> how long the lock lasts: 15 minutes
 *                                   (1 minute in the laptop test mode).
 *       (Step 39c adds the staff idle-logout times here.)
 *
 * LAYER: Application layer. The logIn action (actions.ts) reads these and
 *        passes them to the database functions (migration 0023), so the
 *        numbers are written only here.
 *
 * TEST MODE: TEST_SHORT_SECURITY_TIMERS=true in .env.local, on `npm run dev`
 * only (see test-settings.ts for why it can never work on the live site).
 */

import "server-only";
import { isShortSecurityTimersOn } from "@/lib/test-settings";

/* SRS Section 3: "lock account 15 min after 5 failed logins". */
export const LOCK_AFTER_FAILS = 5;
const LOCK_MINUTES = 15;
const TEST_LOCK_MINUTES = 1;

/* How long a lock lasts right now (in minutes). */
export function lockMinutes(): number {
  return isShortSecurityTimersOn() ? TEST_LOCK_MINUTES : LOCK_MINUTES;
}
