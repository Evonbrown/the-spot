/*
 * src/lib/auth/identifier.ts
 *
 * WHAT: Small checks for "email or student ID" (Step 39a, SRS Section 3:
 *       "All users shall log in with their email or student ID and a
 *       password"):
 *         isValidPhone(text)          -> a real-looking phone number?
 *         isValidEmail(text)          -> does it look like an email?
 *         isStudentId(text)           -> exactly 9 digits (e.g. 620165372)?
 *         parseLoginIdentifier(text)  -> what was typed in the login box:
 *                                        an email, a student ID, or a message;
 *         readStudentIdInput(text)    -> the OPTIONAL student ID field at
 *                                        sign-up / on "My account": empty =
 *                                        none, else 9 digits, or a message.
 *
 * LAYER: Application layer (shared rules). Used by the Server Actions
 *        (actions.ts, account-actions.ts). The database checks the same
 *        9-digit rule again (migration 0022).
 *
 * No imports and no "use server", so it is also easy to test.
 */

/* Exactly 9 digits, the same rule as the database CHECK (0022). */
const STUDENT_ID = /^[0-9]{9}$/;

/*
 * isValidPhone("876-555-1234") -> true
 * Allows digits, spaces, dashes and one leading "+". Must contain 7 to 15 digits
 * (15 is the international maximum). FR-04/FR-05 need a real number for the
 * driver and for SMS alerts, so phone is REQUIRED. (Moved here from
 * actions.ts in Step 39a, so "My account" uses the same rule as sign-up.)
 */
export function isValidPhone(phone: string): boolean {
  if (!/^\+?[0-9\s-]+$/.test(phone)) return false;
  const digitCount = phone.replace(/\D/g, "").length; // \D = "not a digit"
  return digitCount >= 7 && digitCount <= 15;
}

// A simple email shape check: something@something.something
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* isStudentId("620165372") -> true; "62016537" (8 digits) -> false. */
export function isStudentId(text: string): boolean {
  return STUDENT_ID.test(text);
}

/*
 * parseLoginIdentifier(text) -> { kind, value } or { error }.
 *   "Jane@Example.com " -> { kind: "email", value: "jane@example.com" }
 *   " 620165372"        -> { kind: "studentId", value: "620165372" }
 *   "62016"             -> { error: "Enter your email or your 9-digit student ID." }
 * Emails are made lowercase (Supabase stores them lowercase).
 */
export function parseLoginIdentifier(
  text: string
): { kind: "email" | "studentId"; value: string } | { error: string } {
  const value = text.trim();
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return isValidEmail(email) ? { kind: "email", value: email } : { error: "Enter your email or your 9-digit student ID." };
  }
  if (isStudentId(value)) return { kind: "studentId", value };
  return { error: "Enter your email or your 9-digit student ID." };
}

/*
 * readStudentIdInput(text) -> { studentId } (null = none given) or { error }.
 * Spaces are ignored ("620 165 372" is fine), because people often type
 * long numbers in groups.
 */
export function readStudentIdInput(text: string): { studentId: string | null } | { error: string } {
  const value = text.replace(/\s/g, "");
  if (value === "") return { studentId: null };
  if (!isStudentId(value)) return { error: "A student ID is exactly 9 digits, e.g. 620165372." };
  return { studentId: value };
}
