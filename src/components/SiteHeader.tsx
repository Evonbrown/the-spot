/*
 * src/components/SiteHeader.tsx
 *
 * WHAT: The top bar shown on every page: "The Spot" name (links to Home), a
 *       main link (Menu, or your own staff screen), "Orders" (customers only),
 *       the Cart link (visitors and customers only), and the account area
 *       (Log in, OR your name/role + Log out).
 * LAYER: Presentation. It gets the logged-in user from the Application layer
 *        (getCurrentProfile in src/lib/auth/get-profile.ts).
 *
 * WHY a component? We write the header once and put it in layout.tsx, so every
 * page gets the same header.
 */

import Link from "next/link";
import { Suspense } from "react";
import CartLink from "@/components/CartLink";
import LogOutButton from "@/components/LogOutButton";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { ROLE_HOME, ROLE_LABELS, ROLE_SCREEN_LINK } from "@/lib/auth/roles";

// px-2 (not px-3) keeps everything on one line on small phones.
const linkClass = "rounded-md px-2 py-2 hover:bg-brand-dark";

/*
 * SiteHeader
 * The bar itself is the same for everyone, so Next.js can send it instantly.
 * The right-hand side depends on WHO is visiting (it reads the login cookie),
 * so it sits inside <Suspense>. Our project has "cacheComponents" on, and with
 * that setting, Next.js requires per-visitor parts like this to go inside <Suspense>.
 * While it loads (a split second), the fallback shows just the Menu link.
 *
 * "sticky top-0" keeps the bar visible while the user scrolls.
 * Tapping "The Spot" goes home.
 * "print:hidden" (Step 37): the header never appears on printed reports.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 bg-brand text-white shadow print:hidden">
      <nav className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          The Spot
        </Link>
        <div className="flex items-center gap-1 text-sm font-semibold">
          <Suspense fallback={<MenuLink />}>
            <AccountArea />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}

function MenuLink() {
  return (
    <Link href="/menu" className={linkClass}>
      Menu
    </Link>
  );
}

/*
 * AccountArea (runs on the server)
 * Logged out -> "Menu", "Cart" and a "Log in" button (the log-in page links to sign-up).
 * Customer   -> "Menu", "Orders" (My orders, Step 29), "Cart", their name +
 *               role, and "Log out".
 * Staff role -> a link to THEIR OWN screen (e.g. "Queue") instead of "Menu",
 *               their name + role, and "Log out". NO cart (decision: staff
 *               don't order through the app).
 * "Log out" also empties the cart (decision: shared campus computers).
 *
 * This link is only a shortcut. It is NOT the security: even if someone typed
 * another screen's address, requireRole() on that page would block them.
 */
async function AccountArea() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <>
        <MenuLink />
        <CartLink className={linkClass} />
        <Link
          href="/login"
          className="rounded-md bg-white px-3 py-2 text-brand hover:bg-orange-50"
        >
          Log in
        </Link>
      </>
    );
  }

  const screenLink = ROLE_SCREEN_LINK[profile.role];

  return (
    <>
      {screenLink ? (
        <Link href={ROLE_HOME[profile.role]} className={linkClass}>
          {screenLink}
        </Link>
      ) : (
        // Customers: Menu + Orders + Cart. (Staff got their screen link above,
        // and no cart or orders.) Step 29: "Orders" opens "My orders"; the
        // short word keeps the header on one line on small phones (decision).
        <>
          <MenuLink />
          <Link href="/orders" className={linkClass}>
            Orders
          </Link>
          <CartLink className={linkClass} />
        </>
      )}
      {/* "truncate" + max width: long names get "…" instead of breaking the header on phones */}
      <div className="max-w-[6.5rem] px-1 text-right leading-tight">
        <p className="truncate">{profile.full_name || profile.email}</p>
        <p className="truncate text-xs font-normal opacity-90">{ROLE_LABELS[profile.role]}</p>
      </div>
      <LogOutButton className={linkClass} />
    </>
  );
}
