/*
 * src/components/CategoryBar.tsx
 *
 * WHAT: The row of category buttons at the top of the Menu page (Chicken,
 *       Pork & Beef, ...). It sticks under the header while you scroll, and the
 *       button for the section you are looking at is highlighted.
 *
 * LAYER: Presentation.
 *
 * WHY: Usability (SRS 3): a first-time customer must be able to order in under
 *      3 minutes. Seeing where you are on a long menu (56 items) and jumping
 *      straight to a category saves time, especially on phones.
 *
 * "use client" = this component also runs IN THE BROWSER, because it has to
 * react to scrolling. The rest of the Menu page stays a Server Component.
 * If this JavaScript fails to load, the buttons still work as plain links.
 */
"use client";

import { useEffect, useRef, useState } from "react";

/* One button: the text shown, and the id of the section it jumps to. */
export type CategoryLink = {
  name: string; // e.g. "Pork & Beef"
  id: string; // e.g. "pork-and-beef" (the section's id on the page)
};

/*
 * CategoryBar
 * Props: categories = the buttons, in menu order (worked out by the server).
 */
export default function CategoryBar({ categories }: { categories: CategoryLink[] }) {
  // Which section is on screen right now. "useState" = a value that, when
  // changed, makes React redraw the buttons. Starts with the first category.
  // "string | undefined": undefined only if there were no categories at all.
  const [activeId, setActiveId] = useState<string | undefined>(categories[0]?.id);

  // "useRef" = a handle to a real element on the page (here, the bar itself),
  // so we can measure it and scroll it sideways.
  const barRef = useRef<HTMLElement>(null);

  /*
   * Effect 1: work out the active section whenever the page scrolls.
   * "useEffect" runs code in the browser after the component appears. The
   * function it returns runs when the component disappears (clean-up).
   *
   * RULE: the active section is the LAST one whose top has scrolled up to the
   * bottom of the sticky bar. Example: once "Mixes" reaches the bar, Mixes is
   * active, even if part of "Goat & Fish" is still visible above it.
   * Every section CAN reach the bar, because MenuBrowser makes the last section
   * at least one screen tall (fix for short sections near the end, such as
   * Energy & Sports, which used to be skipped).
   */
  useEffect(() => {
    // requestAnimationFrame = "do this just before the next screen redraw".
    // Scroll events fire many times per second; this makes sure we only do the
    // work once per frame, so scrolling stays smooth on cheap phones.
    let frame = 0;

    function updateActive() {
      frame = 0;
      const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0;

      let current = categories[0]?.id;
      for (const { id } of categories) {
        const section = document.getElementById(id);
        // +8 = a little slack, so a section counts as soon as it reaches the bar.
        if (section && section.getBoundingClientRect().top <= barBottom + 8) {
          current = id;
        }
      }
      setActiveId(current);
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(updateActive);
    }

    updateActive(); // once at the start (e.g. the page opened at "#mixes")
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [categories]);

  /*
   * Effect 2: keep the active button visible inside the bar.
   * On phones the bar is wider than the screen and scrolls sideways. When the
   * active button changes, scroll the BAR (not the page) so it's in view.
   * WHY not element.scrollIntoView()? In some browsers that would interrupt
   * the page's own smooth scroll after tapping a button.
   */
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !activeId) return;
    const escapedId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(activeId) : activeId;
    const button = bar.querySelector<HTMLElement>(`[data-id="${escapedId}"]`);
    if (!button) return;

    const buttonLeft = button.offsetLeft;
    const buttonRight = buttonLeft + button.offsetWidth;
    const visibleLeft = bar.scrollLeft;
    const visibleRight = visibleLeft + bar.clientWidth;

    if (buttonLeft < visibleLeft || buttonRight > visibleRight) {
      // Put the button roughly in the middle of the bar.
      bar.scrollTo({
        left: buttonLeft - bar.clientWidth / 2 + button.offsetWidth / 2,
        behavior: "smooth",
      });
    }
  }, [activeId]);

  return (
    // sticky top-14 = stick just under the 56px header. z-[5] keeps it above
    // the cards but under the header. overflow-x-auto = sideways scrolling.
    <nav
      ref={barRef}
      aria-label="Menu categories"
      className="sticky top-14 z-[5] -mx-4 mt-4 flex gap-2 overflow-x-auto bg-cream px-4 py-3"
    >
      {categories.map(({ name, id }) => {
        const active = id === activeId;
        return (
          // A plain link to "#id": the browser jumps to the section by itself.
          // The smooth movement comes from CSS (globals.css), not JavaScript.
          <a
            key={id}
            href={`#${id}`}
            data-id={id}
            // aria-current tells screen readers which button is the current one.
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border border-brand px-4 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-brand text-white" : "text-brand hover:bg-orange-100"
            }`}
          >
            {name}
          </a>
        );
      })}
    </nav>
  );
}
