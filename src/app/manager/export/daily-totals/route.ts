/*
 * src/app/manager/export/daily-totals/route.ts
 *   ->   GET /manager/export/daily-totals?from=2026-11-18&to=2026-11-24
 *
 * WHAT: Downloads the "Daily totals" of a date range (1 to 31 days) as a CSV
 *       file (Step 37, FR-06 SR-6.9 + SR-6.5): header lines, then one line
 *       per day (Date, Orders, Gross, Refunds, Net, Cash, Lynk, Closed) and
 *       the Total line.
 *
 * LAYER: Application layer (route handler: sends a FILE). Manager only.
 */

import { csvFileName } from "@/lib/reports/csv";
import { csvResponse, managerForExport, textResponse } from "@/lib/reports/export-response";
import { jamaicaToday } from "@/lib/reports/get-sales-summary";
import { loadRangeReport, paramsFromUrl, readReportPeriod, reportNow } from "@/lib/reports/load-report";
import { dailyTotalsCsvRows } from "@/lib/reports/report-csv";
import { makeReportInfo } from "@/lib/reports/report-info";

/* GET: Manager check -> check the range -> load -> send the CSV. */
export async function GET(request: Request) {
  const access = await managerForExport();
  if ("denied" in access) return access.denied;

  const params = paramsFromUrl(new URL(request.url).searchParams);
  const period = readReportPeriod(params, await jamaicaToday());
  if ("error" in period) return textResponse(period.error, 400);

  const report = await loadRangeReport(period.start, period.end);
  if (!report.ok) return textResponse(report.error, 500);

  const info = makeReportInfo({
    title: "Daily totals",
    start: period.start,
    end: period.end,
    person: access.profile,
    now: await reportNow(),
  });
  return csvResponse(
    dailyTotalsCsvRows(info, report.state, report.range, report.closedDays),
    csvFileName("daily-totals", period.start, "to", period.end)
  );
}
