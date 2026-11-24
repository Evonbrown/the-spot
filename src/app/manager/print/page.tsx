/*
 * src/app/manager/print/page.tsx
 *   ->   /manager/print?report=closeout&date=2026-11-24
 *   ->   /manager/print?report=range&from=2026-11-18&to=2026-11-24
 *   ->   /manager/print?report=items&from=...&to=...&category=...&type=...&sort=...
 *
 * WHAT: A clean, PRINT-FRIENDLY page for one report (Step 37, FR-06 SR-6.9):
 *         - closeout: the Daily Closeout report for one business day (the
 *           day's figures, payment breakdown, cash expected / counted /
 *           difference, closeout status, notes and history);
 *         - range:    the daily totals of a date range + the combined summary;
 *         - items:    the item volume report with the chosen filters.
 *       Every report starts with the same header: The Spot, report name,
 *       the day / range, generated at (Jamaica time) and by whom, and a
 *       FINAL or DRAFT label (decision: a day that isn't approved and locked
 *       yet may still be printed, but clearly marked DRAFT).
 *       "Print / Save as PDF" opens the browser's print window; choosing
 *       "Save as PDF" there makes the PDF (no PDF library needed).
 *
 * LAYER: Presentation. requireRole (Application layer) checks the role; the
 *        figures come from load-report.ts (the SAME loader the CSV files
 *        use), worked out by the database, which checks the role AGAIN.
 *
 * WHO (SR-6.10): manager ONLY.
 *
 * PRINTING: "print:hidden" (Tailwind) hides things on paper (the site
 * header, the buttons); globals.css makes the paper white with no shadows.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import DailyTotals from "@/components/DailyTotals";
import { ItemTable } from "@/components/ItemVolumeReport";
import PrintButton from "@/components/PrintButton";
import SalesSummary from "@/components/SalesSummary";
import { requireRole } from "@/lib/auth/require-role";
import { formatPrice } from "@/lib/menu-helpers";
import { STATUS_LABELS } from "@/lib/order-status";
import type { CloseoutDetails } from "@/lib/reports/get-closeout";
import { jamaicaToday } from "@/lib/reports/get-sales-summary";
import {
  loadCloseoutReport,
  loadItemReport,
  loadRangeReport,
  readReportFilters,
  readReportPeriod,
  reportNow,
} from "@/lib/reports/load-report";
import { itemFilterText } from "@/lib/reports/report-csv";
import {
  CLOSEOUT_EVENT_TEXT,
  CLOSEOUT_STATUS_TEXT,
  differenceWords,
  formatReportTime,
  makeReportInfo,
  type ReportInfo,
  type ReportState,
} from "@/lib/reports/report-info";

export const metadata: Metadata = {
  title: "Print report",
};

type Params = Record<string, string | string[] | undefined>;

/* The three reports this page can print, and their names. */
const REPORTS = {
  closeout: "Daily Closeout report",
  range: "Daily totals",
  items: "Item volume report",
} as const;
type ReportKind = keyof typeof REPORTS;

/*
 * The address and the login are only known per visit, so everything sits
 * inside <Suspense> (Cache Components), and nothing is sent before the role
 * check passes.
 */
export default function PrintPage({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-12 print:max-w-none print:px-0 print:pb-0">
      <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />}>
        <PrintScreen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/* "?a=1&a=2" -> "1". */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/*
 * backLink(params): back to /manager with the SAME dates and filters
 * (everything except "report").
 */
function backLink(params: Params): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = first(value);
    if (key !== "report" && v) query.set(key, v);
  }
  const text = query.toString();
  return text ? `/manager?${text}` : "/manager";
}

/*
 * PrintScreen (server, per visit):
 * 1. Guard: Manager only.
 * 2. Which report? Which day / range (same checks as /manager)?
 * 3. Load it, then draw the header + the report.
 */
