/*
 * src/lib/auth/actions.ts
 *
 * WHAT: The Server Actions for signing up, logging in and logging out.
 * LAYER: Application layer. This code ONLY runs on the server.
 *
 * WHAT IS A SERVER ACTION? A function that a <form> can call, but which runs
 * on the server, not in the browser. The browser sends the form data, the
 * server checks it and talks to Supabase, then sends back a result.
 * "use server" at the top marks every function in this file as a Server Action.
 *
 * WHY CHECK INPUT HERE AND NOT JUST IN THE BROWSER? Anyone can skip the
 * browser's checks (e.g. by sending a hand-made request). CLAUDE.md: "All
 * business rules live here, never only in the browser."
 */
"use server";

import { redirect } from "next/navigation";
import { isValidEmail, isValidPhone, parseLoginIdentifier, readStudentIdInput } from "@/lib/auth/identifier";
import type { UserRole } from "@/lib/auth/roles";
import { pathAfterLogin } from "@/lib/auth/safe-next";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * Step 39a: the ONE message for every failed login (unknown email, unknown
 * student ID or wrong password), so nobody can find out which emails or
 * student IDs have accounts.
 */
const LOGIN_FAILED = "Email/student ID or password is incorrect.";

/*
 * findAccount(identifier) -> { userId, email } or null.
 * Asks the database function login_identify (migration 0022), which only our
 * server may call (secret key): it reads Supabase's private list of emails.
 */
async function findAccount(identifier: string): Promise<{ userId: string; email: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("login_identify", { p_identifier: identifier });
  if (error) {
    console.error("login_identify failed:", error.message);
    return null;
  }
  const row = (data as { user_id: string; email: string }[] | null)?.[0];
  return row ? { userId: row.user_id, email: row.email } : null;
}

/*
 * AuthFormState: what an action sends back to the form.
 *   error   -> a red message to show (e.g. "Email or password is incorrect.")
 *   message -> a normal message to show (e.g. "Check your email...")
 *   fields  -> what the user typed, so the form can refill itself after an error.
 *              We NEVER send the password back.
 */
export type AuthFormState = {
  error?: string;
  message?: string;
  fields?: { fullName?: string; phone?: string; email?: string; studentId?: string; identifier?: string };
};

// Security requirement: minimum password length. Also set to 8 in the Supabase dashboard.
const MIN_PASSWORD_LENGTH = 8;

/*
 * Small helper: read one text field from the form and trim spaces off the ends.
 * formData.get() can return null (field missing) or a File, so we check it's text.
 */
function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/*
 * signUp — creates a new CUSTOMER account.
 * "prevState" is the last result. React's useActionState hook passes it in
 * (we don't need it, but the hook requires the parameter to be there).
 */
