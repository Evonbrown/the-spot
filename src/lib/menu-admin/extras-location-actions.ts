/*
 * src/lib/menu-admin/extras-location-actions.ts
 *
 * WHAT: The Server Actions behind the Manager's "Extras" and "Delivery" tabs
 *       (Step 40b, SRS QA-3):
 *         saveExtra(form)       add an extra, or save changes (e.g. the real
 *                               name instead of "(Sample)", a new price);
 *         removeExtra(id)       delete it, or HIDE it if it was ever ordered;
 *         restoreExtra(id)      put a removed extra back;
 *         saveLocation(form)    add a delivery location, or save changes
 *                               (fee, "fee confirmed", active on/off).
 *       Delivery locations are never deleted (old orders point at them): the
 *       Manager switches them OFF instead.
 *
 * LAYER: Application layer. Each action checks "Manager only" and the values
 *        (extras-location-rules.ts), then saves with the Manager's OWN login:
 *        RLS (0004, 0005) lets only the Manager change these tables.
 *
 * CUSTOMERS SEE IT RIGHT AWAY: updateTag("menu") (extras are cached with the
 * menu) and updateTag("delivery-locations") throw the saved copies away.
 *
 * "use server" = runs on the server; the browser can only ask it to run.
 */
"use server";

import { updateTag } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { readExtraForm, readLocationForm } from "@/lib/menu-admin/extras-location-rules";
import { createClient } from "@/lib/supabase/server";

/*
 * What a row's form gets back:
 *   savedAt  a time stamp after a good save (+ message "Saved X.");
 *   error    a message, with fields = what was typed, so the boxes keep it
 *            (React empties a form after it's sent, see AccountForm).
 */
export type RowFormState = { error?: string; savedAt?: number; message?: string; fields?: Record<string, string> };

/* What the Remove / Restore buttons get back. */
export type RowActionResult = { ok: true; message: string } | { ok: false; error: string };

async function isManager(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "manager";
}

function readId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/* The form's text values. */
function formFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") fields[key] = value;
  return fields;
}

/* A database error -> a message the Manager can act on. */
function saveError(code: string | undefined, message: string, what: "extra" | "location"): string {
  console.error(`save ${what} failed:`, code, message);
  // 23505 = "unique violation" (delivery location names are unique, 0005).
  if (code === "23505") return what === "extra" ? "There's already an extra with that name." : "There's already a location with that name.";
  if (code === "23514") return "One of the values isn't allowed (check the name and the price).";
  return "We couldn't save that. Please try again.";
}

/* The next sort_order at the END of a table's list (new rows go last). */
async function endOfList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "customizations" | "delivery_locations"
): Promise<number> {
  const { data } = await supabase.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  return data && data.length > 0 ? Number(data[0].sort_order) + 10 : 10;
}

/*
 * saveRow(...): the shared "add or edit" steps for both tables.
 *   - new (no id): insert at the end of the list;
 *   - edit: only if updated_at is still the one the form saw (otherwise
 *     "someone else changed it"; nothing is overwritten).
 */
async function saveRow(
  table: "customizations" | "delivery_locations",
  fields: Record<string, string>,
  values: Record<string, unknown>,
  what: "extra" | "location"
): Promise<RowFormState> {
  const supabase = await createClient();
  const id = fields.id ? readId(fields.id) : null;
  if (fields.id && id === null) return { error: "Please refresh the page and try again." };

  if (id === null) {
    const { error } = await supabase.from(table).insert({ ...values, sort_order: await endOfList(supabase, table) });
    if (error) return { error: saveError(error.code, error.message, what) };
    return { savedAt: Date.now(), message: `Added ${String(values.name)}.` };
  }

  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq("id", id)
    .eq("updated_at", fields.expectedUpdatedAt ?? "")
    .select("id");
  if (error) return { error: saveError(error.code, error.message, what) };
  if (!data || data.length === 0) {
    return { error: "Someone else changed this since you opened the page. Refresh to see their version." };
  }
  return { savedAt: Date.now(), message: `Saved ${String(values.name)}.` };
}

// ---- Extras ------------------------------------------------------------------------

export async function saveExtra(prevState: RowFormState, formData: FormData): Promise<RowFormState> {
  const fields = formFields(formData);
  if (!(await isManager())) return { error: "Only the Manager can change the menu.", fields };
  const read = readExtraForm(fields);
  if ("error" in read) return { error: read.error, fields };

  const result = await saveRow(
    "customizations",
    fields,
    { name: read.input.name, kind: read.input.kind, extra_price: read.input.extraPrice, is_available: read.input.isAvailable },
    "extra"
  );
  if (result.savedAt) updateTag("menu"); // extras are cached together with the menu
  return result.error ? { ...result, fields } : result;
}

export async function removeExtra(rawId: unknown): Promise<RowActionResult> {
  if (!(await isManager())) return { ok: false, error: "Only the Manager can change the menu." };
  const id = readId(rawId);
  if (id === null) return { ok: false, error: "Please refresh the page and try again." };

  const supabase = await createClient();
  const { data: deleted, error } = await supabase.from("customizations").delete().eq("id", id).select("name");
  if (!error && deleted && deleted.length > 0) {
    updateTag("menu");
    return { ok: true, message: `${deleted[0].name} was deleted (it was never ordered).` };
  }
  // 23503: old orders point at this extra -> hide it instead (is_archived, 0027).
  if (error?.code === "23503") {
    const { data: hidden, error: hideError } = await supabase
      .from("customizations")
      .update({ is_archived: true })
      .eq("id", id)
      .select("name");
    if (!hideError && hidden && hidden.length > 0) {
      updateTag("menu");
      return { ok: true, message: `${hidden[0].name} was removed. It was ordered before, so it's kept (hidden) for old orders.` };
    }
    if (hideError) console.error("removeExtra (hide) failed:", hideError.message);
  } else if (error) {
    console.error("removeExtra failed:", error.code, error.message);
  }
  return { ok: false, error: "We couldn't remove that extra. Please try again." };
}

export async function restoreExtra(rawId: unknown): Promise<RowActionResult> {
  if (!(await isManager())) return { ok: false, error: "Only the Manager can change the menu." };
  const id = readId(rawId);
  if (id === null) return { ok: false, error: "Please refresh the page and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("customizations").update({ is_archived: false }).eq("id", id).select("name");
  if (error || !data || data.length === 0) {
    if (error) console.error("restoreExtra failed:", error.message);
    return { ok: false, error: "We couldn't restore that extra. Please try again." };
  }
  updateTag("menu");
  return { ok: true, message: `${data[0].name} is back.` };
}

// ---- Delivery locations (no delete: switch off instead) ---------------------------

export async function saveLocation(prevState: RowFormState, formData: FormData): Promise<RowFormState> {
  const fields = formFields(formData);
  if (!(await isManager())) return { error: "Only the Manager can change delivery locations.", fields };
  const read = readLocationForm(fields);
  if ("error" in read) return { error: read.error, fields };

  const result = await saveRow(
    "delivery_locations",
    fields,
    {
      name: read.input.name,
      delivery_fee: read.input.deliveryFee,
      fee_confirmed: read.input.feeConfirmed,
      is_active: read.input.isActive,
    },
    "location"
  );
  if (result.savedAt) updateTag("delivery-locations"); // checkout's cached list
  return result.error ? { ...result, fields } : result;
}
