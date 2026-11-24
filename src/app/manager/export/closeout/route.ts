/*
 * src/app/manager/export/closeout/route.ts
 *   ->   GET /manager/export/closeout?date=2026-11-24
 *
 * WHAT: Downloads the Daily Closeout report for ONE business day as a CSV
 *       file (Step 37, FR-06 SR-6.9): header lines (The Spot, the day,
 *       generated at / by, FINAL or DRAFT), the day's figures, the cash
 *       closeout and its history.
 *
 * LAYER: Application layer. A "route handler" = a server address that sends
 *        back a FILE instead of a page. Manager only (SR-6.10).
 */

import { csvFileName } from "@/lib/reports/csv";
import { csvResponse, managerForExport, textResponse } from "@/lib/reports/export-response";
import { jamaicaToday, parseReportDay } from "@/lib/reports/get-sales-summary";
import { loadCloseoutReport, reportNow } from "@/lib/reports/load-report";
import { closeoutCsvRows } from "@/lib/reports/report-csv";
import { makeReportInfo } from "@/lib/reports/report-info";

/*
 * GET: 1. Manager check (else 401 / 403, no file).
 *      2. Check the date (?date=, empty = today; no future days).
 *      3. Load the figures (the database checks the role again).
 *      4. Lay them out as CSV and send the file.
 */
export async function GET(request: Request) {
  const access = await managerForExport();
  if ("denied" in access) return access.denied;

  const search = new URL(request.url).searchParams;
  const today = await jamaicaToday();
  const parsed = parseReportDay(search.get("date") ?? search.get("from") ?? undefined, today);
  if ("error" in parsed) return textResponse(parsed.error, 400);

  const report = await loadCloseoutReport(parsed.day);
  if (!report.ok) return textResponse(report.error, 500);

  const info = makeReportInfo({
    title: "Daily Closeout report",
    start: parsed.day,
    end: parsed.day,
    person: access.profile,
    now: await reportNow(),
  });
  return csvResponse(
    closeoutCsvRows(info, report.state, report.summary, report.details),
    csvFileName("closeout", parsed.day)
  );
}
