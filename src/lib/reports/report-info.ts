/*
 * src/lib/reports/report-info.ts
 *
 * WHAT: The "report header" shared by every printed and exported report
 *       (Step 37, FR-06 SR-6.9): business name, report name, the business day
 *       (or range), WHEN it was generated and WHO generated it, plus the
 *       FINAL / DRAFT label.
 *         makeReportInfo(...)    -> the header facts;
 *         reportState(...)       -> FINAL or DRAFT (+ the sentence to show);
 *         formatReportDay(day)   -> "Tue 24 Nov 2026";
 *         formatReportTime(ms)   -> "Tue 24 Nov 2026, 7:42 p.m." (Jamaica);
 *         CLOSEOUT_STATUS_TEXT / CLOSEOUT_EVENT_TEXT -> words for the
 *                                   closeout status and history.
 *
 * LAYER: Application layer (helpers). Used by the print page (Presentation)
 *        AND the CSV routes, so paper and file always say the same thing.
 *        No database and no imports, so it's easy to test.
 */

/* Everything the top of a report shows. */
export type ReportInfo = {
  business: string; // "The Spot"
  title: string; // "Daily Closeout report"
  period: string; // "Tue 24 Nov 2026" or "Mon 18 Nov 2026 to Tue 24 Nov 2026"
  generatedAt: string; // "Tue 24 Nov 2026, 7:42 p.m." (Jamaica time)
  generatedBy: string; // the Manager's name
};

/* FINAL = the day(s) are approved and locked; DRAFT = figures can change. */
export type ReportState = { final: boolean; label: string };

/* "2026-11-24" -> "Tue 24 Nov 2026" (a plain date: no time-zone shift). */
export function formatReportDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}

/* One day -> "Tue 24 Nov 2026"; a range -> "Mon 18 Nov 2026 to Tue 24 Nov 2026". */
export function periodText(start: string, end: string): string {
  return start === end ? formatReportDay(start) : `${formatReportDay(start)} to ${formatReportDay(end)}`;
}

const jamaicaDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Jamaica",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const jamaicaTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Jamaica",
  hour: "numeric",
  minute: "2-digit",
});

/*
 * formatReportTime(ms) -> "Tue 24 Nov 2026, 7:42 p.m.", ALWAYS Jamaica time
 * (the server runs on UTC, so we name the time zone). With the YEAR, because
 * a printed report may be read months later.
 */
export function formatReportTime(time: number): string {
  const clock = jamaicaTime.format(time).replace("AM", "a.m.").replace("PM", "p.m.");
  return `${jamaicaDate.format(time)}, ${clock}`;
}

/*
 * makeReportInfo(...) -> the header. "now" is passed in (not read here) so
 * the caller decides the time, once, after the login check.
 * generatedBy: the full name, or the email if no name was given at sign-up.
 */
export function makeReportInfo(options: {
  title: string;
  start: string;
  end: string;
  person: { full_name: string | null; email: string };
  now: number;
}): ReportInfo {
  return {
    business: "The Spot",
    title: options.title,
    period: periodText(options.start, options.end),
    generatedAt: formatReportTime(options.now),
    generatedBy: options.person.full_name?.trim() || options.person.email || "Manager",
  };
}

/*
 * reportState(closedDays, totalDays) -> FINAL or DRAFT (decision, Step 37):
 * a report may always be printed, but if ANY of its days is not approved and
 * locked yet, it's clearly labelled DRAFT, because those figures can still
 * change (late payments, a recount, a reopen).
 */
export function reportState(closedDays: number, totalDays: number): ReportState {
  if (totalDays > 0 && closedDays >= totalDays) {
    return {
      final: true,
      label: totalDays === 1 ? "FINAL: this day is approved and locked." : `FINAL: all ${totalDays} days are approved and locked.`,
    };
  }
  return {
    final: false,
    label:
      totalDays === 1
        ? "DRAFT: this day is not approved yet, so the figures may still change."
        : `DRAFT: ${totalDays - closedDays} of ${totalDays} days are not approved yet, so the figures may still change.`,
  };
}

/* The closeout status in words (same words as the closeout box, Step 36). */
export const CLOSEOUT_STATUS_TEXT = {
  NONE: "Not started (no cash count yet)",
  SUBMITTED: "Count submitted: waiting for the Manager to approve",
  APPROVED: "Closed and locked",
  REOPENED: "Reopened: count again to close",
} as const;

/* One history line's action in words. */
export const CLOSEOUT_EVENT_TEXT = {
  SUBMITTED: "Cash counted",
  APPROVED: "Approved and locked",
  REOPENED: "Reopened",
} as const;

/* -50 -> "J$50 short", 120 -> "J$120 over", 0 -> "exact" (amount given as text). */
export function differenceWords(difference: number, amountText: string): string {
  if (difference === 0) return "exact";
  return `${amountText} ${difference < 0 ? "short" : "over"}`;
}
