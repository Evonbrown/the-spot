/*
 * src/lib/auth/login-messages.ts
 *
 * WHAT: The messages a failed login shows (Steps 39a / 39b), in ONE place:
 *         LOGIN_FAILED                 -> "Email/student ID or password is
 *                                         incorrect."
 *         failedLoginMessage(...)      -> the same, plus "2 tries left before
 *                                         a 15-minute lock." from the 3rd
 *                                         failure in a row;
 *         lockedMessage(until)         -> "Too many failed attempts. Try again
 *                                         at 2:45 p.m."
 *
 * LAYER: Application layer (shared text + small rules). Used by the logIn
 *        action (actions.ts). No server-only code, so it's easy to test.
 *
 * SECURITY: unknown emails / student IDs are counted the same way as real
 * accounts (migration 0023), so they get EXACTLY the same messages: nothing
 * here reveals whether an account exists.
 */

import { formatJamaicaTime } from "@/lib/order-rules";

/* The ONE message for every failed login (unknown email / ID or wrong password). */
export const LOGIN_FAILED = "Email/student ID or password is incorrect.";

/* From which failure in a row the "tries left" warning appears (decision: the 3rd). */
export const WARN_FROM_FAILURE = 3;

/*
 * failedLoginMessage(failedCount, maxFails, lockMinutes):
 *   1st or 2nd failure -> just LOGIN_FAILED;
 *   3rd (of 5)         -> "... 2 tries left before a 15-minute lock.";
 *   4th (of 5)         -> "... 1 try left before a 15-minute lock."
 * (The 5th failure locks the account, which has its own message.)
 */
export function failedLoginMessage(failedCount: number, maxFails: number, lockMinutes: number): string {
  const left = maxFails - failedCount;
  if (failedCount < WARN_FROM_FAILURE || left <= 0) return LOGIN_FAILED;
  return `${LOGIN_FAILED} ${left} ${left === 1 ? "try" : "tries"} left before a ${lockMinutes}-minute lock.`;
}

/*
 * "Too many failed attempts. Try again at 2:45 p.m." (Jamaica time).
 * The time already ends with "a.m." / "p.m.", so no extra full stop is added
 * (otherwise it would read "p.m..").
 */
export function lockedMessage(until: Date): string {
  const time = formatJamaicaTime(until.getTime());
  return `Too many failed attempts. Try again at ${time}${time.endsWith(".") ? "" : "."}`;
}
