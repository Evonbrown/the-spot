/*
 * src/lib/reports/get-sales-summary.ts   (SERVER ONLY)
 *
 * WHAT: The Daily Sales Summary for one business day (Step 34, FR-06
 *       SR-6.1 / SR-6.2 / SR-6.3 / SR-6.10):
 *         jamaicaToday()        -> today's date in Jamaica, e.g. "2026-11-24";
 *         parseReportDay(text)  -> a valid, not-future day from the address,
 *                                  or a message;
 *         getSalesSummary(day)  -> all the figures, worked out BY THE
 *                                  DATABASE (daily_sales_summary, 0016).
 *       Step 35 (SR-6.5), Manager only:
 *         parseReportRange(...) -> a valid 1-31 day range, or a message;
 *         getSalesRange(...)    -> a line per day + the combined summary
 *                                  (sales_range_summary, 0017).
 *
 * LAYER: Application layer. The /manager and /staff/sales pages
 *        (Presentation) call it; the maths happens in the Data layer.
 *
 * WHY THE DATABASE DOES THE MATHS: exact money values (numeric, no
 * JavaScript rounding errors), one quick query (3 s for 500 orders), and the
 * role + date check (SR-6.10) lives right next to the data, so it can't be
 * skipped. We call it with the person's OWN login (not the secret key):
 * the function checks WHO is asking.
 */

import "server-only";
import { connection } from "next/server";
import type { PaymentMethod } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";

/* One payment type's line in the breakdown (SR-6.2). */
export type MethodLine = {
  method: PaymentMethod;
  transactions: number;
  amount: number;
  refunds: number; // J$0 until Step 38 (refunds table)
  net: number;
  percent: number; // % of net sales, 1 decimal
};

/* The whole summary for one day. All amounts in J$. */
export type SalesSummary = {
  day: string; // "2026-11-24"
  orders: number; // COUNTED orders: PAID, not cancelled / abandoned
  grossSales: number;
  deliveryFees: number; // part of gross sales
  refunds: number; // J$0 until Step 38
  netSales: number;
  cancelledCount: number;
  cancelledValue: number;
  abandonedCount: number;
  abandonedValue: number;
  notCountedCount: number; // unpaid (e.g. Lynk waiting for the Supervisor)
  notCountedValue: number;
  byMethod: MethodLine[]; // Lynk, Cash
  methodsTotal: number;
  totalsMatch: boolean; // AC-6.3: false -> show the warning
};

/*
 * jamaicaToday() -> "YYYY-MM-DD" in Jamaica time (the server runs on UTC).
 * "en-CA" happens to write dates as YYYY-MM-DD, the format date inputs use.
 * await connection(): uses the current time, so it must be worked out for
 * each real visit (see get-profile.ts).
 */
export async function jamaicaToday(): Promise<string> {
  await connection();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now());
}

/*
 * parseReportDay(text, today) -> { day } or { error }.
 * The address can contain anything (?date=banana), so we check it:
 *   - empty -> today;
 *   - must be a REAL date in YYYY-MM-DD form (not 2026-02-31);
 *   - not in the future (there are no sales yet).
 */
export function parseReportDay(text: string | undefined, today: string): { day: string } | { error: string } {
  if (!text) return { day: today };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: "That isn't a valid date." };
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return { error: "That isn't a valid date." };
  }
  // YYYY-MM-DD text sorts the same way as the dates themselves.
  if (text > today) return { error: "That day hasn't happened yet. Choose today or an earlier day." };
  return { day: text };
}

/*
 * getSalesSummary(day) -> { summary } or { error }.
 * The database refuses with a message if this person may not see that day
 * (e.g. counter staff asking for yesterday); we pass that message on.
 */
export async function getSalesSummary(day: string): Promise<{ summary: SalesSummary } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_sales_summary", { p_day: day });

  if (error) {
    console.error("getSalesSummary failed:", error.message);
    return { error: safeMessage(error.message, "We couldn't load the sales summary. Please try again.") };
  }

  return { summary: toSummary(data as RawSummary) };
}

// ---- Turning the database's JSON into our shape ------------------------------

// The JSON from the database (snake_case names, numbers may arrive as text).
type RawSummary = Record<string, unknown> & { by_method?: Record<string, unknown>[] | null };

/* Number(...) because exact numeric values can arrive as text ("1200.00"). */
const n = (value: unknown) => Number(value ?? 0);

/*
 * toSummary(raw, day) -> our SalesSummary. Shared by the one-day summary
 * (Step 34) and the range total (Step 35): the database uses the SAME names
 * for both, so they're read the same way.
 */
