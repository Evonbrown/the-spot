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
    // Our own messages from the function (role / date rules) are safe to show.
    const known = ["Counter staff can only see today's sales.", "You are not allowed to see sales reports."];
    return { error: known.includes(error.message) ? error.message : "We couldn't load the sales summary. Please try again." };
  }

  // The JSON from the database (snake_case). Number(...) because exact
  // numeric values can arrive as text.
  const raw = data as Record<string, unknown> & { by_method: Record<string, unknown>[] | null };
  const n = (value: unknown) => Number(value ?? 0);

  return {
    summary: {
      day: String(raw.day),
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
    },
  };
}
