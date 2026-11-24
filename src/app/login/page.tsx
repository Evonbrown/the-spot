/*
 * src/app/login/page.tsx   ->   http://localhost:3000/login
 *
 * WHAT: The log-in page, for every role. It's just a frame around LoginForm.
 *       If you're already logged in, RedirectIfLoggedIn sends you onwards
 *       (your own screen, or back to ?next= such as /checkout for customers).
 * LAYER: Presentation.
 */

import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import RedirectIfLoggedIn from "@/components/RedirectIfLoggedIn";
import { isShortSecurityTimersOn } from "@/lib/test-settings";

/*
 * searchParams (the ?next=... part of the address) is handed to
 * RedirectIfLoggedIn, so an already logged-in customer from checkout goes
 * back to /checkout instead of Home.
 */
export default function LoginPage({
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
      <h1 className="text-3xl font-extrabold">Log in</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">
        Customers and staff log in here, with your email or student ID.
      </p>
      {/* Step 39b: only on a laptop with TEST_SHORT_SECURITY_TIMERS=true (never live). */}
      {isShortSecurityTimersOn() && (
        <p className="mb-4 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
          TEST MODE: short security timers (a login lock lasts 1 minute instead of 15). This only works with npm
          run dev on your own computer.
        </p>
      )}
      {/* The form reads ?next=... (e.g. /checkout) with useSearchParams, which
          Next.js requires to sit inside <Suspense>. The fallback is a plain
          grey box, NOT a second form, so there is never a copy without "next". */}
      <Suspense fallback={<FormPlaceholder />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

// Grey box shown for a moment while the form loads (nothing to click).
function FormPlaceholder() {
  return <div className="h-72 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />;
}

