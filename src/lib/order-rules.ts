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
function jamaicaDayStart(time: number): number {
  const shifted = time + JAMAICA_OFFSET;
  return Math.floor(shifted / DAY) * DAY - JAMAICA_OFFSET;
}

/* openingTime(now) / closingTime(now) -> today's 11:00 a.m. / 7:00 p.m. in Jamaica. */
export function openingTime(now: number): number {
  return jamaicaDayStart(now) + OPEN_HOUR * HOUR;
}
export function closingTime(now: number): number {
  return jamaicaDayStart(now) + CLOSE_HOUR * HOUR;
}

/*
 * earliestReadyTime(now, leadMinutes) -> the earliest moment the order can be
 * ready (or delivered) today.
 * The kitchen starts at opening time, so before 11:00 the lead time counts
 * from 11:00. Example (delivery, 20 min):
 *   ordered at 12:05 -> 12:25        ordered at 9:30 a.m. -> 11:20 a.m.
 */
export function earliestReadyTime(now: number, leadMinutes: number): number {
  return Math.max(now, openingTime(now)) + leadMinutes * MINUTE;
}

/*
 * canOrderToday(now, leadMinutes) -> false once even the earliest time is
 * after closing (e.g. 6:50 p.m. for a delivery). Same day only (decision),
 * so then the customer can't order until tomorrow.
 */
export function canOrderToday(now: number, leadMinutes: number): boolean {
  return earliestReadyTime(now, leadMinutes) <= closingTime(now);
}

/*
 * timeSlots(now, leadMinutes) -> the "later today" times to offer, every
 * 15 minutes, from the first slot at or after the earliest time, up to 7:00 p.m.
 * Example at 12:05 for delivery (earliest 12:25): 12:30, 12:45, ..., 7:00.
 * (Jamaica's offset is a whole number of hours, so 15-minute marks are the
 * same in UTC and Jamaica time.)
 */
export function timeSlots(now: number, leadMinutes: number): number[] {
  const earliest = earliestReadyTime(now, leadMinutes);
  const close = closingTime(now);
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
  leadMinutes: number
): string | null {
  if (!Number.isFinite(requested)) return "Please choose a time.";
  if (!canOrderToday(now, leadMinutes)) {
    return "Sorry, we're closed for orders today. We're open 11:00 a.m. – 7:00 p.m.";
  }
  if (jamaicaDayStart(requested) !== jamaicaDayStart(now)) {
    return "Orders can only be placed for today.";
  }
  if (requested < earliestReadyTime(now, leadMinutes)) {
    return `That time is too soon. Please choose ${formatJamaicaTime(earliestReadyTime(now, leadMinutes))} or later.`;
  }
  if (requested > closingTime(now)) {
    return "That time is after closing (7:00 p.m.). Please choose an earlier time.";
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
