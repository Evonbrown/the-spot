/*
 * src/proxy.ts
 *
 * WHAT: Runs on the server BEFORE every page request and keeps the user's login
 *       session fresh. (In older Next.js versions this file was called "middleware".)
 * LAYER: Application layer.
 *
 * WHY: A Supabase login token expires after about an hour. A page (Server
 * Component) is not allowed to write cookies, so it can't save a renewed token
 * by itself. This proxy CAN write cookies, so on every request it asks Supabase
 * "is this token still OK?". If the token has expired, Supabase renews it and we
 * save the new one in the cookies. Without this, users would be logged out at
 * random.
 *
 * It ALSO sends logged-out visitors away from the staff screens (see below).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PATHS } from "@/lib/auth/roles";

export async function proxy(request: NextRequest) {
  // By default, let the request continue to the page unchanged.
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response; // Supabase not configured: do nothing

  const supabase = createServerClient(url, key, {
    cookies: {
      // Read the cookies the browser sent.
      getAll() {
        return request.cookies.getAll();
      },
      // Supabase calls this when it has renewed the token. We put the new cookies:
      //  1. on the REQUEST, so the page we're about to show sees the fresh token, and
      //  2. on the RESPONSE, so the browser saves them for next time.
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        // Supabase also asks us to set "do not cache" headers, so a shared cache
        // can never hand one user's login cookie to another user.
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // This is the call that checks (and if needed, renews) the token.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  /*
   * QUICK FIRST CHECK: a logged-out visitor opening a staff screen (/staff,
   * /driver, /manager, /supervisor) is sent to /login straight away.
   * This is only the FIRST layer. The proxy doesn't check ROLES; requireRole()
   * in each page does the real check, and RLS protects the data itself.
   */
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PATHS.some(
    (p) => path === p || path.startsWith(p + "/")
  );

  if (isProtected && !isLoggedIn) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
    // Keep any cookie changes Supabase just made (e.g. clearing an expired session).
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

/*
 * matcher: which requests the proxy runs on. We skip files that never need a
 * login (Next.js's own JS/CSS files, images, the favicon), which keeps the site fast.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
