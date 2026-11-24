/*
 * src/lib/order-rules.ts
 *
 * WHAT: The FR-01 rules about WHEN an order can be ready:
 *         - opening/delivery hours 11:00 a.m. - 7:00 p.m.;
 *         - lead times: pickup straight away; pickup with a made-to-order item
 *           (fries) at least 15 min; delivery at least 20 min (the larger rule
 *           wins when both apply);
 *         - same day only, in 15-minute steps (decision).
 *       Plus helpers to show times in Jamaica time.
 *
 * LAYER: Application layer (business rules). Pure functions, browser-safe:
 *        the checkout page (Part 20) uses them to OFFER only allowed times,
 *        and the server (Part 21) uses the SAME functions to CHECK the order.
 *
 * TIME ZONES: Vercel's servers run on UTC ("world time"), and a customer's
 *   phone could be set to any zone. The Spot is in Jamaica, which is always
 *   UTC-5 (no daylight saving). So every rule here works in Jamaica time,
 *   whatever clock the computer running it uses.
 *
 * All times are passed around as "milliseconds since 1970" (what Date.now()
 * returns). That's one plain number, the same everywhere in the world.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Jamaica = UTC minus 5 hours, all year (no daylight saving time).
const JAMAICA_OFFSET = -5 * HOUR;

// FR-01: open 11:00 a.m. to 7:00 p.m. (as hours after midnight, Jamaica time).
export const OPEN_HOUR = 11;
export const CLOSE_HOUR = 19;

/*
 * OpeningHours: when orders can be ready, as MINUTES after midnight (Jamaica).
 * The rule functions below take this as an optional last value. If it's left
 * out they use STORE_HOURS, the real FR-01 hours, so normal code never has to
 * think about it.
 */
export type OpeningHours = { openMinute: number; closeMinute: number };

// The real hours (FR-01): 11:00 a.m. - 7:00 p.m.
export const STORE_HOURS: OpeningHours = {
  openMinute: OPEN_HOUR * 60,
  closeMinute: CLOSE_HOUR * 60,
};

/*
 * TEST ONLY: "open all day" (midnight to 11:45 p.m.), so we can try checkout at
 * night on a laptop. Lead times and "same day only" still apply.
 * It is only switched on by src/lib/test-settings.ts, which refuses to switch
 * it on anywhere except `npm run dev`. Never use this value directly.
 * (11:45 p.m., not midnight: midnight would already be TOMORROW.)
 */
export const TEST_ALL_DAY_HOURS: OpeningHours = {
  openMinute: 0,
  closeMinute: 23 * 60 + 45,
};

// Decision: "later today" times are offered in 15-minute steps.
export const SLOT_MINUTES = 15;

export type Fulfilment = "PICKUP" | "DELIVERY";

/*
 * leadTimeMinutes(fulfilment, hasMadeToOrder) -> minimum minutes before ready.
 * FR-01:  pickup                          -> 0  ("immediate")
 *         pickup with a made-to-order item -> 15 (fries)
 *         delivery                         -> 20
 *         delivery with fries              -> 20 (the LARGER rule: max(20, 15))
 */
export function leadTimeMinutes(fulfilment: Fulfilment, hasMadeToOrder: boolean): number {
  const pickupMinutes = hasMadeToOrder ? 15 : 0;
  return fulfilment === "DELIVERY" ? Math.max(20, pickupMinutes) : pickupMinutes;
}

/*
 * jamaicaDayStart(time) -> the moment it was midnight in Jamaica on that day.
 * How: shift the time into "Jamaica clock" numbers, cut it back to the start
 * of that day, then shift back.
 */
// Exported for Step 26: "Past Orders" lists only TODAY's orders (Jamaica day).
export function jamaicaDayStart(time: number): number {
  const shifted = time + JAMAICA_OFFSET;
  return Math.floor(shifted / DAY) * DAY - JAMAICA_OFFSET;
}

/*
 * openingTime(now) / closingTime(now) -> today's 11:00 a.m. / 7:00 p.m. in Jamaica.
 * (Or the test hours, if those are passed in.)
 */
export function openingTime(now: number, hours: OpeningHours = STORE_HOURS): number {
  return jamaicaDayStart(now) + hours.openMinute * MINUTE;
}
export function closingTime(now: number, hours: OpeningHours = STORE_HOURS): number {
  return jamaicaDayStart(now) + hours.closeMinute * MINUTE;
}

/*
 * earliestReadyTime(now, leadMinutes) -> the earliest moment the order can be
 * ready (or delivered) today.
 * The kitchen starts at opening time, so before 11:00 the lead time counts
 * from 11:00. Example (delivery, 20 min):
 *   ordered at 12:05 -> 12:25        ordered at 9:30 a.m. -> 11:20 a.m.
 */
export function earliestReadyTime(
  now: number,
  leadMinutes: number,
  hours: OpeningHours = STORE_HOURS
): number {
  return Math.max(now, openingTime(now, hours)) + leadMinutes * MINUTE;
}

