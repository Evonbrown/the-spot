/*
 * src/app/manager/export/items/route.ts
 *   ->   GET /manager/export/items?from=...&to=...&category=...&type=...&sort=...
 *
 * WHAT: Downloads the Item Volume Report as a CSV file (Step 37, FR-06
 *       SR-6.9 + SR-6.4), with the SAME filters the Manager chose on the
 *       page: header lines, the filters, one line per item and size, Total.
 *
 * LAYER: Application layer (route handler: sends a FILE). Manager only.
 */

import { csvFileName } from "@/lib/reports/csv";
import { csvResponse, managerForExport, textResponse } from "@/lib/reports/export-response";
import { jamaicaToday } from "@/lib/reports/get-sales-summary";
import { loadItemReport, paramsFromUrl, readReportFilters, readReportPeriod, reportNow } from "@/lib/reports/load-report";
import { itemVolumeCsvRows } from "@/lib/reports/report-csv";
import { makeReportInfo } from "@/lib/reports/report-info";

/* GET: Manager check -> check the range and filters -> load -> send the CSV. */
export async function GET(request: Request) {
  const access = await managerForExport();
  if ("denied" in access) return access.denied;

  const params = paramsFromUrl(new URL(request.url).searchParams);
  const period = readReportPeriod(params, await jamaicaToday());
  if ("error" in period) return textResponse(period.error, 400);
  const filters = await readReportFilters(params);

  const report = await loadItemReport(period.start, period.end, filters);
  if (!report.ok) return textResponse(report.error, 500);

  const info = makeReportInfo({
    title: "Item volume report",
    start: period.start,
    end: period.end,
    person: access.profile,
    now: await reportNow(),
  });
  const name =
    period.start === period.end
      ? csvFileName("items", period.start)
      : csvFileName("items", period.start, "to", period.end);
  return csvResponse(itemVolumeCsvRows(info, report.state, report.lines, filters), name);
}
