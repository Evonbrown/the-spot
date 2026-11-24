/*
 * src/lib/reports/get-closeout.ts   (SERVER ONLY)
 *
 * WHAT: Reads the daily closeout (Step 36, FR-06 SR-6.6 / SR-6.7 / SR-6.8):
 *         getCloseout(day)            -> everything the closeout box shows:
 *                                        status, the count, who / when,
 *                                        expected cash, open orders, the
 *                                        limit and (Manager) the history;
 *         getClosedDays(start, end)   -> which days of a range are closed
 *                                        (the "Closed" column, Manager).
 *
 * LAYER: Application layer. Pages (Presentation) call it; the data comes
 *        from the database function closeout_details() and the
 *        daily_closeouts table (Data layer, migration 0019), read with the
 *        person's OWN login: the database decides what they may see
 *        (Manager any day, counter staff today only).
 */

import "server-only";
import type { OrderStatus } from "@/lib/order-status";
import { safeMessage } from "@/lib/reports/get-sales-summary";
import { createClient } from "@/lib/supabase/server";

export type CloseoutStatus = "SUBMITTED" | "APPROVED" | "REOPENED";

/* The saved closeout row (null fields = not happened yet). */
export type Closeout = {
  status: CloseoutStatus;
  isLocked: boolean;
  expectedCash: number;
  countedCash: number;
  cashDifference: number; // counted - expected
  differenceNote: string;
  submittedBy: string | null; // name
  submittedAt: number; // milliseconds since 1970
  overrideReason: string | null;
  approvedBy: string | null;
  approvedAt: number | null;
};

/* One history line: "Approved by Jane, 7:12 p.m." (+ reason). */
export type CloseoutEvent = {
  action: CloseoutStatus;
  reason: string | null;
  actor: string | null;
  createdAt: number;
};

/* Everything the closeout box needs for one day. */
export type CloseoutDetails = {
  day: string;
  expectedCash: number; // RIGHT NOW (may differ from a saved count)
  openOrders: { id: number; status: OrderStatus }[];
  limit: number; // the cash difference limit (J$)
  closeout: Closeout | null; // null = nobody has counted yet
  events: CloseoutEvent[]; // Manager only (empty for counter staff)
};

const n = (value: unknown) => Number(value ?? 0);
const time = (value: unknown) => (typeof value === "string" ? Date.parse(value) : null);

/*
 * getCloseout(day) -> { details } or { error }.
 */
export async function getCloseout(day: string): Promise<{ details: CloseoutDetails } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("closeout_details", { p_day: day });

  if (error) {
    console.error("getCloseout failed:", error.message);
    return { error: safeMessage(error.message, "We couldn't load the closeout. Please try again.") };
  }
  if (!data || typeof data !== "object") {
    return { error: "We couldn't load the closeout. Please try again." };
  }

  const raw = data as {
    day: string;
    expected_cash: unknown;
    open_orders: { id: number; status: OrderStatus }[] | null;
    limit: unknown;
    closeout: Record<string, unknown> | null;
    events: Record<string, unknown>[] | null;
  };
  const c = raw.closeout;

  return {
    details: {
      day: raw.day,
      expectedCash: n(raw.expected_cash),
      openOrders: raw.open_orders ?? [],
      limit: n(raw.limit),
      closeout: c
        ? {
            status: c.status as CloseoutStatus,
            isLocked: c.is_locked === true,
            expectedCash: n(c.expected_cash),
            countedCash: n(c.counted_cash),
            cashDifference: n(c.cash_difference),
            differenceNote: String(c.difference_note ?? ""),
            submittedBy: (c.submitted_by as string | null) ?? null,
            submittedAt: time(c.submitted_at) ?? 0,
            overrideReason: (c.override_reason as string | null) ?? null,
            approvedBy: (c.approved_by as string | null) ?? null,
            approvedAt: time(c.approved_at),
          }
        : null,
      events: (raw.events ?? []).map((e) => ({
        action: e.action as CloseoutStatus,
        reason: (e.reason as string | null) ?? null,
        actor: (e.actor as string | null) ?? null,
        createdAt: time(e.created_at) ?? 0,
      })),
    },
  };
}

/*
 * getClosedDays(start, end) -> the CLOSED (locked) days in the range, e.g.
 * ["2026-11-20", "2026-11-21"]. Manager only (RLS); on any problem, an empty
 * list (the column then just shows "–").
 */
export async function getClosedDays(start: string, end: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_closeouts")
    .select("business_day")
    .eq("is_locked", true)
    .gte("business_day", start)
    .lte("business_day", end);
  if (error) {
    console.error("getClosedDays failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => String(row.business_day));
}
