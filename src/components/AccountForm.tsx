/*
 * src/components/AccountForm.tsx
 *
 * WHAT: The "My account" form (Step 39a): full name, phone and the OPTIONAL
 *       student ID (9 digits; with it you can log in by student ID instead
 *       of email). Email and role are shown but can't be changed here.
 *
 * LAYER: Presentation. Saving happens in updateAccount (account-actions.ts,
 *        Application layer), which checks everything again.
 *
 * "use client" = it runs in the browser: it shows messages and a
 * "Saving…" state (see SignUpForm.tsx for useActionState).
 */
"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { updateAccount, type AccountFormState } from "@/lib/auth/account-actions";

// text-base (16px) stops iPhones from zooming in when you tap the box.
const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

type Props = {
  email: string;
  roleLabel: string;
  fullName: string;
  phone: string;
  studentId: string;
};

export default function AccountForm({ email, roleLabel, fullName, phone, studentId }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(updateAccount, {});

  /* After a save, redraw the page so the header shows the new name. */
  useEffect(() => {
    if (state.savedAt) router.refresh();
  }, [state.savedAt, router]);

  // After an error or a save, show what was typed; otherwise what's saved.
  const values = state.fields ?? { fullName, phone, studentId };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-stone-100 p-3 text-sm">
        <dt className="text-stone-500">Email</dt>
        <dd className="break-all font-semibold">{email}</dd>
        <dt className="text-stone-500">Role</dt>
        <dd className="font-semibold">{roleLabel}</dd>
      </dl>

      {/* key = savedAt: after a save the boxes start from the saved values. */}
      <div key={state.savedAt ?? 0} className="flex flex-col gap-4">
        <label className="block text-sm font-semibold">
          Full name
          <input name="fullName" type="text" autoComplete="name" required defaultValue={values.fullName} className={inputClass} />
        </label>

        <label className="block text-sm font-semibold">
          Phone number
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="876-555-1234"
            required
            defaultValue={values.phone}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-semibold">
          Student ID <span className="font-normal text-stone-500">(optional)</span>
          <input
            name="studentId"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="620165372"
            maxLength={11}
            defaultValue={values.studentId}
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-stone-500">
            9 digits. Leave it empty if you don&apos;t have one. You can log in with it instead of your email.
          </span>
        </label>
      </div>

      <div aria-live="polite">
        {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
        {state.savedAt && !state.error && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Saved.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand text-lg font-bold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
