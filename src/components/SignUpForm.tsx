/*
 * src/components/SignUpForm.tsx
 *
 * WHAT: The sign-up form: full name, phone, student ID (optional, Step 39a),
 *       email, password.
 * LAYER: Presentation. It only collects input and shows results. The real
 *        checks happen on the server in src/lib/auth/actions.ts (signUp).
 *
 * WHY "use client"? Most of our components run on the server. This one must run
 * in the browser because it reacts to the user: it shows error messages and
 * disables the button while waiting. Components that do that are "Client Components".
 */
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useNextParam } from "@/lib/browser-hooks";
import { signUp, type AuthFormState } from "@/lib/auth/actions";

// Shared look for every text box. text-base (16px) stops iPhones from zooming in on tap.
const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

const initialState: AuthFormState = {};

/*
 * SignUpForm
 * useActionState(signUp, initialState) gives us three things:
 *   state      -> the latest result from the server (error/message/fields)
 *   formAction -> what we pass to <form action=...>; it calls signUp on the server
 *   pending    -> true while we wait for the server (we disable the button then,
 *                 so the user can't create the account twice by double-tapping)
 */
export default function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  // Where to go after signing up (e.g. back to checkout), from the address bar.
  const next = useNextParam();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Hidden field: where to go after signing up (e.g. back to checkout).
          The server checks it again with safeNextPath. */}
      {next && <input type="hidden" name="next" value={next} />}

      {/* The browser checks below ("required", type="email", minLength) are only
          for convenience. The server checks everything again. */}
      <label className="block text-sm font-semibold">
        Full name
        <input
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={state.fields?.fullName}
          className={inputClass}
        />
      </label>

      <label className="block text-sm font-semibold">
        Phone number
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="876-555-1234"
          required
          defaultValue={state.fields?.phone}
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-stone-500">
          Used for order alerts and by our delivery driver.
        </span>
      </label>

      {/* Step 39a: OPTIONAL. With a student ID you can also log in with it
          instead of your email. inputMode="numeric" = phones show a number pad. */}
      <label className="block text-sm font-semibold">
        Student ID <span className="font-normal text-stone-500">(optional)</span>
        <input
          name="studentId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="620165372"
          maxLength={11}
          defaultValue={state.fields?.studentId}
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-stone-500">
          9 digits. You can then log in with your student ID or your email.
        </span>
      </label>

      <label className="block text-sm font-semibold">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.fields?.email}
          className={inputClass}
        />
      </label>

      <label className="block text-sm font-semibold">
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-stone-500">At least 8 characters.</span>
      </label>

      {/* aria-live="polite": screen readers read the message out when it appears */}
      <div aria-live="polite">
        {state.error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
        )}
        {state.message && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand text-lg font-bold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm">
        Already have an account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-semibold text-brand underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