function toSummary(raw: RawSummary, day?: string): SalesSummary {
  return {
    day: day ?? String(raw.day),
    orders: n(raw.orders),
    grossSales: n(raw.gross_sales),
    deliveryFees: n(raw.delivery_fees),
    refunds: n(raw.refunds),
    netSales: n(raw.net_sales),
    cancelledCount: n(raw.cancelled_count),
    cancelledValue: n(raw.cancelled_value),
    abandonedCount: n(raw.abandoned_count),
    abandonedValue: n(raw.abandoned_value),
    notCountedCount: n(raw.not_counted_count),
    notCountedValue: n(raw.not_counted_value),
    byMethod: (raw.by_method ?? []).map((line) => ({
      method: line.method as PaymentMethod,
      transactions: n(line.transactions),
      amount: n(line.amount),
      refunds: n(line.refunds),
      net: n(line.net),
      percent: n(line.percent),
    })),
    methodsTotal: n(raw.methods_total),
    totalsMatch: raw.totals_match === true,
  };
}

// =============================================================================
// Step 35 (SR-6.5): a DATE RANGE (1 to 31 days), Manager only
// =============================================================================

/* The longest range (decision; same number as the database check, 0017). */
export const MAX_RANGE_DAYS = 31;

/* One line of the "Daily totals" table. */
export type DayTotal = {
  day: string; // "2026-11-24"
  orders: number;
  grossSales: number;
  refunds: number; // J$0 until Step 38
  netSales: number;
  cash: number;
  lynk: number;
};

/* The range report: a line per day + the combined summary. */
export type SalesRange = {
  start: string;
  end: string;
  days: DayTotal[];
  total: SalesSummary; // the whole range, same figures as a one-day summary
};

/*
 * daysBetween("2026-11-01", "2026-11-03") -> 2. Plain dates, so we count in
 * UTC: no time-zone or summer-time surprises.
 */
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

/*
 * parseReportRange(fromText, toText, today) -> { start, end } or { error }.
 *   - no "from"      -> today;
 *   - no "to"        -> the same day as "from" (= a one-day report);
 *   - both must be real, not-future dates (parseReportDay);
 *   - "to" not before "from", and at most 31 days.
 * The database checks the same rules again.
 */
export function parseReportRange(
  fromText: string | undefined,
  toText: string | undefined,
  today: string
): { start: string; end: string } | { error: string } {
  const from = parseReportDay(fromText, today);
  if ("error" in from) return { error: `Start day: ${from.error}` };
  const to = parseReportDay(toText || from.day, today);
  if ("error" in to) return { error: `End day: ${to.error}` };
  if (to.day < from.day) return { error: "The end day must be on or after the start day." };
  if (daysBetween(from.day, to.day) + 1 > MAX_RANGE_DAYS) {
    return { error: `Choose at most ${MAX_RANGE_DAYS} days.` };
  }
  return { start: from.day, end: to.day };
}

/*
 * getSalesRange(start, end) -> { range } or { error }.
 * The database works out every day AND the combined total in one call
 * (sales_range_summary, migration 0017), Manager only.
 */
export async function getSalesRange(start: string, end: string): Promise<{ range: SalesRange } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_range_summary", { p_start: start, p_end: end });

  if (error) {
    console.error("getSalesRange failed:", error.message);
    return { error: safeMessage(error.message, "We couldn't load the sales for that range. Please try again.") };
  }

  const raw = data as { start: string; end: string; total: RawSummary; days: Record<string, unknown>[] | null };
  return {
    range: {
      start: raw.start,
      end: raw.end,
      total: toSummary(raw.total, `${raw.start}..${raw.end}`),
      days: (raw.days ?? []).map((day) => ({
        day: String(day.day),
        orders: n(day.orders),
        grossSales: n(day.gross_sales),
        refunds: n(day.refunds),
        netSales: n(day.net_sales),
        cash: n(day.cash),
        lynk: n(day.lynk),
      })),
    },
  };
}

/*
 * safeMessage(message, fallback): our OWN messages from the report functions
 * (role and date rules, written by us in 0016/0017) are safe to show; any
 * other database error is shown as a general "try again".
 */
export function safeMessage(message: string, fallback: string): string {
  const ours = [
    "Counter staff can only see today's sales.",
    "You are not allowed to see sales reports.",
    "Only the Manager can see these reports.",
    "The end day must be on or after the start day.",
    "Choose at most 31 days.",
    "The range can't include future days.",
    // Step 36 (closeout_details, 0019):
    "Counter staff can only see today's closeout.",
    "You are not allowed to see closeouts.",
  ];
  return ours.includes(message) ? message : fallback;
}
