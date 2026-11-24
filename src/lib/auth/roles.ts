/*
 * src/lib/auth/roles.ts
 *
 * WHAT: Everything about our 5 roles in ONE place: the role names, how they are
 *       shown to people, and which screen each role "lives" on.
 * LAYER: Application layer (shared settings used by the header, the login
 *        action, the proxy and the page guard).
 *
 * WHY one file? If we ever change where a role's screen is, we change it here
 * and the login redirect, the header link and the proxy all update together.
 */

// The 5 roles, spelled exactly as in CLAUDE.md and our database enum (user_role).
// Do not rename these.
export type UserRole =
  | "customer"
  | "counter_staff"
  | "delivery_personnel"
  | "manager"
  | "supervisor";

// How each role is shown to people (the database uses underscores).
export const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Customer",
  counter_staff: "Counter staff",
  delivery_personnel: "Delivery",
  manager: "Manager",
  supervisor: "Supervisor",
};

/*
 * ROLE_HOME: the screen each role is sent to after logging in.
 * Customers use the public pages (Home and Menu), so their "home" is "/".
 * "Record<UserRole, string>" makes TypeScript complain if we forget a role.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  customer: "/",
  counter_staff: "/staff",
  delivery_personnel: "/driver",
  manager: "/manager",
  supervisor: "/supervisor",
};

// Short label for the header link to your own screen (short so it fits on phones).
// Customers have no extra link: they already have "Menu".
export const ROLE_SCREEN_LINK: Partial<Record<UserRole, string>> = {
  counter_staff: "Queue",
  delivery_personnel: "Deliveries",
  manager: "Reports",
  supervisor: "Payments",
};

// The screens that need a login (the staff screens + "My account", Step 39a).
// The proxy sends logged-out visitors away from these.
export const PROTECTED_PATHS = ["/staff", "/driver", "/manager", "/supervisor", "/account"];
