/*
 * src/components/ManagerNav.tsx
 *
 * WHAT: The small "Reports | Menu" switch at the top of the Manager's pages
 *       (Step 40a): Reports = sales, closeout, export (Steps 34-37); Menu =
 *       change menu items, prices, extras and delivery locations (QA-3).
 *
 * LAYER: Presentation. Only links: each page checks "Manager only" itself
 *        (requireRole).
 *
 * Server component (no "use client"): it only draws.
 */

import Link from "next/link";

export default function ManagerNav({ current }: { current: "reports" | "menu" }) {
  const tab = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-lg px-4 font-semibold ${
      active ? "bg-brand text-white" : "bg-white text-brand hover:bg-orange-50"
    }`;
  return (
    <nav aria-label="Manager sections" className="flex gap-2 pt-4 print:hidden">
      <Link href="/manager" aria-current={current === "reports" ? "page" : undefined} className={tab(current === "reports")}>
        Reports
      </Link>
      <Link href="/manager/menu" aria-current={current === "menu" ? "page" : undefined} className={tab(current === "menu")}>
        Menu
      </Link>
    </nav>
  );
}
