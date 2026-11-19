/*
 * src/app/test-connection/page.tsx   ->   http://localhost:3000/test-connection
 *
 * WHAT: A TEMPORARY page that checks our app can reach our Supabase project.
 *       We will delete it once later features prove the connection works.
 *
 * LAYER: Presentation layer (a screen). It uses the server helper from
 *        src/lib/supabase/server.ts, so the check runs on the server, not in the browser.
 *
 * HOW THE CHECK WORKS: We have not created any tables yet, so we ask Supabase for a
 * table that does not exist ("connection_test"). The answer tells us what we need:
 *   - "table not found"     -> Supabase answered AND accepted our key  = CONNECTED
 *   - "Invalid API key"     -> the key in .env.local is wrong
 *   - network/fetch error   -> the URL in .env.local is wrong (or you are offline)
 */

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

/*
 * Page
 * The outer part (title) is shown straight away. The live check sits inside
 * <Suspense>, which shows "Checking..." until the server gets an answer from
 * Supabase. Our project has "cacheComponents" switched on (next.config.ts), and
 * with that setting, Next.js requires live, per-request work like this to go
 * inside <Suspense>.
 */
export default function TestConnectionPage() {
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">Supabase connection test</h1>
      <Suspense fallback={<p>Checking connection…</p>}>
        <ConnectionStatus />
      </Suspense>
    </main>
  );
}

/*
 * ConnectionStatus
 * An async Server Component: it runs on the server, talks to Supabase and
 * returns the result as HTML. Your keys never need to be used in the browser here.
 */
async function ConnectionStatus() {
  let message: string;
  let ok = false;

  try {
    const supabase = await createClient();

    // Ask for one row from a table we know does not exist (see top comment).
    const { error } = await supabase.from("connection_test").select("*").limit(1);

    // PGRST205 = "table not found" (from Supabase's API). 42P01 = the same idea from Postgres.
    // Either one means Supabase understood us and accepted our key.
    if (!error || error.code === "PGRST205" || error.code === "42P01") {
      ok = true;
      message = "Connected ✅ Supabase answered and accepted your key.";
    } else {
      message = `Supabase answered with an error: ${error.message}`;
    }
  } catch (err) {
    // Thrown when .env.local is empty or the URL cannot be reached.
    message = err instanceof Error ? err.message : String(err);
  }

  return (
    <p className={ok ? "text-green-700" : "text-red-700"}>
      {ok ? message : `Not connected ❌ ${message}`}
    </p>
  );
}
