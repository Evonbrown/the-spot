/*
 * src/components/MenuTabs.tsx
 *
 * WHAT: The three tabs of the Manager's Menu screen (Steps 40a / 40b):
 *       "Menu items" | "Extras" | "Delivery".
 *
 * LAYER: Presentation. Only links; each page checks "Manager only" itself.
 *
 * Server component (no "use client"): it only draws.
 */

import Link from "next/link";

const TABS = [
  { key: "items", href: "/manager/menu", label: "Menu items" },
  { key: "extras", href: "/manager/menu/extras", label: "Extras" },
  { key: "locations", href: "/manager/menu/locations", label: "Delivery" },
] as const;

export default function MenuTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Menu sections" className="mt-3 flex gap-1 border-b border-stone-200">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={current === tab.key ? "page" : undefined}
          className={`inline-flex min-h-11 items-center border-b-2 px-3 font-semibold ${
            current === tab.key ? "border-brand text-brand" : "border-transparent text-stone-600 hover:text-stone-900"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
