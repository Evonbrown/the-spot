/*
 * src/lib/auth/idle-rules.ts
 *
 * WHAT: The rules for "staff are logged out after 30 minutes without
 *       activity" (Step 39c, SRS Section 3):
 *         STAFF_ROLES            -> the roles this applies to (NOT customers);
 *         isStaffRole(role)      -> is this a staff role?
 *         isStaffIdle(...)       -> has this staff member been idle too long
 *                                   (the SERVER's check)?
 *         idleStage(...)         -> what the browser timer should show now:
 *                                   "active", "warning" (with seconds left)
 *                                   or "logout".
 *
 * LAYER: Application layer (pure rules: no database, no browser). Used by
 *        getCurrentProfile (server) and StaffIdleWatcher (browser), so both
 *        follow the same rule. Easy to test.
 */

import type { UserRole } from "@/lib/auth/roles";

/* The staff roles (CLAUDE.md: Staff -> CounterStaff, DeliveryPersonnel, Manager; plus Supervisor). */
export const STAFF_ROLES: UserRole[] = ["counter_staff", "delivery_personnel", "manager", "supervisor"];

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

/*
 * isStaffIdle(role, lastActiveAt, now, limitMs) -> true = treat as LOGGED OUT.
 *   - customers: never (decision: customers aren't affected);
 *   - no activity recorded yet (null): not idle (e.g. logged in before
 *     Step 39c; the first tap records it);
 *   - otherwise: idle when more than limitMs has passed since the last
 *     activity the server heard about.
 */
export function isStaffIdle(role: UserRole, lastActiveAt: number | null, now: number, limitMs: number): boolean {
  if (!isStaffRole(role) || lastActiveAt === null) return false;
  return now - lastActiveAt > limitMs;
}

/*
 * idleStage(lastActivity, now, idleMs, warnMs) for the browser timer:
 *   idle < idleMs - warnMs          -> { stage: "active" }
 *   idle in the last warnMs         -> { stage: "warning", secondsLeft }
 *   idle >= idleMs                  -> { stage: "logout" }
 * e.g. idleMs 30 min, warnMs 2 min: the warning appears at 28 minutes.
 */
export function idleStage(
  lastActivity: number,
  now: number,
  idleMs: number,
  warnMs: number
): { stage: "active" } | { stage: "warning"; secondsLeft: number } | { stage: "logout" } {
  const idle = now - lastActivity;
  if (idle >= idleMs) return { stage: "logout" };
  if (idle >= idleMs - warnMs) return { stage: "warning", secondsLeft: Math.ceil((idleMs - idle) / 1000) };
  return { stage: "active" };
}
