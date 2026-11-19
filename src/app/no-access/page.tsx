/*
 * src/app/no-access/page.tsx   ->   http://localhost:3000/no-access
 *
 * WHAT: Shown when a logged-in user opens a screen their role isn't allowed to
 *       see (e.g. a customer typing /manager). requireRole() sends them here.
 *       It explains this clearly and offers a button back to their OWN screen.
 * LAYER: Presentation.
 */

import Link from "next/link";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/auth/roles";

export default function NoAccessPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12 text-center">
      <p className="text-5xl" aria-hidden="true">🔒</p>
      <h1 className="mt-4 text-2xl font-extrabold">You don&apos;t have access to this page</h1>
      {/* The button depends on WHO you are, so it waits for the login check */}
      <Suspense fallback={null}>
        <BackButton />
      </Suspense>
    </main>
  );
}

/*
 * BackButton
 * Logged in  -> "Go to my screen" (e.g. a customer goes to "/", a manager to "/manager").
 * Logged out -> "Log in" (someone might land here after logging out).
 */
async function BackButton() {
  const profile = await getCurrentProfile();
  const buttonClass =
    "mt-6 inline-flex min-h-12 items-center rounded-xl bg-brand px-6 font-bold text-white hover:bg-brand-dark";

  if (!profile) {
    return (
      <Link href="/login" className={buttonClass}>
        Log in
      </Link>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm text-stone-600">
        You&apos;re logged in as <strong>{ROLE_LABELS[profile.role]}</strong>, and this page is for a
        different role.
      </p>
      <Link href={ROLE_HOME[profile.role]} className={buttonClass}>
        Go to my screen
      </Link>
    </>
  );
}
