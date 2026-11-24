/*
 * src/lib/payments/supervisor-rules.ts
 *
 * WHAT: Small checks for the Supervisor's Lynk buttons (Step 38a, FR-02):
 *         NOTE_MAX           -> the longest "not received" note (200);
 *         readNote(value)    -> the note, trimmed, or a message if too long;
 *         readOrderId(value) -> a real Order ID, or null.
 *
 * LAYER: Application layer. Used by the Server Actions (supervisor-actions.ts)
 *        and by the screen for an instant hint. The database checks the
 *        same 200 limit again (migration 0020).
 *
 * WHY A SEPARATE FILE? A "use server" file may only export async functions,
 * so plain helpers and numbers that the screen also uses live here.
 */

/* Same number as the database CHECK (0020): change both together. */
export const NOTE_MAX = 200;

/*
 * readNote(value) -> { note } (may be "") or { error }.
 * The browser can send anything, so we check the type too.
 */
export function readNote(value: unknown): { note: string } | { error: string } {
  if (value === undefined || value === null) return { note: "" };
  if (typeof value !== "string") return { error: "That note isn't valid." };
  const note = value.trim();
  if (note.length > NOTE_MAX) return { error: `The note can be at most ${NOTE_MAX} characters.` };
  return { note };
}

/* readOrderId(1043) -> 1043; anything that isn't a positive whole number -> null. */
export function readOrderId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
