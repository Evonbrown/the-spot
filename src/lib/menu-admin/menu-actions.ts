/*
 * src/lib/menu-admin/menu-actions.ts
 *
 * WHAT: The Server Actions behind the Manager's "Menu" screen (Step 40a,
 *       SRS QA-3: the Manager changes the menu without a developer):
 *         saveMenuItem(form)            add a new item, or save changes;
 *         setMenuItemAvailable(id, on)  the quick "Available" switch;
 *         removeMenuItem(id)            delete it, or HIDE it if it was ever
 *                                       ordered (old orders must still work);
 *         restoreMenuItem(id)           put a removed item back on the menu.
 *
 * LAYER: Application layer. The screen (Presentation) only calls these. Each
 *        one checks "Manager only", checks the values (menu-rules.ts), then
 *        saves with the Manager's OWN login: RLS (migration 0002) lets only
 *        the Manager change menu_items, and the CHECK rules (0003, 0026)
 *        check the values again.
 *
 * CUSTOMERS SEE IT RIGHT AWAY: the customer menu is cached (menu.ts,
 * cacheTag("menu")). updateTag("menu") throws that saved copy away, so the
 * next visit to /menu (and the next Add / checkout) uses the new version.
 *
 * "use server" = runs on the server; the browser can only ask it to run.
 */
"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { readMenuItemForm, toDbRow } from "@/lib/menu-admin/menu-rules";
import { createClient } from "@/lib/supabase/server";

/* What the form gets back after a failed save (a message + what was typed). */
export type MenuFormState = { error?: string; fields?: Record<string, string> };

/* What the list buttons get back. */
export type MenuActionResult = { ok: true; message: string } | { ok: false; error: string };

/* Only the Manager (QA-3; the database checks again with RLS). */
async function isManager(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "manager";
}

/* A real item id from the browser, or null. */
function readId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/*
 * endOfCategory(category, exceptId) -> a sort_order that puts an item LAST in
 * its category (decision: new items go at the end; no re-ordering for now).
 *   - the category exists: its biggest sort_order + 10;
 *   - a NEW category: after everything else, starting a new block of 100
 *     (like the existing blocks 100s, 200s, ... from Part 10).
 */