/*
 * canOrderToday(now, leadMinutes) -> false once even the earliest time is
 * after closing (e.g. 6:50 p.m. for a delivery). Same day only (decision),
 * so then the customer can't order until tomorrow.
 */
export function canOrderToday(
  now: number,
  leadMinutes: number,
  hours: OpeningHours = STORE_HOURS
): boolean {
  return earliestReadyTime(now, leadMinutes, hours) <= closingTime(now, hours);
}

/*
 * timeSlots(now, leadMinutes) -> the "later today" times to offer, every
 * 15 minutes, from the first slot at or after the earliest time, up to 7:00 p.m.
 * Example at 12:05 for delivery (earliest 12:25): 12:30, 12:45, ..., 7:00.
 * (Jamaica's offset is a whole number of hours, so 15-minute marks are the
 * same in UTC and Jamaica time.)
 */
export function timeSlots(
  now: number,
  leadMinutes: number,
  hours: OpeningHours = STORE_HOURS
): number[] {
  const earliest = earliestReadyTime(now, leadMinutes, hours);
  const close = closingTime(now, hours);
  const slots: number[] = [];
  const step = SLOT_MINUTES * MINUTE;
  for (let t = Math.ceil(earliest / step) * step; t <= close; t += step) {
    slots.push(t);
  }
  return slots;
}

/*
 * checkRequestedTime(now, requested, leadMinutes)
 * The SERVER's check (Part 21) of a time chosen on the checkout page. Returns
 * null if it's allowed, or a message saying what's wrong.
 * The page might have been open a while, so a time that was fine 10 minutes
 * ago may now be too soon: then the customer is asked to pick again.
 */
export function checkRequestedTime(
  now: number,
  requested: number,
  leadMinutes: number,
  hours: OpeningHours = STORE_HOURS
): string | null {
  if (!Number.isFinite(requested)) return "Please choose a time.";
  if (!canOrderToday(now, leadMinutes, hours)) {
    return "Sorry, we're closed for orders today. We're open 11:00 a.m. – 7:00 p.m.";
  }
  if (jamaicaDayStart(requested) !== jamaicaDayStart(now)) {
    return "Orders can only be placed for today.";
  }
  // Decision: only the 15-minute times the page offers (e.g. 12:30, not 12:37).
  if (requested % (SLOT_MINUTES * MINUTE) !== 0) {
    return "Please choose one of the times offered.";
  }
  const earliest = earliestReadyTime(now, leadMinutes, hours);
  if (requested < earliest) {
    return `That time is too soon. Please choose ${formatJamaicaTime(earliest)} or later.`;
  }
  const close = closingTime(now, hours);
  if (requested > close) {
    return `That time is after closing (${formatJamaicaTime(close)}). Please choose an earlier time.`;
  }
  return null;
}

/*
 * formatJamaicaTime(time) -> "12:30 p.m." (always Jamaica time).
 * Intl.DateTimeFormat is the browser's built-in date formatter; timeZone makes
 * it use Jamaica time even on a UTC server or a phone set to another zone.
 */
const jamaicaTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Jamaica",
  hour: "numeric",
  minute: "2-digit",
});
export function formatJamaicaTime(time: number): string {
  return jamaicaTimeFormat.format(time).replace("AM", "a.m.").replace("PM", "p.m.");
}

/*
 * formatJamaicaDateTime(time) -> "Mon 23 Nov, 12:05 p.m." (always Jamaica time).
 * Used on the order confirmation page (Part 22) for when the order was placed.
 * "en-GB" gives the day-before-month order ("23 Nov") used in Jamaica.
 */
const jamaicaDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Jamaica",
  weekday: "short",
  day: "numeric",
  month: "short",
});
export function formatJamaicaDateTime(time: number): string {
  return `${jamaicaDateFormat.format(time)}, ${formatJamaicaTime(time)}`;
}

// =============================================================================
// Step 41 (FR-01 SR-1.3, AC-2, TS-2.2): DROP-OFF DETAILS for delivery orders.
// =============================================================================

/* The length rule (same numbers as the database CHECK, migration 0028). */
export const DROP_OFF_MIN = 3;
export const DROP_OFF_MAX = 200;

/* The message when it's missing (the database says exactly the same). */
export const DROP_OFF_MISSING = "Add drop-off details (building, room or landmark).";

/*
 * readDropOffDetails(text) -> { details } (tidied) or { error }.
 *   "  Chancellor Hall,   Block B " -> "Chancellor Hall, Block B"
 *   "" or only spaces               -> DROP_OFF_MISSING
 *   "A" / 201 characters            -> a length message
 * Used by the checkout page (instant hint) AND placeOrder (the real check).
 */
export function readDropOffDetails(text: string): { details: string } | { error: string } {
  const details = text.trim().replace(/\s+/g, " ");
  if (details === "") return { error: DROP_OFF_MISSING };
  if (details.length < DROP_OFF_MIN) {
    return { error: `Drop-off details need at least ${DROP_OFF_MIN} characters (e.g. "Chancellor Hall, Block B").` };
  }
  if (details.length > DROP_OFF_MAX) return { error: `Drop-off details can be at most ${DROP_OFF_MAX} characters.` };
  return { details };
}
