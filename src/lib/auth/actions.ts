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
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import { pathAfterLogin } from "@/lib/auth/safe-next";

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
  fields?: { fullName?: string; phone?: string; email?: string };
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
 * isValidPhone("876-555-1234") -> true
 * Allows digits, spaces, dashes and one leading "+". Must contain 7 to 15 digits
 * (15 is the international maximum). FR-04/FR-05 need a real number for the
 * driver and for SMS alerts, so phone is REQUIRED.
 */
function isValidPhone(phone: string): boolean {
  if (!/^\+?[0-9\s-]+$/.test(phone)) return false;
  const digitCount = phone.replace(/\D/g, "").length; // \D = "not a digit"
  return digitCount >= 7 && digitCount <= 15;
}

// A simple email shape check: something@something.something
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  const password = formData.get("password");
  const fields = { fullName, phone, email };

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
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, fields };
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
    options: { data: { full_name: fullName, phone } },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "An account with this email already exists. Try logging in.", fields };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too weak. Try a longer one.", fields };
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
 * logIn — logs in ANY role (customer, staff, manager, ...) with email + password.
 * For now: email only. (SRS also mentions "email or student ID"; still to decide.)
 */
export async function logIn(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = readText(formData, "email").toLowerCase();
  const password = formData.get("password");
  const fields = { email };

  if (!isValidEmail(email) || typeof password !== "string" || password.length === 0) {
    return { error: "Please enter your email and password.", fields };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // SECURITY: always the SAME message, whether the email doesn't exist or the
    // password is wrong. Otherwise an attacker could find out which emails have accounts.
    return { error: "Email or password is incorrect.", fields };
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
