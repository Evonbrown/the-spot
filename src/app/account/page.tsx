/*
 * src/app/account/page.tsx   ->   http://localhost:3000/account
 *
 * WHAT: "My account" (Step 39a): change your full name, phone and OPTIONAL
 *       student ID (so you can log in with it, SRS Section 3).
 *
 * LAYER: Presentation. requireRole (Application layer) checks the login;
 *        saving goes through updateAccount (account-actions.ts).
 *
 * WHO: EVERY logged-in role (decision, Step 39a): it's the one shared
 *      screen, because everyone has a name, phone and maybe a student ID.
 *      Each person only ever sees and changes their OWN details (RLS).
 * (See src/app/staff/page.tsx for why the login check sits inside <Suspense>.)
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import AccountForm from "@/components/AccountForm";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_LABELS } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "My account",
};

export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-3xl font-extrabold">My account</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">Your details. Only you can see and change them.</p>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />}>
        <AccountScreen />
      </Suspense>
    </main>
  );
}

/* Guard (any role, but logged in), then the form with the saved values. */
async function AccountScreen() {
  const profile = await requireRole(
    ["customer", "counter_staff", "delivery_personnel", "manager", "supervisor"],
    { returnTo: "/account" }
  );

  return (
    <AccountForm
      email={profile.email}
      roleLabel={ROLE_LABELS[profile.role]}
      fullName={profile.full_name ?? ""}
      phone={profile.phone ?? ""}
      studentId={profile.student_id ?? ""}
    />
  );
}
