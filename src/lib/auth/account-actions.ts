/*
 * src/lib/auth/account-actions.ts
 *
 * WHAT: updateAccount(): saves the changes from the "My account" page
 *       (Step 39a): full name, phone and the OPTIONAL student ID.
 *
 * LAYER: Application layer. The form (Presentation) only calls this. It
 *        checks the input, then saves with the person's OWN login (NOT the
 *        secret key): the database only lets a user change THEIR OWN row,
 *        and only these three columns (grants in 0001 + 0022). The role can
 *        never be changed here.
 *
 * "use server" = runs on the server; the browser can only ask it to run.
 */
"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { isValidPhone, readStudentIdInput } from "@/lib/auth/identifier";
import { createClient } from "@/lib/supabase/server";

/*
 * What the form gets back:
 *   error   -> a red message;
 *   savedAt -> a time stamp when saved (the form shows "Saved" and refreshes
 *              the page so the header shows the new name);
 *   fields  -> what was typed, so the form keeps it after an error.
 */
export type AccountFormState = {
  error?: string;
  savedAt?: number;
  fields?: { fullName: string; phone: string; studentId: string };
};

/* One text field from the form, trimmed ("" if missing). */
function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateAccount(prevState: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Please log in again." };

  const fullName = readText(formData, "fullName");
  const phone = readText(formData, "phone");
  const studentIdText = readText(formData, "studentId");
  const fields = { fullName, phone, studentId: studentIdText };

  // The same rules as sign-up (actions.ts).
  if (fullName.length < 2) return { error: "Please enter your full name.", fields };
  if (!isValidPhone(phone)) return { error: "Please enter a valid phone number, e.g. 876-555-1234.", fields };
  const studentId = readStudentIdInput(studentIdText);
  if ("error" in studentId) return { error: studentId.error, fields };

  // Save with the person's own login: RLS = own row only (0001).
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, student_id: studentId.studentId })
    .eq("id", profile.id);

  if (error) {
    // 23505 = "unique_violation": another account already has this student ID.
    if (error.code === "23505") {
      return { error: "That student ID is already used by another account.", fields };
    }
    console.error("updateAccount failed:", error.message);
    return { error: "We couldn't save your changes. Please try again.", fields };
  }

  return { savedAt: Date.now(), fields: { fullName, phone, studentId: studentId.studentId ?? "" } };
}