async function PrintScreen({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const profile = await requireRole(["manager"], { returnTo: "/manager" });

  const kindText = first(params.report);
  const kind: ReportKind = kindText === "range" || kindText === "items" ? kindText : "closeout";
  const period = readReportPeriod(params, await jamaicaToday());

  // The bar at the top (never printed).
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3 pt-6 print:hidden">
      <Link href={backLink(params)} className="inline-flex min-h-11 items-center font-semibold text-brand underline">
        ← Back to reports
      </Link>
      <PrintButton />
      <p className="w-full text-sm text-stone-600">
        To make a PDF, choose <span className="font-semibold">Save as PDF</span> as the printer in the print window.
      </p>
    </div>
  );

  // Problems: show the message (nothing to print).
  const problem = (message: string) => (
    <>
      {toolbar}
      <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
        {message}
      </p>
    </>
  );
  if ("error" in period) return problem(period.error);
  if (kind === "closeout" && period.start !== period.end) {
    return problem("The closeout report is for ONE day. Choose a single day.");
  }

  // The header facts ("Generated at" = now, the real visit's time).
  const info = makeReportInfo({
    title: REPORTS[kind],
    start: period.start,
    end: period.end,
    person: profile,
    now: await reportNow(),
  });

  // ---- Load and draw the chosen report ----
  let body: ReactNode;
  let state: ReportState;

  if (kind === "closeout") {
    const report = await loadCloseoutReport(period.start);
    if (!report.ok) return problem(report.error);
    state = report.state;
    body = (
      <>
        <SalesSummary summary={report.summary} />
        <CloseoutSection details={report.details} />
      </>
    );
  } else if (kind === "range") {
    const report = await loadRangeReport(period.start, period.end);
    if (!report.ok) return problem(report.error);
    state = report.state;
    body = (
      <>
        <DailyTotals range={report.range} closedDays={report.closedDays} />
        <h2 className="text-xl font-bold">Whole range</h2>
        <SalesSummary summary={report.range.total} />
      </>
    );
  } else {
    const filters = await readReportFilters(params);
    const report = await loadItemReport(period.start, period.end, filters);
    if (!report.ok) return problem(report.error);
    state = report.state;
    const words = itemFilterText(filters);
    body = (
      <section aria-labelledby="items-title" className="rounded-xl bg-white p-5 shadow-sm">
        <h2 id="items-title" className="text-lg font-bold">
          Item volume
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          {words.category} · {words.type} · sorted by {words.sort.toLowerCase()}. Paid orders only; revenue includes
          extras, not delivery fees.
        </p>
        {report.lines.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No items sold for this choice.</p>
        ) : (
          <ItemTable lines={report.lines} showCheck={false} itemsShouldTotal={null} />
        )}
      </section>
    );
  }

  return (
    <>
      {toolbar}
      <ReportHeader info={info} state={state} />
      <div className="mt-4 flex flex-col gap-4">{body}</div>
      <p className="mt-6 border-t border-stone-300 pt-2 text-xs text-stone-500">
        {info.business} · {info.title} · {info.period} · generated {info.generatedAt} by {info.generatedBy}
      </p>
    </>
  );
}

/*
 * ReportHeader: the top of the paper (SR-6.9): business name, report name,
 * day / range, generated at / by, and the FINAL / DRAFT label (DRAFT in a
 * strong amber box, so nobody mistakes it for the final figures).
 */
function ReportHeader({ info, state }: { info: ReportInfo; state: ReportState }) {
  return (
    <header className="mt-4 border-b-2 border-stone-800 pb-3">
      <p className="text-3xl font-extrabold">{info.business}</p>
      <h1 className="text-xl font-bold">{info.title}</h1>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">{info.period.includes(" to ") ? "Period" : "Business day"}</dt>
        <dd>{info.period} (midnight to midnight, Jamaica time)</dd>
        <dt className="font-semibold">Generated</dt>
        <dd>{info.generatedAt}</dd>
        <dt className="font-semibold">Generated by</dt>
        <dd>{info.generatedBy}</dd>
      </dl>
      <p
        className={`mt-3 rounded-lg border-2 p-2 text-sm font-bold ${
          state.final ? "border-green-700 text-green-900" : "border-amber-600 bg-amber-50 text-amber-950"
        }`}
      >
        {state.label}
      </p>
    </header>
  );
}

/*
 * CloseoutSection: the cash part of the Daily Closeout report (SR-6.7 /
 * SR-6.8): status, expected / counted / difference, the explanation, who
 * counted and approved (and when), the override reason, open orders and
 * the history. A plain drawing: no buttons on paper.
 */
function CloseoutSection({ details }: { details: CloseoutDetails }) {
  const c = details.closeout;
  const row = (label: string, value: ReactNode) => (
    <>
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </>
  );

  return (
    <section aria-labelledby="cash-title" className="rounded-xl bg-white p-5 shadow-sm">
      <h2 id="cash-title" className="text-lg font-bold">
        Cash closeout
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {row("Status", c ? CLOSEOUT_STATUS_TEXT[c.status] : CLOSEOUT_STATUS_TEXT.NONE)}
        {c ? (
          <>
            {/* The figures SAVED with the count (the ones the Manager approves). */}
            {row("Expected cash", formatPrice(c.expectedCash))}
            {row("Counted cash", formatPrice(c.countedCash))}
            {row("Difference", differenceWords(c.cashDifference, formatPrice(Math.abs(c.cashDifference))))}
            {row("Explanation", c.differenceNote || "–")}
            {row("Counted by", `${c.submittedBy ?? "staff"}, ${formatReportTime(c.submittedAt)}`)}
            {row("Approved by", c.approvedBy ? `${c.approvedBy}${c.approvedAt ? `, ${formatReportTime(c.approvedAt)}` : ""}` : "–")}
            {c.overrideReason && row("Closed with open orders", `"${c.overrideReason}"`)}
          </>
        ) : (
          <>
            {row("Expected cash now", formatPrice(details.expectedCash))}
            {row("Counted cash", "not counted yet")}
          </>
        )}
        {row(
          "Open orders",
          details.openOrders.length === 0
            ? "None"
            : details.openOrders.map((o) => `#${o.id} (${STATUS_LABELS[o.status]})`).join(", ")
        )}
      </dl>

      <h3 className="mt-4 text-sm font-bold">History</h3>
      {details.events.length === 0 ? (
        <p className="mt-1 text-sm text-stone-600">Nothing yet.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1 text-sm text-stone-700">
          {details.events.map((event, index) => (
            <li key={index}>
              {formatReportTime(event.createdAt)}: {CLOSEOUT_EVENT_TEXT[event.action]} by {event.actor ?? "staff"}
              {event.reason && ` — "${event.reason}"`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
