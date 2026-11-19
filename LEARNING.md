# LEARNING.md — The Spot study notes

One section per part we build. Read these before presentations.

---

## Part 1: Connecting Next.js to Supabase (Build step 1)

**Why:** every feature needs the Data layer. Login uses Supabase Auth, the menu (FR-01) reads tables, and live tracking (FR-05 / PR-2) uses Supabase Realtime.

### Files
| File | Layer | What it does |
|---|---|---|
| `.env.local` | config | Stores the Supabase Project URL and publishable key. Ignored by git, so it never reaches GitHub. |
| `src/lib/supabase/client.ts` | Presentation ↔ Data bridge | `createClient()` for **browser** code ("use client" components). |
| `src/lib/supabase/server.ts` | Application layer | `createClient()` for **server** code (Server Components, Server Actions, Route Handlers). Reads the login session from cookies. |
| `src/app/test-connection/page.tsx` | Presentation (temporary) | Shows whether the app can reach Supabase. |
| `package.json` | n/a | Added `@supabase/supabase-js` (talks to Supabase) and `@supabase/ssr` (makes it work with Next.js cookies). |

### Key concepts
- **Environment variables:** settings kept outside the code, in `.env.local`. Names starting with `NEXT_PUBLIC_` are copied into the browser code. Anything without that prefix stays on the server only. You must restart `npm run dev` after editing the file.
- **Publishable (anon) key vs secret (service_role) key:** the publishable key is safe to show in the browser, because it can only do what Row Level Security (RLS) allows. The secret key **skips RLS**, so it must never be in browser code. We don't use it.
- **Why two helpers (browser and server)?** They run in different places. The browser can read cookies directly. The server has to read them from the incoming request with `cookies()`. CLAUDE.md says business rules must be checked on the server, so the server helper is the one our rule-checking code will use.
- **Cookies and sessions:** after login, Supabase stores a session token in a cookie. The browser sends it with every request, which is how the server knows who the user is and what role they have.
- **`<Suspense>`:** shows a fallback ("Checking…") while slow server work finishes. Our project has `cacheComponents` turned on, and that setting requires per-request work (like reading cookies) to go inside `<Suspense>`.

### Possible lecturer questions
- *Why not put the keys straight in the code?* Keys would end up on GitHub, and changing them would mean changing code.
- *Is it unsafe that the publishable key is in the browser?* No. Security comes from RLS policies and server checks, not from hiding that key.
