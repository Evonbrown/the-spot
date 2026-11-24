/*
 * src/lib/reports/csv.ts
 *
 * WHAT: Small tools to build a CSV file safely (Step 37, FR-06 SR-6.9).
 *       CSV = "comma-separated values": a plain text table that Excel,
 *       Google Sheets and Numbers can open. Each line is a row; commas
 *       separate the cells.
 *         csvCell(value)   -> one cell, written safely;
 *         money(amount)    -> marks a J$ amount (written as 1200.00);
 *         toCsv(rows)      -> the whole file as text;
 *         csvFileName(...) -> e.g. "the-spot-closeout-2026-11-24.csv".
 *
 * LAYER: Application layer (helpers). No database, no imports: the export
 *        routes (src/app/manager/export/...) use it.
 *
 * WHY SO CAREFUL?
 *   1. A cell with a comma, a quote mark or a new line would break the table
 *      ("Fry Chicken, Large" would become two cells). So such a cell is put
 *      inside "double quotes", and a quote inside it is written twice ("").
 *   2. "CSV injection": Excel treats a cell that starts with = + - or @ as a
 *      FORMULA. A menu name or a note like =HYPERLINK(...) could then run
 *      when the Manager opens the file. So TEXT cells that start with one of
 *      those get a ' in front, which makes Excel show them as plain text.
 *      Real numbers (like a cash difference of -50.00) are NOT changed.
 */

/* An amount of money (J$), so it's always written with 2 decimals. */
export type Money = { amount: number };

/* What a cell can hold. null = an empty cell. */
export type CsvValue = string | number | Money | null | undefined;

/* money(1200) -> a cell written as 1200.00 (a plain number, no "J$"). */
export function money(amount: number): Money {
  return { amount };
}

/* Characters that make Excel start a formula (plus tab / carriage return). */
const FORMULA_START = /^[=+\-@\t\r]/;

/*
 * csvCell(value) -> the cell as CSV text.
 *   - numbers and money: written as they are (money with 2 decimals);
 *   - text: ' in front if it could start a formula; quoted if needed.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "object") {
    // Rounded to whole cents first, so 0.1 + 0.2 never shows as 0.30000000004.
    return (Math.round(value.amount * 100) / 100).toFixed(2);
  }

  let text = value;
  if (FORMULA_START.test(text)) text = `'${text}`;
  // Quote the cell if it holds a comma, a quote, a new line or edge spaces.
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/*
 * toCsv(rows) -> the whole file.
 *   - "﻿" at the very start (a "BOM", byte order mark): an invisible
 *     marker that tells Excel the file is UTF-8, so letters like "é" or the
 *     "–" dash show correctly instead of strange symbols.
 *   - "\r\n" line endings: the standard for CSV (RFC 4180), fine everywhere.
 *   - An empty row [] = a blank line (used to separate sections).
 */
export function toCsv(rows: CsvValue[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/*
 * csvFileName("closeout", "2026-11-24") -> "the-spot-closeout-2026-11-24.csv".
 * Only a-z, 0-9 and "-" are kept, so the name is safe on every computer.
 */
export function csvFileName(...parts: string[]): string {
  const clean = ["the-spot", ...parts]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${clean}.csv`;
}
