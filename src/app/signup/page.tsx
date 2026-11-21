/*
 * src/app/signup/page.tsx   ->   http://localhost:3000/signup
 *
 * WHAT: The sign-up page. It's just a frame around SignUpForm.
 *       If you're already logged in, RedirectIfLoggedIn sends you onwards
 *       (your own screen, or back to ?next= such as /checkout for customers).
 * LAYER: Presentation.
 *
 * Note: signing up ALWAYS creates a customer. Staff accounts get their role
 * changed afterwards by an admin (for now, in the Supabase Table Editor).
 */

import { Suspense } from "react";
import RedirectIfLoggedIn from "@/components/RedirectIfLoggedIn";
import SignUpForm from "@/components/SignUpForm";

/*
 * searchParams (the ?next=... part of the address) is handed to
 * RedirectIfLoggedIn, so an already logged-in customer from checkout goes
 * back to /checkout instead of Home.
 */
export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10">
      {/* Reads the login cookie, so it must sit inside <Suspense> */}
      <Suspense fallback={null}>
        <RedirectIfLoggedIn searchParams={searchParams} />
      </Suspense>
      <h1 className="text-3xl font-extrabold">Create an account</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">Order ahead and track your food live.</p>
      {/* The form reads ?next=... (e.g. /checkout) with useSearchParams, which
          Next.js requires to sit inside <Suspense>. The fallback is a plain
          grey box, NOT a second form, so there is never a copy without "next". */}
      <Suspense fallback={<FormPlaceholder />}>
        <SignUpForm />
      </Suspense>
    </main>
  );
}

// Grey box shown for a moment while the form loads (nothing to click).
function FormPlaceholder() {
  return <div className="h-96 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />;
}

