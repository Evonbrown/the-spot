/*
 * src/components/LoginForm.tsx
 *
 * WHAT: The log-in form (email + password). Used by EVERY role: customers,
 *       counter staff, drivers, managers and supervisors all log in here.
 * LAYER: Presentation. The real work happens on the server in
 *        src/lib/auth/actions.ts (logIn).
 *
 * "use client" because it shows error messages and a "please wait" state
 * (see SignUpForm.tsx for a longer explanation of useActionState).
 */
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logIn, type AuthFormState } from "@/lib/auth/actions";

// text-base (16px) stops iPhones from zooming in when you tap the box.
const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

const initialState: AuthFormState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(logIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Email only for now. The SRS also mentions "email or student ID" (still to decide). */}
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
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>

      <div aria-live="polite">
        {state.error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand text-lg font-bold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>

      <p className="text-center text-sm">
        New to The Spot?{" "}
        <Link href="/signup" className="font-semibold text-brand underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
