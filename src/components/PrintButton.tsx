/*
 * src/components/PrintButton.tsx
 *
 * WHAT: The "Print / Save as PDF" button on the print page (Step 37, FR-06
 *       SR-6.9). It opens the browser's own print window. There, choosing
 *       "Save as PDF" (or "Microsoft Print to PDF") as the printer makes a
 *       PDF file, so we need no PDF library.
 *
 * LAYER: Presentation.
 *
 * "use client" = it runs in the browser: window.print() only exists there.
 * print:hidden = the button itself never appears on the paper.
 */
"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
