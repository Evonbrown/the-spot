/*
 * src/lib/reports/load-report.ts   (SERVER ONLY)
 *
 * WHAT: Loads everything ONE printed / exported report needs (Step 37,
 *       FR-06 SR-6.9), in one place:
 *         readReportPeriod(params, today) -> the checked day or range;
 *         readReportFilters(params)       -> the checked item filters;
 *         loadCloseoutReport(day)         -> day's figures + closeout;
 *         loadRangeReport(start, end)     -> daily totals + closed days;
 *         loadItemReport(start, end, f)   -> item lines + closed days;
 *         reportNow()                     -> "now", for "Generated at".
 *       Each one also says FINAL or DRAFT (reportState, report-info.ts).
 *
 * LAYER: Application layer. Used by BOTH the print page (/manager/print)
 *        and the CSV routes (/manager/export/...), so the paper and the file
 *        always show exactly the same figures. The figures come from the
 *        Step 34-36 database functions, called with the Manager's OWN
 *        login, so the database checks the role and the dates AGAIN.
 */

import "server-only";
import { connection } from "next/server";
import { getMenuItems } from "@/lib/menu";
import { getCategories } from "@/lib/menu-helpers";
import { getCloseout, getClosedDays, type CloseoutDetails } from "@/lib/reports/get-closeout";
import { getItemVolume, readItemFilters, type ItemFilters, type ItemVolumeLine } from "@/lib/reports/get-item-volume";
import {
  daysBetween,
  getSalesRange,
  getSalesSummary,
  parseReportRange,
  type SalesRange,
  type SalesSummary,
} from "@/lib/reports/get-sales-summary";
import { reportState, type ReportState } from "@/lib/reports/report-info";

/*
 * reportNow() -> the current time (milliseconds), for "Generated at".
 * await connection(): the time must be the REAL visit's time, never one
 * worked out in advance (see get-profile.ts). Kept out of the page's
 * drawing code, because React wants drawing to give the same result every
 * time it runs.
 */
export async function reportNow(): Promise<number> {
  await connection();
  return Date.now();
}

/* The address values (?from=...&to=...): a list means "use the first". */
type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/* Turns a URLSearchParams (route handlers) into the same shape as page params. */
export function paramsFromUrl(search: URLSearchParams): Params {
  const params: Params = {};
  for (const key of new Set(search.keys())) params[key] = search.getAll(key);
  return params;
}

/*
 * readReportPeriod(params, today) -> { start, end } or { error }.
 * Same rules as /manager: ?from= (or ?date=), ?to=; empty "to" = one day;
 * real dates, no future, at most 31 days (parseReportRange, Step 35).
 */
export function readReportPeriod(params: Params, today: string) {
  return parseReportRange(first(params.from) ?? first(params.date), first(params.to), today);
}

/*
 * readReportFilters(params) -> the item filters, checked against the REAL
 * category list (anything unknown = "all"), same as /manager.
 */
export async function readReportFilters(params: Params): Promise<ItemFilters> {
  const categories = await getMenuItems().then(getCategories, () => [] as string[]);
  return readItemFilters(
    { category: first(params.category), type: first(params.type), sort: first(params.sort) },
    categories
  );
}

type Loaded<T> = ({ ok: true; state: ReportState } & T) | { ok: false; error: string };

/*
 * loadCloseoutReport(day): the day's sales summary AND its closeout, at the
 * same time. FINAL only if the closeout is approved and LOCKED (a reopened
 * day is a draft again).
 */
export async function loadCloseoutReport(
  day: string
): Promise<Loaded<{ summary: SalesSummary; details: CloseoutDetails }>> {
  const [summary, closeout] = await Promise.all([getSalesSummary(day), getCloseout(day)]);
  if ("error" in summary) return { ok: false, error: summary.error };
  if ("error" in closeout) return { ok: false, error: closeout.error };
  const locked = closeout.details.closeout?.isLocked === true;
  return {
    ok: true,
    summary: summary.summary,
    details: closeout.details,
    state: reportState(locked ? 1 : 0, 1),
  };
}

/* loadRangeReport(start, end): a line per day + the total, and the closed days. */
export async function loadRangeReport(
  start: string,
  end: string
): Promise<Loaded<{ range: SalesRange; closedDays: string[] }>> {
  const [range, closedDays] = await Promise.all([getSalesRange(start, end), getClosedDays(start, end)]);
  if ("error" in range) return { ok: false, error: range.error };
  return {
    ok: true,
    range: range.range,
    closedDays,
    state: reportState(closedDays.length, range.range.days.length),
  };
}

/* loadItemReport(start, end, filters): the item lines, and the closed days. */
export async function loadItemReport(
  start: string,
  end: string,
  filters: ItemFilters
): Promise<Loaded<{ lines: ItemVolumeLine[]; closedDays: string[] }>> {
  const [items, closedDays] = await Promise.all([getItemVolume(start, end, filters), getClosedDays(start, end)]);
  if ("error" in items) return { ok: false, error: items.error };
  return {
    ok: true,
    lines: items.lines,
    closedDays,
    state: reportState(closedDays.length, daysBetween(start, end) + 1),
  };
}
