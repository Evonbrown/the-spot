/*
 * src/components/SiteHeader.tsx
 *
 * WHAT: The top bar shown on every page: "The Spot" name (links to Home), the
 *       Menu link, and the account area (Log in, OR your name/role + Log out).
 * LAYER: Presentation. It gets the logged-in user from the Application layer
 *        (getCurrentProfile in src/lib/auth/get-profile.ts).
 *
 * WHY a component? We write the header once and put it in layout.tsx, so every
 * page gets the same header.
 */

import Link from "next/link";
import { Suspense } from "react";
import { logOut } from "@/lib/auth/actions";
import { getCurrentProfile } from "@/lib/auth/get-profile";

/*
 * SiteHeader
 * The bar itself is the same for everyone, so Next.js can send it instantly.
 * Only the account area depends on WHO is visiting (it reads the login cookie),
 * so it sits inside <Suspense>. Our project has "cacheComponents" on, and with
 * that setting, Next.js requires per-visitor parts like this to go inside <Suspense>.
 * The fallback (shown for a split second while it loads) is just an empty space.
 *
 * "sticky top-0" keeps the bar visible while the user scrolls.
 * There's no separate "Home" link: tapping "The Spot" goes home, which saves
 * space on small phones.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 bg-brand text-white shadow">
      <nav className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          The Spot
        </Link>
        <div className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/menu" className="rounded-md px-3 py-2 hover:bg-brand-dark">
            Menu
          </Link>
          <Suspense fallback={null}>
            <AccountArea />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}

// How each role name is shown to people (the database uses underscores).
const ROLE_LABELS = {
  customer: "Customer",
  counter_staff: "Counter staff",
  delivery_personnel: "Delivery",
  manager: "Manager",
  supervisor: "Supervisor",
} as const;

/*
 * AccountArea (runs on the server)
 * Logged out -> a "Log in" button (the log-in page links to sign-up).
 * Logged in  -> the user's name with their role underneath, and a "Log out" button.
 * The Log out button is a tiny form that calls the logOut Server Action.
 */
async function AccountArea() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <Link
        href="/login"
        className="rounded-md bg-white px-3 py-2 text-brand hover:bg-orange-50"
      >
        Log in
      </Link>
    );
  }

  return (
    <>
      {/* "truncate" + max width: long names get "…" instead of breaking the header on phones */}
      <div className="max-w-[8rem] px-2 text-right leading-tight">
        <p className="truncate">{profile.full_name || profile.email}</p>
        <p className="truncate text-xs font-normal opacity-90">{ROLE_LABELS[profile.role]}</p>
      </div>
      <form action={logOut}>
        <button type="submit" className="rounded-md px-3 py-2 hover:bg-brand-dark">
          Log out
        </button>
      </form>
    </>
  );
}
