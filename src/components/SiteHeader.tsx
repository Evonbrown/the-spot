/*
 * src/components/SiteHeader.tsx
 *
 * WHAT: The top bar shown on every page: "The Spot" name and the main links.
 * LAYER: Presentation.
 *
 * WHY a component? A "component" is a reusable piece of the page. We write the
 * header once and put it in layout.tsx, so every page gets the same header.
 * If we change it here, every page updates.
 */

import Link from "next/link";

/*
 * SiteHeader
 * "sticky top-0" keeps the bar visible at the top while the user scrolls,
 * which helps on phones where pages get long.
 * We use Next.js <Link> instead of a plain <a>: it switches pages without
 * reloading the whole site, so moving around feels faster.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 bg-brand text-white shadow">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          The Spot
        </Link>
        <div className="flex gap-1 text-sm font-semibold">
          {/* py-2 px-3 makes each link a big enough target for a thumb */}
          <Link href="/" className="rounded-md px-3 py-2 hover:bg-brand-dark">
            Home
          </Link>
          <Link href="/menu" className="rounded-md px-3 py-2 hover:bg-brand-dark">
            Menu
          </Link>
        </div>
      </nav>
    </header>
  );
}
