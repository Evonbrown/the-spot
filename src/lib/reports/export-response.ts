/*
 * src/lib/reports/export-response.ts   (SERVER ONLY)
 *
 * WHAT: Shared pieces for the three CSV download routes (Step 37, FR-06
 *       SR-6.9 / SR-6.10):
 *         managerForExport()  -> the Manager's profile, or a "not allowed"
 *                                answer (no file);
 *         csvResponse(...)    -> sends the CSV as a DOWNLOAD;
 *         textResponse(...)   -> a short plain-text message (bad date etc.).
 *
 * LAYER: Application layer.
 *
 * WHY A CHECK HERE TOO? A route handler is its own address: anyone can type
 * /manager/export/items into the browser. The proxy only stops LOGGED-OUT
 * visitors; the ROLE check is here (SR-6.10: Manager only). The database
 * checks the role AGAIN when the figures are loaded (defence in depth).
 */

import "server-only";
import { getCurrentProfile, type Profile } from "@/lib/auth/get-profile";
import { toCsv, type CsvValue } from "@/lib/reports/csv";

/* A short message as plain text. "no-store" = never kept in any cache. */
export function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/*
 * managerForExport() -> { profile } for the Manager; otherwise a Response:
 *   401 = not logged in, 403 = logged in but not the Manager.
 */
export async function managerForExport(): Promise<{ profile: Profile } | { denied: Response }> {
  const profile = await getCurrentProfile();
  if (!profile) return { denied: textResponse("Please log in as the Manager to download reports.", 401) };
  if (profile.role !== "manager") {
    return { denied: textResponse("Only the Manager can download reports.", 403) };
  }
  return { profile };
}

/*
 * csvResponse(rows, fileName): the CSV as a file download.
 *   Content-Type text/csv            -> "this is a CSV table";
 *   Content-Disposition: attachment  -> the browser SAVES it (with this
 *                                       name) instead of showing it;
 *   Cache-Control: no-store          -> sales figures are never cached.
 */
export function csvResponse(rows: CsvValue[][], fileName: string): Response {
  return new Response(toCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
