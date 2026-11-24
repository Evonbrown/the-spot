/*
 * src/lib/test-settings.ts
 *
 * WHAT: Test-only settings that make the app easier to try on OUR laptops.
 *       Right now there is one: "ignore opening hours", so checkout can be
 *       tested at night (FR-01 normally only allows 11:00 a.m. - 7:00 p.m.).
 *
 * LAYER: Application layer (server only). Pages and server actions ask this
 *        file which opening hours to use; they never read the setting
 *        themselves, so the safety check below lives in ONE place.
 *
 * HOW TO SWITCH IT ON (on your own computer only):
 *   1. In .env.local add the line:   TEST_IGNORE_OPENING_HOURS=true
 *   2. Stop the dev server (Ctrl + C) and run `npm run dev` again.
 *   To switch it off: delete the line (or set it to false) and restart.
 *
 * WHY IT CAN NEVER WORK ON THE LIVE SITE (two locks, BOTH must be open):
 *   Lock 1: process.env.NODE_ENV must be "development". Next.js sets this
 *           itself: "development" for `npm run dev`, "production" for
 *           `npm run build` / `npm start` and for every Vercel deployment.
 *           We can't change it from .env.local.
 *   Lock 2: TEST_IGNORE_OPENING_HOURS must be "true". .env.local is ignored by
 *           git (.gitignore has ".env*"), so it never reaches GitHub or Vercel.
 *   So even if someone typed TEST_IGNORE_OPENING_HOURS=true into Vercel's
 *   settings by mistake, Lock 1 would still keep the real hours on the live site.
 *
 * WHY "server-only"? That import makes the build FAIL if a browser component
 * ever imports this file. The browser can't see this setting anyway (it has no
 * NEXT_PUBLIC_ prefix), so the server works out the answer and passes it to
 * the page, and the server re-checks everything when an order is placed.
 */

import "server-only";
import { STORE_HOURS, TEST_ALL_DAY_HOURS, type OpeningHours } from "@/lib/order-rules";

/*
 * isIgnoreOpeningHoursOn() -> true only when BOTH locks are open (see above).
 * The value must be exactly "true", so a typo means "off" (the safe side).
 */
export function isIgnoreOpeningHoursOn(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.TEST_IGNORE_OPENING_HOURS === "true"
  );
}

/*
 * getOpeningHours() -> the hours the order rules should use right now:
 * the real FR-01 hours, or "open all day" while testing on a laptop.
 * Used by the checkout page (Part 20) and the placeOrder action (Part 21), so
 * what the page OFFERS and what the server ACCEPTS always match.
 */
export function getOpeningHours(): OpeningHours {
  return isIgnoreOpeningHoursOn() ? TEST_ALL_DAY_HOURS : STORE_HOURS;
}