export async function signUp(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const fullName = readText(formData, "fullName");
  const phone = readText(formData, "phone");
  const email = readText(formData, "email").toLowerCase();
  const studentIdText = readText(formData, "studentId");
  const password = formData.get("password");
  const fields = { fullName, phone, email, studentId: studentIdText };

  // ---- 1. Check the input (server-side validation) ----
  if (fullName.length < 2) {
    return { error: "Please enter your full name.", fields };
  }
  if (!isValidPhone(phone)) {
    return { error: "Please enter a valid phone number, e.g. 876-555-1234.", fields };
  }
  if (!isValidEmail(email)) {
    return { error: "Please enter a valid email address.", fields };
  }
  // Step 39a: the student ID is OPTIONAL (staff and visitors may not have one).
  const studentId = readStudentIdInput(studentIdText);
  if ("error" in studentId) return { error: studentId.error, fields };
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, fields };
  }
  // Two accounts can't share a student ID (the database refuses it too). This
  // tells the person the ID is taken: there's no way to keep an ID unique
  // without saying so (decision, Step 39a). Logging in never reveals it.
  if (studentId.studentId && (await findAccount(studentId.studentId))) {
    return { error: "That student ID is already used by another account.", fields };
  }

  // ---- 2. Ask Supabase Auth to create the account ----
  // Supabase stores the password HASHED (scrambled one-way). We never store it.
  // "data" is extra info. Our database trigger (Part 2) copies full_name and
  // phone into the profiles table and ALWAYS sets role = 'customer'.
  // (We deliberately do not send any role from here.)
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone, student_id: studentId.studentId } },
  });

  if (error) {
    console.error("signUp failed:", error.code, error.message);
    if (error.code === "user_already_exists") {
      return { error: "An account with this email already exists. Try logging in.", fields };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too weak. Try a longer one.", fields };
    }
    // Two people signing up with the same student ID at the same moment: the
    // check above passed for both, but the database's UNIQUE rule stops the
    // second one, and Supabase reports a general database error.
    if (studentId.studentId && /database error/i.test(error.message)) {
      return { error: "That student ID is already used by another account.", fields };
    }
    return { error: "Sign up failed. Please try again.", fields };
  }

  // ---- 3. Logged in straight away? ----
  // With "Confirm email" OFF (during development), Supabase logs the user in at once.
  // With it ON (after deploying), there is no session until they click the email link.
  if (!data.session) {
    return { message: "Account created! Check your email to confirm it, then log in." };
  }

  // redirect() sends the browser on. (It works by "throwing", so no code after
  // it runs.) If they came from checkout (?next=/checkout), go back there.
  // New accounts are always customers. Same shared rule as logIn below.
  redirect(pathAfterLogin("customer", formData.get("next")));
}

/*
 * logIn — logs in ANY role (customer, staff, manager, ...) with EMAIL OR
 * STUDENT ID + password (Step 39a, SRS Section 3).
 *   - an email: logged in with it directly;
 *   - a 9-digit student ID: we look up the email that belongs to it
 *     (findAccount), then log in with that email. Supabase Auth only knows
 *     emails, and still checks the password itself (hashed).
 * Every failure gives the SAME message (LOGIN_FAILED), whether the ID or
 * email doesn't exist or the password is wrong.
 */
export async function logIn(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const identifierText = readText(formData, "identifier");
  const password = formData.get("password");
  const fields = { identifier: identifierText };

  const identifier = parseLoginIdentifier(identifierText);
  if ("error" in identifier) return { error: identifier.error, fields };
  if (typeof password !== "string" || password.length === 0) {
    return { error: "Please enter your password.", fields };
  }

  // Which email do we log in with?
  let email: string | null = identifier.value;
  if (identifier.kind === "studentId") {
    const account = await findAccount(identifier.value);
    email = account?.email ?? null; // unknown ID -> no email -> same failure message
  }
  if (!email) return { error: LOGIN_FAILED, fields };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // SECURITY: always the SAME message, whether the email / student ID
    // doesn't exist or the password is wrong. Otherwise an attacker could
    // find out which emails and student IDs have accounts.
    return { error: LOGIN_FAILED, fields };
  }

  // Send each role to its own screen (e.g. counter_staff -> /staff).
  // We read the role from the database (RLS lets a user read their own profile),
  // never from anything the browser sent.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("logIn: could not read user role:", profileError.message);
  }

  const role = profile?.role as UserRole | undefined;

  // A CUSTOMER who was sent here from checkout (?next=/checkout) goes back
  // there; staff always go to their own screen (strict role screens).
  // pathAfterLogin is the SAME rule RedirectIfLoggedIn uses, so the two can
  // never disagree (that disagreement sent customers to Home). It also only
  // allows addresses inside our own site (no "open redirect").
  redirect(role ? pathAfterLogin(role, formData.get("next")) : "/");
}

/*
 * logOut — ends the session (deletes the login cookies) and goes to the Home page.
 * Used by the "Log out" button in the header. No form state is needed here.
 */
export async function logOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("logOut: signOut failed:", error.message);
  }
  redirect("/");
}