async function endOfCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  category: string,
  exceptId: number | null
): Promise<number> {
  let query = supabase
    .from("menu_items")
    .select("sort_order")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (exceptId !== null) query = query.neq("id", exceptId);
  const { data } = await query;
  if (data && data.length > 0) return Number(data[0].sort_order) + 10;

  const { data: last } = await supabase
    .from("menu_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const biggest = last && last.length > 0 ? Number(last[0].sort_order) : 0;
  return (Math.floor(biggest / 100) + 1) * 100;
}

/* A database error -> a message the Manager can act on. */
function saveErrorMessage(code: string | undefined, message: string): string {
  console.error("menu save failed:", code, message);
  if (code === "23514") return "One of the values isn't allowed (check the name, prices and texts).";
  if (code === "42501") return "Only the Manager can change the menu.";
  return "We couldn't save that. Please try again.";
}

// ---- 1. Add or edit an item ------------------------------------------------------
export async function saveMenuItem(prevState: MenuFormState, formData: FormData): Promise<MenuFormState> {
  // Every text field of the form, so it can be shown again after an error.
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") fields[key] = value;

  if (!(await isManager())) return { error: "Only the Manager can change the menu.", fields };

  const read = readMenuItemForm(fields);
  if ("error" in read) return { error: read.error, fields };
  const row = toDbRow(read.input);

  const supabase = await createClient();
  const id = fields.id ? readId(fields.id) : null;
  if (fields.id && id === null) return { error: "That item isn't valid. Go back to the menu list.", fields };

  if (id === null) {
    // ---- NEW item: last in its category.
    const sortOrder = await endOfCategory(supabase, row.category, null);
    const { error } = await supabase.from("menu_items").insert({ ...row, sort_order: sortOrder });
    if (error) return { error: saveErrorMessage(error.code, error.message), fields };
  } else {
    // ---- EDIT: save only if nobody else saved it since this form was opened
    // (updated_at must still be the one the form saw), the same "someone else
    // changed it" idea as the order status buttons (Step 26).
    const { data: current, error: readError } = await supabase
      .from("menu_items")
      .select("category, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (readError) return { error: saveErrorMessage(readError.code, readError.message), fields };
    if (!current) return { error: "This item doesn't exist any more. Go back to the menu list.", fields };
    if (current.updated_at !== fields.expectedUpdatedAt) {
      return {
        error: "Someone else changed this item since you opened it. Reload the page to see their version.",
        fields,
      };
    }
    // A new category -> move it to the end of that category.
    const extra = current.category !== row.category ? { sort_order: await endOfCategory(supabase, row.category, id) } : {};
    const { data: saved, error } = await supabase
      .from("menu_items")
      .update({ ...row, ...extra })
      .eq("id", id)
      .eq("updated_at", current.updated_at)
      .select("id");
    if (error) return { error: saveErrorMessage(error.code, error.message), fields };
    if (!saved || saved.length === 0) {
      return { error: "Someone else changed this item a moment ago. Reload the page to see their version.", fields };
    }
  }

  updateTag("menu"); // customers see the change on their next visit
  redirect(`/manager/menu?saved=${encodeURIComponent(row.name)}`);
}

// ---- 2. The quick "Available" switch (e.g. Oxtail on Thursdays) -----------------
export async function setMenuItemAvailable(rawId: unknown, available: unknown): Promise<MenuActionResult> {
  if (!(await isManager())) return { ok: false, error: "Only the Manager can change the menu." };
  const id = readId(rawId);
  if (id === null || typeof available !== "boolean") return { ok: false, error: "Please refresh the page and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .update({ is_available: available })
    .eq("id", id)
    .select("name");
  if (error || !data || data.length === 0) {
    if (error) console.error("setMenuItemAvailable failed:", error.message);
    return { ok: false, error: "We couldn't change that. Please try again." };
  }
  updateTag("menu");
  return { ok: true, message: `${data[0].name} is now ${available ? "available" : "unavailable"}.` };
}

// ---- 3. Remove: delete, or hide if it was ever ordered ---------------------------
export async function removeMenuItem(rawId: unknown): Promise<MenuActionResult> {
  if (!(await isManager())) return { ok: false, error: "Only the Manager can change the menu." };
  const id = readId(rawId);
  if (id === null) return { ok: false, error: "Please refresh the page and try again." };

  const supabase = await createClient();
  const { data: deleted, error } = await supabase.from("menu_items").delete().eq("id", id).select("name");

  if (!error && deleted && deleted.length > 0) {
    updateTag("menu");
    return { ok: true, message: `${deleted[0].name} was deleted (it was never ordered).` };
  }

  // 23503 = "foreign key violation": old orders point at this item, so the
  // database refused to delete it. Hide it instead (is_archived, 0026).
  if (error?.code === "23503") {
    const { data: hidden, error: hideError } = await supabase
      .from("menu_items")
      .update({ is_archived: true })
      .eq("id", id)
      .select("name");
    if (!hideError && hidden && hidden.length > 0) {
      updateTag("menu");
      return {
        ok: true,
        message: `${hidden[0].name} was removed from the menu. It was ordered before, so it's kept (hidden) for old orders and reports.`,
      };
    }
    if (hideError) console.error("removeMenuItem (hide) failed:", hideError.message);
  } else if (error) {
    console.error("removeMenuItem failed:", error.code, error.message);
  }
  return { ok: false, error: "We couldn't remove that item. Please try again." };
}

// ---- 4. Restore a removed item -----------------------------------------------------
export async function restoreMenuItem(rawId: unknown): Promise<MenuActionResult> {
  if (!(await isManager())) return { ok: false, error: "Only the Manager can change the menu." };
  const id = readId(rawId);
  if (id === null) return { ok: false, error: "Please refresh the page and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .update({ is_archived: false })
    .eq("id", id)
    .select("name");
  if (error || !data || data.length === 0) {
    if (error) console.error("restoreMenuItem failed:", error.message);
    return { ok: false, error: "We couldn't restore that item. Please try again." };
  }
  updateTag("menu");
  return { ok: true, message: `${data[0].name} is back on the menu.` };
}
