/*
 * src/app/signup/page.tsx   ->   http://localhost:3000/signup
 *
 * WHAT: The sign-up page. It's just a frame around SignUpForm.
 * LAYER: Presentation.
 *
 * Note: signing up ALWAYS creates a customer. Staff accounts get their role
 * changed afterwards by an admin (for now, in the Supabase Table Editor).
 */

import SignUpForm from "@/components/SignUpForm";

export default function SignUpPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-3xl font-extrabold">Create an account</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">Order ahead and track your food live.</p>
      <SignUpForm />
    </main>
  );
}
