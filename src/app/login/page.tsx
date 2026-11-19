/*
 * src/app/login/page.tsx   ->   http://localhost:3000/login
 *
 * WHAT: The log-in page, for every role. It's just a frame around LoginForm.
 *       If you're already logged in, RedirectIfLoggedIn sends you to your own screen.
 * LAYER: Presentation.
 */

import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import RedirectIfLoggedIn from "@/components/RedirectIfLoggedIn";

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10">
      {/* Reads the login cookie, so it must sit inside <Suspense> */}
      <Suspense fallback={null}>
        <RedirectIfLoggedIn />
      </Suspense>
      <h1 className="text-3xl font-extrabold">Log in</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">Customers and staff log in here.</p>
      <LoginForm />
    </main>
  );
}
