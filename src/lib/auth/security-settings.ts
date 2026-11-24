/*
 * src/lib/auth/security-settings.ts   (SERVER ONLY)
 *
 * WHAT: The security numbers from SRS Section 3, in ONE place (Step 39):
 *         LOCK_AFTER_FAILS = 5   -> failed logins in a row before a lock;
 *         lockMinutes()          -> how long the lock lasts: 15 minutes
 *                                   (1 minute in the laptop test mode).
 *         idleTimes()            -> Step 39c: staff idle logout (30 min,
 *                                   warning at 28; 2 / 1 in test mode).
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

// ---- Step 39c: staff idle logout (SRS Section 3: "30 min idle") ----------------

const MINUTE = 60_000;

/*
 * idleTimes() -> the staff idle-logout times (milliseconds):
 *   idleMs        the browser logs out after this long without activity
 *                 (30 minutes; 2 minutes in test mode);
 *   warnMs        the warning appears this long BEFORE that (2 minutes, so
 *                 at 28 minutes; 1 minute in test mode);
 *   serverLimitMs the server's own limit = idleMs + a GRACE of 2 minutes
 *                 (1 in test mode). WHY a grace? The browser tells the server
 *                 about activity at most once a minute, so the server's "last
 *                 active" can be up to a minute older than the browser's. The
 *                 grace makes sure the server never logs someone out BEFORE
 *                 their own screen's warning has finished.
 */
export function idleTimes(): { idleMs: number; warnMs: number; serverLimitMs: number } {
  if (isShortSecurityTimersOn()) {
    return { idleMs: 2 * MINUTE, warnMs: 1 * MINUTE, serverLimitMs: 3 * MINUTE };
  }
  return { idleMs: 30 * MINUTE, warnMs: 2 * MINUTE, serverLimitMs: 32 * MINUTE };
}
