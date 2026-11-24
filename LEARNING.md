# LEARNING.md — The Spot study notes

One section per part we build. Read these before presentations.

---

## ⚠️ Before deploying to Vercel (checklist)
- [ ] **Turn email confirmation back ON:** Supabase dashboard → Authentication → Sign In / Providers → Email → "Confirm email". We switched it OFF during development (Part 2) so testing is faster. Supabase's free email service only sends a few emails per hour.
- [ ] Delete the temporary `/test-connection` page (Part 1).
- [ ] **Run every migration and seed in Supabase BEFORE the first build/deploy** (in the order listed in README.md). The build pre-builds pages using the database and stops if a table is missing (found in Part 18).
- [ ] **Decide on student ID login** before Build step 8. The SRS says users log in with "email or student ID", but we built **email only** (Part 4). Decide whether to add student ID login, and how non-students would log in.

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

---

## Part 2: The `profiles` table and roles (Build step 1)

**Why:** Supabase Auth stores only email and password, which are hashed (scrambled one-way, so the real password is never stored). Our app also needs each user's **role** to control access (SRS 3 Security: role-based access with RLS and server checks), plus a **phone** number (FR-04: the driver sees the customer's phone; FR-05: SMS alerts).

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0001_profiles.sql` | Data | Creates the `user_role` enum, the `profiles` table, the permissions and RLS rules, and the sign-up trigger. You run it in the Supabase SQL Editor. |

### The `profiles` table
| Column | Meaning |
|---|---|
| `id` | Same id as the login in `auth.users`. If the login is deleted, the profile is deleted too. |
| `full_name`, `phone` | Copied from the sign-up form. |
| `role` | One of `customer`, `counter_staff`, `delivery_personnel`, `manager`, `supervisor`. Default `customer`. |
| `created_at` | When the profile was made. |

### Key concepts
- **Enum:** a fixed list of allowed values. The database rejects anything else, e.g. a typo like `'manger'`.
- **One table for all roles:** the class diagram has subclasses (User → Customer, Supervisor, Staff → CounterStaff, …). They all share the same login data, so we use one table with a `role` column instead of one table per class.
- **Row Level Security (RLS):** rules inside the database that decide **which rows** a user can see or change. Once RLS is ON, everything is blocked until a policy allows it. Our policies let users read and update **only their own row** (`auth.uid() = id`).
- **Grants (column permissions):** decide **which columns** a user may touch. Users may update only `full_name` and `phone`, never `role`. Even someone sending a hand-made request with our public key cannot make themselves a manager.
- **Trigger:** code the database runs automatically. When someone signs up (a new row in `auth.users`), `handle_new_user()` creates their profile and **always** sets the role to `customer`. It never reads a role from the form.
- **`security definer`:** the trigger function runs with its owner's permissions, because the new user isn't allowed to insert into `profiles` themselves.
- **How staff get their roles (for now):** sign them up normally, then change `role` in the Supabase Table Editor. The dashboard uses an admin connection that skips RLS.

### Possible lecturer questions
- *What stops a customer from making themselves a manager?* Two things. The trigger ignores any role sent at sign-up, and the grants don't allow anyone to update the `role` column.
- *Can a customer see another customer's phone number?* No. The RLS select policy only returns the row where `id` equals the logged-in user's id.

---

## Part 3: Design preview — Home and Menu pages (sample data)

**Why:** to agree on the look before building more screens. It's also a head start on **FR-01**: menu with prices, descriptions, daily specials and allergens; unavailable items greyed out. It covers **SAF-2** too: allergens are shown on every item. The items are **made-up samples**. In Build step 2 they come from the Supabase `menu_items` table.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/sample-menu.ts` | stand-in for Data (temporary) | The `MenuItem` type, 8 sample items, opening hours, delivery locations, and `formatPrice()` (1200 → "J$1,200"). |
| `src/components/SiteHeader.tsx` | Presentation | Orange top bar with "The Spot" and the Home/Menu links. Sticks to the top while scrolling. |
| `src/components/MenuItemCard.tsx` | Presentation | One item card: badges, name, description, allergens, price, and the Add button (disabled and greyed out when unavailable). |
| `src/app/page.tsx` | Presentation | Home (`/`): welcome, "View menu" button, hours, pickup/delivery locations, today's specials. |
| `src/app/menu/page.tsx` | Presentation | Menu (`/menu`): category buttons that jump to Meals / Sides / Drinks sections. |
| `src/app/layout.tsx` | Presentation | The frame around every page: tab title "The Spot" and the header. |
| `src/app/globals.css` | Presentation | Brand colours (`brand` orange, `brand-dark`, `cream`, `ink`), defined once. |

### Key concepts
- **Component:** a reusable piece of a page, written as a function that returns HTML-like code (JSX). `MenuItemCard` is used on both the Home and Menu pages, so cards always look the same.
- **Props:** information passed into a component, like arguments to a function: `<MenuItemCard item={...} />`.
- **File-based routing:** in Next.js the folder decides the web address: `app/menu/page.tsx` → `/menu`. `layout.tsx` wraps every page.
- **Mobile-first design:** write the phone layout first (one column). Then add bigger-screen changes with prefixes: `sm:` (640px and wider) and `lg:` (1024px and wider), e.g. `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Buttons are at least 44px tall (`min-h-11`) so they are easy to tap.
- **Tailwind theme colours:** `--color-brand` in `globals.css` creates `bg-brand`, `text-brand`, etc. Changing one line recolours the whole site.
- **TypeScript type:** `MenuItem` lists the fields every item must have. If one is missing or the wrong kind, the editor shows an error before the app even runs.

### Possible lecturer questions
- *Where is "unavailable items cannot be added" enforced?* For now only on screen: the Add button is `disabled`. When we build the cart and checkout, the **server** will also reject unavailable items, because CLAUDE.md says rules must never live only in the browser.
- *Why no stock count?* The client said food never runs out, so we use `isAvailable` instead of inventory tracking.

---

## Part 4: Sign up, log in and log out (Build step 1)

**Why:** SRS 3 Security says login is required, and passwords are handled by Supabase Auth, which stores them hashed. Every later feature needs to know **who** the user is and **what role** they have.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/auth/actions.ts` | Application | Server Actions `signUp`, `logIn` and `logOut`. They check the input on the server, then call Supabase Auth. |
| `src/lib/auth/get-profile.ts` | Application | `getCurrentProfile()`: returns the logged-in user's profile (name, phone, role), or `null`. Also the `UserRole` type. |
| `src/proxy.ts` | Application | Runs before every page request and renews the login token when it expires (about every hour). |
| `src/components/SignUpForm.tsx` | Presentation | Sign-up form (Client Component) |
| `src/components/LoginForm.tsx` | Presentation | Log-in form for every role (Client Component) |
| `src/app/signup/page.tsx`, `src/app/login/page.tsx` | Presentation | The `/signup` and `/login` pages |
| `src/components/SiteHeader.tsx` | Presentation | Shows "Log in", or your name, role and "Log out". Tapping "The Spot" goes home. |

### Rules enforced (on the server, in `actions.ts`)
- Full name required. **Phone required** (7–15 digits; spaces, dashes and a leading + allowed). Valid email.
- **Password at least 8 characters.** Also set in the Supabase dashboard, so the rule is checked in two places.
- Sign-up **never sends a role**. The Part 2 trigger always creates a `customer`.
- A failed login always says **"Email or password is incorrect."** It never says which one, so attackers can't find out which emails have accounts.
- Login is **email only** for now. Student ID login is still to decide (see the checklist at the top).

### Key concepts
- **Server Action:** a function that a form calls, but which runs **on the server** (`"use server"`). The browser can't skip its checks, which is why business rules live here.
- **Server vs Client Components:** most components run on the server and send finished HTML. A component marked `"use client"` runs in the browser and can react to the user. We need that for showing errors and disabling the button while waiting.
- **`useActionState`:** a React hook that connects a form to a Server Action. It gives back `state` (the latest result, e.g. an error), `formAction` (pass it to `<form action>`) and `pending` (true while waiting).
- **Session and cookies:** after login, Supabase puts a signed token in a cookie. `getClaims()` checks the token's **signature**, so a faked cookie is rejected.
- **Proxy (formerly "middleware"):** code that runs before every request. Pages aren't allowed to write cookies, but the proxy is, so it's the place to save a renewed token.
- **Two layers of checks:** browser checks (`required`, `type="email"`, `minLength`) are only for convenience. The server checks everything again, because anyone can skip the browser.

### Possible lecturer questions
- *Where are passwords stored?* Not in our tables at all. Supabase Auth stores them hashed. We never see or store the real password.
- *What happens when a login token expires?* `proxy.ts` asks Supabase to renew it on the next request and saves the new cookie, so the user stays logged in.
- *Why does a wrong password give the same message as an unknown email?* So nobody can use the login form to find out which emails are registered.

### Fix: the "Blocking Route" / `Date.now()` error
- **What happened:** Next.js tries to **prepare pages in advance** (prerendering) so they open instantly. When you were logged in, Supabase checked whether your login token had expired by comparing it with the current time (`Date.now()`). A time worked out in advance would be wrong later, so Next.js stopped and reported it.
- **Fix chosen:** `await connection()` at the start of `getCurrentProfile()` (`src/lib/auth/get-profile.ts`). It tells Next.js to wait for the real request before running the login check.
- **Why this fix:** login and role information must be **fresh on every request**. If it were cached, someone whose role was removed, or who just logged out, might still be shown as logged in or keep their old role. The next part uses this same helper to protect pages, so it must never be stale.
- **Trade-off:** the account area in the header can't be prepared in advance, so it appears a split second after the rest of the header. That's fine.
- **Other fixes Next.js offered (not chosen):** `"use cache: private"` saves the result for a while, which risks a stale role. Moving the check into the browser (`"use client"`) breaks our "rules on the server" principle.

---

## Part 5: A screen for each role, and blocking pages (Build step 1)

**Why:** SRS 3 Security requires role-based access, enforced by **server checks and RLS**. Without this, anyone could type `/manager` into the address bar.

### Where each role goes after logging in
| Role | Screen | Built in |
|---|---|---|
| customer | `/` (Home), `/menu` | steps 2, 3, 5 |
| counter_staff | `/staff` | step 4 |
| delivery_personnel | `/driver` | step 6 |
| manager | `/manager` | step 7 |
| supervisor | `/supervisor` | step 7 |

**Strict rule (our decision):** each role can open **only its own screen**. A Manager can't open `/staff` either. We can widen this later.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/auth/roles.ts` | Application | One place for the role names, labels, each role's home screen (`ROLE_HOME`) and the protected paths. |
| `src/lib/auth/require-role.ts` | Application | `requireRole([...])`, the page guard. Not logged in → `/login`. Wrong role → `/no-access`. |
| `src/proxy.ts` | Application | Also sends **logged-out** visitors away from `/staff`, `/driver`, `/manager` and `/supervisor`. |
| `src/lib/auth/actions.ts` | Application | `logIn` now reads your role from the database and sends you to your screen. |
| `src/app/staff`, `driver`, `manager`, `supervisor` (`page.tsx`) | Presentation | Placeholder screens. Each one calls `requireRole` itself. |
| `src/components/ScreenPlaceholder.tsx` | Presentation | The shared "coming soon" box for those screens (temporary). |
| `src/app/no-access/page.tsx` | Presentation | "You don't have access to this page", with a button to your own screen. |
| `src/components/RedirectIfLoggedIn.tsx` | Presentation | On `/login` and `/signup`: if you're already logged in, it sends you to your screen. |
| `src/components/SiteHeader.tsx` | Presentation | Staff see a link to their own screen (Queue / Deliveries / Reports / Payments) instead of "Menu". |

### Key concepts
- **Authentication vs authorization:** authentication asks *who are you?* (logging in). Authorization asks *are you allowed here?* (your role). `requireRole` does both: no login → `/login`, wrong role → `/no-access`.
- **Defence in depth (several layers of protection):**
  1. `proxy.ts`: a quick check that sends logged-out visitors to `/login`. It doesn't look at roles.
  2. `requireRole()` in **every** protected page: the real role check, on the server.
  3. **RLS** in the database: even if a page check were missed, the database won't hand over rows you aren't allowed to see.
  - The header link is only a shortcut, **not** security. Hiding a link doesn't stop someone typing the address.
- **Why the check is in each page, not in a layout:** in this Next.js version, a layout doesn't re-run when you move between pages, so a check there could be skipped. The Next.js docs say to check close to the page or data. Later, each **Server Action** will call `requireRole` too, because an action can be called without the page.
- **Nothing leaks before the check:** each protected page puts **all** its content inside the guarded component (inside `<Suspense>`). Nothing from the screen is sent until the role check has passed.

### Possible lecturer questions
- *What stops a customer from opening the Manager screen?* `requireRole(["manager"])` runs on the server and sends them to `/no-access`. Typing the address doesn't help.
- *Why do you need the proxy if pages already check?* It's faster for logged-out visitors, and it's an extra layer. Security never depends on one check alone.
- *Where does the app get the role from?* The `profiles` table, read on the server for the logged-in user. Never from anything the browser sends.

---

## ✅ Build step 1 complete: recap
Step 1 was "Project setup, Supabase connection, auth (sign up / log in) and roles". It took 5 parts:
1. **Supabase connection:** browser and server helpers, and the keys in `.env.local`.
2. **`profiles` table:** the 5 roles as an enum. RLS means users see and edit only their own row, and can never change their role. A trigger makes every new sign-up a customer.
3. **Design preview:** Home and Menu with sample items (Build step 2 swaps in the real database).
4. **Sign up, log in, log out:** Server Actions with server-side checks, a proxy that keeps sessions fresh, and the `connection()` fix for the Blocking Route error.
5. **Role screens and blocking:** each role is sent to its own screen. Protection comes in three layers: proxy, then `requireRole` on every page, then RLS.

**How one request flows through our three layers** (example: a manager opens `/manager`):
- `proxy.ts` sees a valid login cookie and lets the request through.
- The page calls `requireRole(["manager"])` (Application layer).
- That calls `getCurrentProfile()`, which reads the `profiles` row. RLS allows it because it's the manager's own row (Data layer).
- The role matches, so the screen is shown (Presentation layer).

---

## Part 6: The `menu_items` table (Build step 2)
The menu moves from a code file into a real database table, so the Manager can later change items and prices without code changes (Maintainability, SRS 3). The pages still use the sample file until Part 7.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0002_menu_items.sql` | Data | Creates `current_user_role()`, the `menu_items` table, an `updated_at` trigger, the grants and the RLS rules. You run it in the SQL Editor. |
| `supabase/seed/sample_menu_items.sql` | Data | Adds the 8 sample items (same as `src/lib/sample-menu.ts`). Run it once, after the migration. |

### The `menu_items` table
| Column | Type | Why |
|---|---|---|
| `id` | bigint, auto-numbered | Each item's unique number. |
| `name`, `description` | text | Shown on the menu (FR-01). |
| `price` | numeric(10,2), must be ≥ 0 | Exact money. See "Key concepts". |
| `category` | text | e.g. Meals, Sides, Drinks. Plain text so the Manager can add new ones. |
| `allergens` | text[] (a list) | SAF-2. `{}` = no listed allergens. |
| `is_available` | boolean | FR-01: false = greyed out, can't be added. Used instead of stock tracking. |
| `is_daily_special` | boolean | FR-01: highlighted. |
| `is_made_to_order` | boolean | FR-01: e.g. fries → pickup needs at least 15 min. |
| `sort_order` | integer | Order on the menu page. |
| `created_at`, `updated_at` | timestamptz | When added / last changed (a trigger keeps `updated_at` correct). |

### Who can do what (RLS)
| Action | Visitor (not logged in) | Customer / other staff | Manager |
|---|---|---|---|
| Read the menu | ✅ | ✅ | ✅ |
| Add / edit / delete items | ❌ | ❌ | ✅ |

### Key concepts
- **numeric vs float for money:** a float is an *approximate* number (`0.1 + 0.2` = `0.30000000000000004`). `numeric(10,2)` stores the exact value with 2 decimal places. Money must add up exactly, because the daily closeout (FR-06) compares expected cash with counted cash.
- **CHECK constraint:** a rule the database itself enforces on every row. `check (price >= 0)` means a negative price is refused even if a page has a bug or someone sends a hand-made request.
- **Grants vs RLS (again):** grants decide *which actions* a kind of user may try (anyone may SELECT; logged-in users may *try* to edit). RLS decides *which rows* the action works on (edits only succeed for a manager).
- **`current_user_role()` helper:** one function that answers "what is this user's role?" for every RLS rule. It is `security definer`, meaning it runs with its owner's permissions, so it can read the role safely, and it is reused by later tables (orders, refunds, closeouts).
- **Migration vs seed:** a migration builds the *structure* (tables, rules). Seed data is *starting content*. Keeping them apart lets us swap in The Spot's real menu later without touching the structure.

### Possible lecturer questions
- *Why is the menu readable without logging in?* Our decision: anyone can browse; only ordering needs an account. RLS has a SELECT rule for `anon` (visitors).
- *What stops a customer from changing a price through the API?* The UPDATE policy only passes when `current_user_role()` is `'manager'`. For anyone else the update changes 0 rows.
- *Why `numeric` and not `float`?* Floats round. Money must be exact, especially for cash closeout.
- *Can a manager set a price of -500?* No. The CHECK constraint refuses it, even for a manager.

---

## Part 7: Menu pages read from the database (Build step 2)
The Menu page and the Home page's "Today's specials" now show the rows in `menu_items` instead of a code file. When the Manager changes a price or availability in the database, the site follows within about a minute, with no code change (Maintainability). The sample file `src/lib/sample-menu.ts` is deleted.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/supabase/public.ts` | Application | **New.** A Supabase connection with **no login cookies** (always "anon"). Only for public data like the menu. |
| `src/lib/menu.ts` | Application | **New.** `getMenuItems()` (cached read of `menu_items`), `getCategories()`, the `MenuItem` type and `formatPrice()`. |
| `src/lib/store-info.ts` | Application | **New.** `OPENING_HOURS` and `DELIVERY_LOCATIONS` (moved; locations go into the database in a later part). |
| `src/app/menu/page.tsx` | Presentation | Loads items with `getMenuItems()`. Categories are built from the data. Shows a friendly message if loading fails or the menu is empty. |
| `src/app/page.tsx` | Presentation | Specials come from the database. If loading fails, the specials section is hidden, and the rest of the page still works. |
| `src/components/MenuItemCard.tsx` | Presentation | Only the import changed. |

### How a menu visit flows through the three layers
1. A visitor opens `/menu` (Presentation).
2. The page calls `getMenuItems()` (Application).
3. If a saved copy younger than ~1 minute exists, it is used straight away. Otherwise it queries `menu_items` as "anon"; RLS allows SELECT for everyone (Data).
4. The rows are converted (`is_available` → `isAvailable`) and the page HTML is built on the server.

### Key concepts
- **Caching (`'use cache'`):** Next.js keeps a saved copy of `getMenuItems()`'s result. With 100 customers at lunch (PR-3), most visits use the copy instead of hitting the database, which keeps the menu fast (PR-1). The build output shows `/menu` with "Revalidate 1m".
- **`cacheLife("minutes")`:** how long the copy is trusted (refreshed about every minute). **Trade-off:** a price change can take up to ~1 minute to appear. That's safe because the server re-checks prices and availability at checkout (step 3).
- **`cacheTag("menu")`:** a label on the copy. In step 7, when the Manager edits the menu in the app, we'll use the label to throw the copy away immediately.
- **Why a cookie-free connection?** A cached copy is shared by everyone, so it must not depend on one person's login. Next.js forbids reading cookies inside cached code. The menu is public anyway, so we read it as "anon".
- **Errors aren't cached:** if the database is down, `getMenuItems()` throws, nothing is saved, and the next visit tries again. The page shows a friendly message instead of crashing.
- **snake_case vs camelCase:** the database says `is_available`; our TypeScript says `isAvailable`. Converting in one place (`menu.ts`) keeps database names out of the pages.

### Possible lecturer questions
- *How does the menu meet PR-1 (3 s)?* It's built on the server and cached, so most visits get ready-made HTML without a database query.
- *If the Manager marks an item unavailable, could a customer still order it from an old cached page?* They might still see it for up to a minute, but checkout re-checks availability on the server (step 3), so the order would be refused.
- *Why is the menu readable while logged out?* Our decision: anyone can browse. RLS allows SELECT for `anon`, and we use the cookie-free connection.
- *How does a new category appear?* `getCategories()` builds the list from the items, so a new category text creates a new section automatically.

---

## Part 8: Small / Medium / Large sizes (Build step 2)
The real menu board sells food in up to 3 sizes with different prices (Fry Chicken 750 / 950 / 1200), and some dishes only come in some sizes (Fish: Large only). This part teaches the database and the menu cards about sizes. It also makes "allergens not confirmed yet" possible, because we don't know the real dishes' allergens.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0003_menu_item_sizes.sql` | Data | Adds `price_small`, `price_medium`, `price_large`; makes `price` optional; adds the "one pricing style" rule; lets `allergens` be NULL (= not confirmed). |
| `src/lib/menu.ts` | Application | New `Size` and `PriceOption` types. `toPriceOptions()` turns the 4 price columns into a list. `MenuItem.price` became `priceOptions`. |
| `src/components/MenuItemCard.tsx` | Presentation | Shows the offered sizes with prices and "From J$…". Shows "Not confirmed yet, please ask at the counter" for unconfirmed allergens. |

### Why "Option C" (size price columns on MenuItem)
| Option | Problem |
|---|---|
| A. One row per size | Description and **allergens** copied 3 times → they can disagree (SAF-2 safety risk). |
| B. New `menu_item_sizes` table | Adds a class that isn't in our SDS. |
| **C. Columns on MenuItem** ✅ | Only limit: a 4th size would need a database change. The board has 3. |

### Rules the database enforces
- **One pricing style per item** (`menu_items_one_pricing_style`): *either* `price` is filled and all sizes are empty (drinks), *or* `price` is empty and at least one size is filled (food). No item can have no price, or two kinds of price.
- **No negative prices** on all 4 price columns.
- **Allergens:** `NULL` = not confirmed, `{}` = confirmed none, `{Fish}` = confirmed list. New items start as NULL (not confirmed), because saying "ask" is safer than wrongly saying "none".

### Key concepts
- **`ALTER TABLE`:** changes an existing table (add columns, add rules) without deleting its rows. That's why the 8 sample items kept working.
- **NULL means "no value":** it is different from 0 or an empty list. We use that difference on purpose: an empty size price = "not offered"; NULL allergens = "not known yet", while `{}` = "known: none".
- **Shape for the pages vs. shape in the database:** the database has 4 price columns (simple to store and check); the pages get one list, `priceOptions` (simple to display). `menu.ts` converts once, so pages never deal with the columns.

### Possible lecturer questions
- *Why not a separate table for sizes?* It would add a class not in our SDS. Columns keep one row per dish, so allergens are stored once.
- *What stops an item from having no price?* The `menu_items_one_pricing_style` CHECK constraint, enforced by the database even for a manager.
- *Why show "ask at the counter" instead of "None"?* SAF-2. We don't know the real allergens yet, and "None" could hurt someone with an allergy.

---

## Part 9: The real menu (Build step 2)
The 8 made-up items are replaced by The Spot's real menu, copied from photos of the menu boards (`the-spot-real-menu.md`): **16 food items** with Small / Medium / Large prices and **40 drinks** with one price each, **56 items** in total.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/seed/real_menu_items.sql` | Data | **New.** Empties `menu_items` and adds the real menu, all in one transaction. |
| `supabase/seed/sample_menu_items.sql` | — | **Deleted.** The sample items are gone. |
| `src/app/menu/page.tsx` | Presentation | The "Sample items" note now says "Prices in J$." |
| `the-spot-real-menu.md` | — | The source of the data, plus the open questions for the client. |

### How the decisions show up in the data
| Decision | In the seed |
|---|---|
| No price on the board | Snapper Fish, Boom (both), Supligen, True Juice are left out |
| Curry Goat Large unclear | 1500, with an "unconfirmed" comment |
| Allergens unknown (SAF-2) | `allergens = NULL` for every item → "please ask at the counter" |
| Alcohol not decided | 11 alcohol items have `is_available = false` (greyed out) |
| Day-only dishes | Oxtail / Stew Peas: `is_daily_special = true`, start unavailable, description "Thursdays only" / "Wednesdays only" |
| Made to order | Only Chicken & Fries |
| Changed prices | The new price is used (Curry Goat Medium 1250, Arizona 450, Gatorade 350, Monster 350) |

### Key concepts
- **Transaction (`begin; … commit;`):** a group of changes that happen **all together or not at all**. If one row breaks a rule, Postgres cancels the whole seed, so the old menu stays, and we never get half a menu.
- **`truncate … restart identity`:** empties the table quickly and restarts the id numbers at 1. It's safe now because nothing points at menu items. Once orders exist, Postgres will refuse it, which protects order history.
- **sort_order with gaps (10, 20, 30…):** the Manager can put a new item at 15 without renumbering everything else.
- **Daily specials + `is_available`:** the Home page only shows specials that are available. So switching Oxtail on on Thursday makes it appear in "Today's specials"; switching it off hides it again. No extra weekday code needed.

### Possible lecturer questions
- *Why are some board items missing?* They have no price on the board, and the database refuses an item without a price. We're waiting for the client.
- *Why does every item say "ask at the counter" for allergens?* SAF-2: no allergens are confirmed yet, and claiming "None" could be dangerous.
- *What happens if the seed has a mistake halfway through?* It's a transaction, so everything is cancelled and the table is unchanged.

---

## Part 10: More menu categories (Build step 2)
Two big sections ("Food", "Drinks") became **8 smaller ones**, so customers find things faster (Usability: order in under 3 minutes): **Chicken, Pork & Beef, Goat & Fish, Mixes, Sodas, Water & Juice, Energy & Sports, Alcohol**.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/seed/real_menu_items.sql` | Data | Same 56 items and prices; new `category` values and renumbered `sort_order`. |
| `src/app/menu/page.tsx` | Presentation | `toId()` now makes safe link names: "Pork & Beef" → `#pork-and-beef`. |

### Key concepts
- **Data-driven sections:** no code lists the category names. The page builds its buttons and sections from the `category` text, so changing data was enough. That's the Maintainability requirement in action: the Manager can rename or add a category without a developer.
- **sort_order blocks:** categories appear in the order their first item appears, so each category gets its own block (Chicken 110–140, Pork & Beef 210–260, …, Alcohol 1510–1610). Items in a category stay together, and the gaps leave room for new items.
- **Why merge Goat & Fish?** Alone, each would be a 1-item section: an extra button that slows people down.
- **Safe link names ("slugs"):** a web address fragment like `#pork-&-beef` can misbehave, because `&` has a special meaning in addresses. We turn names into simple lower-case words joined by `-`.

### Possible lecturer questions
- *How did you add categories without changing the code?* The page groups items by the `category` column, so new values automatically become new sections.
- *What decides the order of the sections?* `sort_order`: each category has its own block of numbers.

---

## Part 11: Sticky category bar, highlight and 4 cards per row (Build step 2)
The Menu page is quicker to use (Usability: order in under 3 minutes): tapping a category **glides** to it, the bar **highlights the section you're looking at**, and wide screens show **4 cards per row** (still 1 per row on phones).

### Files
| File | Layer | What it does |
|---|---|---|
| `src/components/CategoryBar.tsx` | Presentation | **New.** A client component (`"use client"`): the sticky row of category links. Watches scrolling, highlights the current section, and scrolls the bar sideways so the active button stays visible on phones. |
| `src/app/menu/page.tsx` | Presentation | Uses `CategoryBar`. Page width up to 1280px (`max-w-7xl`); grid `xl:grid-cols-4`. |
| `src/app/globals.css` | Presentation | `scroll-behavior: smooth`, only if the user hasn't turned on "reduce motion". |
| `src/app/layout.tsx` | Presentation | `data-scroll-behavior="smooth"` on `<html>`, so Next.js keeps page-to-page navigation instant. |

### How the highlight works
1. Every time the page scrolls (at most once per screen redraw, using `requestAnimationFrame`), the bar checks each section.
2. The active section is the **last one whose top has reached the bottom of the sticky bar**.
3. At the very bottom of the page, the **last** section is active, because a short last section (Alcohol) can never scroll up to the bar.
4. The active button gets the filled red style and `aria-current="true"` (for screen readers).

### Key concepts
- **Server Component vs Client Component:** most of the Menu page is built on the server (fast, no JavaScript sent). Only `CategoryBar` runs in the browser, because only the browser knows where you've scrolled. The server hands it plain data (names and ids).
- **React hooks:** `useState` holds a value that redraws the component when it changes (`activeId`). `useEffect` runs code in the browser after the component appears, e.g. adding a scroll listener, and its clean-up removes the listener. `useRef` is a handle to a real element (the bar) so we can measure it.
- **Progressive enhancement:** the buttons are plain `<a href="#mixes">` links. If JavaScript fails, they still jump to the section; JavaScript only adds the highlight.
- **Accessibility:** smooth scrolling is turned off for people with "reduce motion" on. Tap targets are at least 44px tall (`min-h-11`).
- **Responsive grid:** `grid-cols-1` (phones) → `sm:grid-cols-2` (640px) → `lg:grid-cols-3` (1024px) → `xl:grid-cols-4` (1280px). "Mobile-first" means the plain class is for phones, and prefixes add columns as the screen grows.

### Fix: Energy & Sports was never highlighted
- **Symptom:** scrolling skipped from Water & Juice straight to Alcohol, and tapping Energy & Sports highlighted Alcohol.
- **Cause:** near the end of the page there wasn't enough content below the short sections, so the page couldn't scroll far enough for Energy & Sports to reach the bar. Our old "at the very bottom, highlight the last section" rule then picked Alcohol.
- **Fix:** the **last section** is now at least one screen tall minus the header and bar (`last:min-h-[calc(100dvh-8rem)]` in `MenuBrowser.tsx`). Now every section can scroll up to the bar, so the special bottom rule was removed from `CategoryBar.tsx`.
- **Key idea, `dvh`:** "dynamic viewport height", the visible screen height on phones, which changes as the browser's address bar slides in and out. `100vh` would be too tall on phones.

### ⚠️ Known issue: clicking a category jumps instead of gliding (revisit in the branding part)
- **What happens:** the highlight, sticky bar and 4-per-row grid work, but tapping a category **jumps** to it instead of gliding.
- **What we know:** the smooth-scroll rule is in `globals.css` and in the production build's CSS (`npm run build`). The running dev server first served an old stylesheet without it, but restarting the dev server and hard-refreshing did **not** fix the jump. Windows animation effects are on.
- **Not the cause:** our category links themselves. They still jump to the right section, so the menu is fully usable.
- **Ideas to check later:** whether the browser actually applies `scroll-behavior: smooth` to `<html>` (DevTools → Elements → `<html>` → Styles); whether Next.js's `data-scroll-behavior` handling affects in-page `#` links; a small JavaScript fallback (`window.scrollTo({ behavior: "smooth" })`) on click.
- **Lesson so far:** if a CSS change doesn't show up, first check whether the browser actually received it before changing code.

### Possible lecturer questions
- *Why is only the bar a client component?* Only it needs the browser (scroll position). Keeping the rest on the server sends less JavaScript, so the menu loads faster (PR-1).
- *What happens if JavaScript doesn't load?* The links still jump to each section; you just don't get the highlight.
- *Why doesn't the highlight lag when scrolling quickly?* We do the check at most once per screen redraw (`requestAnimationFrame`), which is cheap even on low-end phones.

---

## Part 12: Drinks as a compact list (Build step 2)
The 40 drinks used to be 40 big cards, which made the menu very long. Now every **single-price item** (today: exactly the drinks) is a **slim row** (name, allergens, price, Add) inside one white box. Food (sized items) stays as cards. Usability: a customer can scan the drinks in seconds.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/components/MenuItemRow.tsx` | Presentation | **New.** One slim row for a single-price item. Greyed out when unavailable (FR-01); always shows allergens (SAF-2). |
| `src/app/menu/page.tsx` | Presentation | Each section splits its items: sized → cards grid, single-price → row list (2 columns of rows on wide screens). |
| `src/lib/menu.ts` | Application | New shared helpers `allergenText()` and `isSinglePrice()`. |
| `src/components/MenuItemCard.tsx` | Presentation | Now uses the shared helpers (looks the same). |

### Key concepts
- **One rule, written once (`allergenText`)**: the card and the row both show allergens. Because both call the same function, they can never show different wording, which is important for a safety requirement (SAF-2).
- **Rule-based display, no new column:** "single price → row" works because of our pricing decision (food is sized, drinks are single-price). We didn't need a `display_style` column in the database.
- **Semantic HTML:** the rows are a `<ul>` list of `<li>` items, which screen readers announce as "list, 10 items", helpful for blind users.
- **`min-w-0` + `flex-1`:** in a flex row, these let a long name wrap onto two lines instead of pushing the price and button off a small phone screen.

### Possible lecturer questions
- *How does the page decide card or row?* `isSinglePrice(item)`: one price and no sizes → row; otherwise card.
- *Do the compact rows still meet SAF-2?* Yes, every row has an allergen line, using the same `allergenText()` as the cards.

---

## Part 13: Menu search (Build step 2)
A search box at the top of the Menu page. Typing instantly hides items that don't match, the category bar only shows categories with matches, and "No items match" offers a **Clear search** button. Usability: typing "pepsi" is faster than scrolling past 50 items.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/components/MenuBrowser.tsx` | Presentation | **New.** Client component: search box, result count, category bar and sections (moved here from the page). Filters the items it was given. |
| `src/lib/menu-helpers.ts` | Application | **New.** Browser-safe types and helpers (`MenuItem`, `formatPrice`, `allergenText`, `isSinglePrice`, `getCategories`, `sectionId`, `matchesSearch`). |
| `src/lib/menu.ts` | Application | Now **server only**: just `getMenuItems()` (database + cache). |
| `src/app/menu/page.tsx` | Presentation | Loads the items on the server and hands them to `MenuBrowser`. |
| `MenuItemCard.tsx`, `MenuItemRow.tsx`, `app/page.tsx` | Presentation | Import from `menu-helpers` instead of `menu`. |

### How search matches (`matchesSearch`)
- Not case-sensitive: "PEPSI" finds Pepsi.
- Looks in the **name and category**: "water" finds all waters (and Cran Juice, because its category is "Water & Juice").
- **Every word must match**: "fry chicken" finds Fry Chicken and Bar-B-Fry Chicken, but not Brown Stew Chicken.

**Layout detail:** if a drinks section has only **1 row** (e.g. after searching "pepsi"), the white box becomes **half width with one column** on wide screens, so there's no big empty right half. With 2 or more rows it stays the full-width box with 2 columns.

### Key concepts
- **Server loads, browser filters:** the server still loads and caches the menu (fast first view, PR-1). The browser filters the 56 items it already has, so results appear on every key press with **no database query**.
- **Server-only vs browser-safe code:** `menu.ts` uses the database and `'use cache'`, which must never be sent to the browser. A client component can only import browser-safe code, so the shared types and helpers moved to `menu-helpers.ts`. Rule of thumb: *if a file talks to the database, keep it out of `"use client"` imports.*
- **Controlled input:** the search box's value lives in React state (`useState`). Each key press updates `query`, and React redraws the list.
- **`useMemo`:** remembers a calculated value (the filtered list) and only recalculates when its inputs change.
- **Accessibility:** a hidden `<label>` names the box for screen readers; `aria-live="polite"` reads out "5 items found"; `text-base` (16px) stops iPhones from zooming in on the box.

### Possible lecturer questions
- *Does every key press query the database?* No. The browser filters the items it already received, so it's instant and puts no load on Supabase at lunchtime (PR-3).
- *Why did you split `menu.ts`?* The search runs in the browser, and browser code must not include server-only database code. Shared helpers went to `menu-helpers.ts`.
- *What if nothing matches?* A message says so, with a Clear search button back to the full menu.

---

## Part 14: The `customizations` table (Build step 2)
FR-02 says customers can add extras (sides, extra sauces) with an extra cost. This part creates the table that stores those extras, plus 7 **sample** extras, because we don't know The Spot's real ones yet. Choosing them comes in Part 15 (options panel), and keeping them in Part 16 (cart).

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0004_customizations.sql` | Data | Creates the table, its rules, the `updated_at` trigger, grants and RLS. |
| `supabase/seed/sample_customizations.sql` | Data | 4 sample sides + 3 sample sauces, each named "… (Sample)". All-or-nothing transaction; safe to re-run. |

### The `customizations` table (SDS class: Customization)
| Column | Type | Why |
|---|---|---|
| `id` | bigint, auto-numbered | |
| `name` | text | e.g. "Extra gravy (Sample)" |
| `kind` | text, `'side'` or `'sauce'` (CHECK) | Groups extras under "Sides" / "Sauces" in the panel. |
| `extra_price` | numeric(10,2), ≥ 0 | Exact money. 0 = "Free". |
| `is_available` | boolean | Greyed out and can't be ticked when false. |
| `sort_order` | integer | Order in the panel. |
| `created_at`, `updated_at` | timestamptz | `updated_at` kept by the shared `set_updated_at()` trigger. |

### Who can do what (RLS), same as `menu_items`
| Action | Visitor | Customer / other staff | Manager |
|---|---|---|---|
| Read extras | ✅ | ✅ | ✅ |
| Add / edit / delete extras | ❌ | ❌ | ✅ |

### Decisions behind the design
- **One shared list for all food, none for drinks:** so the table has **no link to `menu_items`**. The app simply offers every available extra on every sized item. (The alternative, a link table `menu_item_customizations`, would let each dish have its own extras, but adds a table not in our plan.)
- **Tick boxes, each at most once:** so there's no quantity column.
- **No fries side (yet):** fries are made-to-order, which would need the 15-minute lead-time rule (FR-01) for extras too.

### Key concepts
- **Reusing what we built:** `current_user_role()` (Part 6) and `set_updated_at()` (Part 6) are shared by this table. Writing them once means one rule for "only a manager", everywhere.
- **text + CHECK vs enum:** both limit a column to fixed values. We used an enum for roles (Part 2) and a CHECK for `kind` here, because a CHECK is easier to change if the client adds a new kind later.
- **Price snapshot (coming in step 3):** when an order is placed, the price of each chosen extra is copied into the order, so changing a price later never changes old orders.

### Possible lecturer questions
- *Where is the meal note stored?* Not here. It's typed per item in the panel (Part 15), kept in the cart (Part 16) and saved on the order item at checkout (step 3).
- *How do you know which items get extras?* Decision: all sized items (food). Drinks are single-price and get none.
- *Can a customer change an extra's price?* No. RLS only lets a manager insert, update or delete.

---

## Part 15: The options panel (Build step 2)
Tapping **Add** on a food item opens a panel to choose a **size**, tick **extras** (sides/sauces), type a **meal note** and pick a **quantity**, with the **price updating live** (FR-02). There's no cart yet: "Add to cart" shows a confirmation message of what *would* be added. Part 16 adds the real cart.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/components/ItemOptionsDialog.tsx` | Presentation | **New, client.** The panel (a `<dialog>`): size radios, extras tick boxes, meal note (max 200), quantity 1–10, live "Add to cart · J$…" button. |
| `src/components/AddToCartButton.tsx` | Presentation | **New, client.** The Add button that opens the panel, plus the confirmation message. |
| `src/lib/customizations.ts` | Application | **New, server only.** `getCustomizations()`: cached, same `"menu"` cache label. |
| `src/lib/menu-helpers.ts` | Application | `Customization` type, `calculateLinePrice()`, `formatExtraPrice()`, `MAX_QUANTITY` (10), `MAX_NOTE_LENGTH` (200). |
| `MenuItemCard.tsx` | Presentation | Food cards use `AddToCartButton`. |
| `menu/page.tsx`, `MenuBrowser.tsx`, `app/page.tsx` | Presentation | Load the extras on the server and pass them to the cards. |

### Rules in the panel
- **Size:** nothing pre-chosen (so nobody gets the wrong size by accident), unless there's only one size (Fish → Large). "Add to cart" stays disabled until a size is chosen.
- **Extras:** tick boxes, each at most once; unavailable ones greyed out. If the extras fail to load, the panel shows none and food can still be ordered.
- **Meal note:** optional, stops at 200 characters (`maxLength`), with a live counter. (The server will check it again at checkout, because browser limits can be bypassed.)
- **Quantity:** 1 to 10; − and + are disabled at the limits.
- **Price:** `calculateLinePrice(size price, extras, quantity)` = (size + extras) × quantity.

### Key concepts
- **`<dialog>` + `showModal()`:** the browser's built-in modal. It gives a dark backdrop, keeps keyboard focus inside, closes on **Esc**, and works with screen readers, with no extra library.
- **Bottom sheet:** on phones the panel is full width at the bottom (easy to reach with a thumb); on computers it's a centred box (`sm:` classes).
- **Money in cents:** JavaScript numbers are floats, so `0.1 + 0.2 = 0.30000000000000004`. `calculateLinePrice` turns prices into whole cents, adds whole numbers (always exact), then converts back.
- **One price function everywhere:** the panel, the cart (Part 16) and the server at checkout (step 3) all use `calculateLinePrice`, so the customer is never shown one price and charged another.
- **Fresh state each time:** the panel only exists on the page while it's open, so every opening starts with no size, no extras and quantity 1.
- **`useCallback`:** keeps the same function between redraws, so the panel's `useEffect` doesn't re-run needlessly.
- **Accessible forms:** `<fieldset>` + `<legend>` group the radios and tick boxes; every input has a `<label>` (tapping the text ticks the box); tap targets are at least 44px.

### Possible lecturer questions
- *How is the price calculated?* `(size price + sum of ticked extras) × quantity`, in cents, by one shared function.
- *Why can't I add without a size?* To avoid wrong orders, the button stays disabled until a size is picked (unless there's only one size).
- *Where does the meal note go?* Into the cart line (Part 16), then saved on the order item at checkout (step 3), where the server checks the 200-character limit again.

---

## Part 16: The cart: storage, Add buttons and header count (Build step 2)
Customers can now collect items: food goes in through the options panel, drinks with **one tap**, and the header shows **Cart (3)**. The cart is kept **in the browser** (works without logging in), survives reloads, updates across tabs, and is **emptied on Log out** (shared campus computers). The cart page itself comes in Part 17.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/cart.ts` | Application | **New.** `CartLine` type + pure rules: `addLine` (merge same choice, max 10), `sameChoice`, `cartCount`, `lineTotal`, `describeLine`, `parseCart` (safe reading). |
| `src/lib/cart-store.ts` | Application | **New.** Saves the cart in `localStorage`, tells React about changes, listens for other tabs. |
| `src/components/CartProvider.tsx` | Presentation | **New, client.** Shares the cart site-wide (React Context, `useCart()`), shows the "Added to cart" message. |
| `src/components/QuickAddButton.tsx` | Presentation | **New, client.** One-tap Add for single-price items (drinks). |
| `src/components/CartLink.tsx` | Presentation | **New, client.** "Cart" + count bubble in the header. |
| `src/components/LogOutButton.tsx` | Presentation | **New, client.** Empties the cart, then runs the `logOut` Server Action. |
| `AddToCartButton.tsx`, `ItemOptionsDialog.tsx` | Presentation | The panel's choice now goes into the real cart. |
| `MenuItemRow.tsx`, `MenuItemCard.tsx` | Presentation | Use `QuickAddButton` for single-price items. |
| `SiteHeader.tsx`, `layout.tsx` | Presentation | Cart link (visitors + customers only), Log out button; the whole site wrapped in `CartProvider`. |
| `src/app/cart/page.tsx` | Presentation | **Temporary** placeholder until Part 17. |

### Rules
- **Same choice → same line:** same item + size + extras (any order) + note raises the quantity instead of adding a duplicate line. A different note = a new line.
- **Max 10 per line:** extra adds stop at 10 and the message says so.
- **Unavailable items** can't be added (FR-01).
- **No cart for staff:** the Cart link only shows for visitors and customers.
- **Log out empties the cart**; logging in keeps it.
- **Prices in the cart are copies, not trusted:** anyone can edit browser storage, so the server re-checks every price and availability at checkout (step 3). `parseCart` only stops a damaged cart from crashing the page.

### Key concepts
- **localStorage:** a small storage box per website in the browser. It survives reloads, but stays on one browser/device. Every use is in `try/catch`, because some browsers refuse it (private mode, storage full).
- **React Context (`CartProvider` + `useCart()`):** like a noticeboard. The provider pins the cart up once around the whole site; any component can read it without passing props through every level.
- **`useSyncExternalStore`:** React's built-in way to read data that lives outside React (localStorage). We give it: how to subscribe, how to read in the browser, and what the server should use (an empty cart).
- **Hydration:** the server can't see browser storage, so its HTML shows an empty cart; the browser then swaps in the real count. Starting from the same "empty" picture avoids a hydration mismatch error.
- **Pure functions + new copies:** `addLine` never changes the old cart; it returns a new one. React only notices changes when it gets a new value.
- **The `storage` event:** fires in *other* tabs when localStorage changes, so the count updates everywhere.
- **Client button + Server Action:** `LogOutButton` empties the cart in the browser (`onClick`) *before* the form runs the server's `logOut`.

### Possible lecturer questions
- *Why keep the cart in the browser, not the database?* Decision for now: no login needed to browse and fill a cart, and no database writes until an order is placed. The server re-checks everything at checkout.
- *Couldn't someone change the prices in their cart?* Yes, in their own browser, so the server never trusts cart prices; it recalculates from the database at checkout.
- *What happens on a shared computer?* Log out empties the cart, so the next person starts fresh.
- *Why does the count appear a split second after the page?* The server can't read browser storage; the browser fills in the real count right after loading (hydration).

---

## Part 17: The cart page (Build step 2)
`/cart` now shows everything in the cart: each line's name, size, extras, meal note, price each, **quantity − 1 +**, **Remove**, and line total, plus a **summary** with the item count, **subtotal** (items + customizations, FR-02) and a **Checkout** button (disabled until Build step 3). This completes the "Menu → Cart" part of the under-3-minutes goal.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/components/CartView.tsx` | Presentation | **New, client.** Lines, summary, empty state, loading skeleton. |
| `src/components/QuantityStepper.tsx` | Presentation | **New.** The shared − 1 + control (1–10), used by the panel and the cart page. |
| `src/lib/cart.ts` | Application | New pure functions `setLineQuantity` (kept 1–10), `removeLine`, `cartSubtotal`. |
| `src/components/CartProvider.tsx` | Presentation | Shares `changeQuantity()` and `removeFromCart()` ("Removed …" message). |
| `src/components/ItemOptionsDialog.tsx` | Presentation | Uses `QuantityStepper` (looks the same). |
| `src/app/cart/page.tsx` | Presentation | Page title + `CartView` (replaces the placeholder). Browser tab: "Your cart". |

### Decisions
- **"−" is disabled at 1**: removing is only done with the Remove button, so nobody removes a line by accident.
- **Quantity or remove only**: to change size, extras or note, remove the line and add it again.
- **No price re-check on the cart page**: the server checks prices and availability at checkout (step 3) and tells the customer what changed. One check, in the right layer (Application, on the server).
- **Checkout button shown but disabled** until step 3.
- **Hint in the options panel:** "Extras are added to each meal." appears under the quantity (when there are extras), because the price is (size + extras) × quantity. With quantity 2, both meals get the ticked extras.

### Key concepts
- **Avoiding the "empty flash":** the server can't see the browser's cart, so it would draw "Your cart is empty" and then the items would pop in. `useIsBrowser()` (built on `useSyncExternalStore`: the server answers `false`, the browser `true`) shows grey **skeleton** boxes until the cart can be read.
- **One component, two places (`QuantityStepper`):** the panel and the cart page share the same control, so the 1–10 limits can't drift apart.
- **Exact totals:** `cartSubtotal` adds every line in whole cents, the same idea as `calculateLinePrice`.
- **Responsive layout:** phones stack the lines with the summary below; wide screens (`lg:grid-cols-3`) put the lines in 2/3 and a **sticky** summary in 1/3.
- **Accessibility:** the lines are a `<ul>`; each stepper and Remove button names its item for screen readers ("One more Pepsi", "Remove Pepsi"); the subtotal is `aria-live`, so changes are read out.

### Possible lecturer questions
- *How is the subtotal calculated?* For each line, `(size price + extras) × quantity` with the shared function, all added in cents. The delivery fee is added at checkout.
- *What if a price changed since the item was added?* The cart shows the saved copy; the server recalculates from the database at checkout and tells the customer.
- *Why does the page show grey boxes for a moment?* The cart is in the browser; the server can't read it, so we show placeholders instead of a misleading "empty cart".

---

## ✅ Build step 2 complete: recap
Step 2 was "Menu + cart (FR-01, FR-02)". It took Parts 6–17:
- **6. `menu_items` table:** exact money (`numeric`), no negative prices, public read, manager-only edits (RLS + `current_user_role()`).
- **7. Menu from the database:** cached for ~1 minute (`'use cache'`) with a cookie-free public connection (PR-1).
- **8. Sizes:** Small/Medium/Large price columns on MenuItem, "one pricing style" rule, allergens NULL = "not confirmed" (SAF-2).
- **9. Real menu:** 56 items from the menu boards, loaded in one all-or-nothing transaction.
- **10. Categories:** 8 data-driven sections with `sort_order` blocks.
- **11. Sticky category bar:** highlight of the current section; 4 cards per row on wide screens.
- **12. Compact drink rows:** single-price items as slim rows, shared `allergenText()`.
- **13. Search:** browser-side filtering; `menu.ts` (server only) split from `menu-helpers.ts` (browser-safe).
- **14. `customizations` table:** sample extras, same security pattern as the menu.
- **15. Options panel:** `<dialog>` with size, extras, meal note, quantity and a live price from `calculateLinePrice()` (in cents).
- **16. Cart:** kept in the browser (`localStorage` + `useSyncExternalStore`), shared with React Context, one-tap drinks, header count, cleared on log out.
- **17. Cart page:** quantity/remove, subtotal, skeleton instead of an "empty flash".

**How adding to the cart flows through our three layers** (example: 2 × Fry Chicken Large + Coleslaw):
- The Menu page's server part loads `menu_items` and `customizations` through RLS-protected reads, cached (Data → Application).
- The customer picks options in the panel; `calculateLinePrice()` shows J$2,700 (Application rule, running in the browser).
- `CartProvider` saves the line in `localStorage`; the header shows Cart 2 (Presentation).
- At checkout (Build step 3), the **server** will recalculate the price from the database before accepting the order, because browser data is never trusted.

**Known issues carried forward:** category tap jumps instead of gliding (revisit in the branding part); header is narrower than the menu page on wide screens (branding part).

---

# Build step 3: Checkout and order submission (FR-01, FR-02)
Parts: **18** delivery locations · **19** order tables + `create_order` · **20** checkout page · **21** `placeOrder` server action · **22** confirmation page.

## Part 18: The `delivery_locations` table and the sample delivery fee
The delivery locations moved from code (`store-info.ts`) into a database table, each with its **delivery fee**, so the Manager can change them without code changes (Maintainability). The real fee isn't known yet, so every location starts with a **sample fee of J$200**, clearly marked.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0005_delivery_locations.sql` | Data | Table, rules, `updated_at` trigger, grants, RLS (public read, manager-only edits). |
| `supabase/seed/sample_delivery_locations.sql` | Data | UWI Mona, UTech, UWI Hospital, each J$200 with `fee_confirmed = false`. |
| `src/lib/delivery-locations.ts` | Application | **New, server only.** `getDeliveryLocations()`: active locations, cached ~1 minute. |
| `src/lib/store-info.ts` | Application | `DeliveryLocation` type and `formatDeliveryFee()` ("J$200 (sample, not final)"). The hard-coded list is gone. |
| `src/app/page.tsx` | Presentation | Home page reads the locations from the database; `joinWithAnd()` builds the sentence for any number of places. |

### The `delivery_locations` table
| Column | Type | Why |
|---|---|---|
| `id` | auto-numbered | Orders will point to it (Part 19). |
| `name` | text, unique | e.g. "UWI Mona". |
| `delivery_fee` | numeric(10,2), ≥ 0 | Exact money; per location, so places can differ later. |
| `fee_confirmed` | boolean | `false` → shown as "(sample, not final)". The Manager ticks it when the real fee is known. |
| `is_active` | boolean | `false` → hidden from customers, but kept so old orders still point to a real place. |
| `sort_order` | integer | Order in lists. |

### Key concepts
- **Marking sample data in the data itself:** `fee_confirmed` lets the *Manager* switch off the "(sample)" label, with no developer needed.
- **"Deactivate, don't delete":** `is_active = false` hides a location without breaking old orders that refer to it.
- **Graceful failure:** if the locations can't load, the Home page still works ("Pick up at the counter.") instead of crashing.
- **Run the SQL before building or deploying:** `npm run build` pre-builds pages and calls the cached data functions. When `delivery_locations` didn't exist yet, the build **stopped** ("Error occurred prerendering page /"), even though the page itself handles a failed load. Order for every database change: **run the migration in Supabase first, then build/deploy** (this matters for Vercel too).
- **Cached for display, fresh for money:** the Home page and checkout use the cached list; when an order is placed (Part 21) the server reads the fee **fresh** from the database.

### Possible lecturer questions
- *How does the Manager change the delivery fee?* Edit `delivery_fee` (Table Editor now, Manager screen in step 7) and set `fee_confirmed` to true. No code change.
- *Why not delete a location you stop delivering to?* Old orders point to it. Setting `is_active = false` hides it from customers but keeps the history correct.

## Part 19: The order tables and `create_order` (database only)
Everything needed to **store** an order: 5 tables, the 7 order statuses, the rules for who can read them, and one function that saves a whole order at once. No app code yet: the checkout page (Part 20) and the server action that calls `create_order` (Part 21) come next.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0006_orders.sql` | Data | `order_status` enum, 5 tables, rules, indexes, RLS, `create_order()`. |
| `supabase/tests/0006_orders_checks.sql` | Data (tests) | 8 blocks to run one at a time; each ends in `rollback` (no test data left). |

### The tables (SDS: Order, OrderItem, Customization, OrderStatus, Payment)
| Table | Key columns |
|---|---|
| `orders` | `id` = **Order ID** (starts at 1001), `customer_id`, `fulfilment` (PICKUP/DELIVERY), `delivery_location_id`, `requested_time`, `is_asap`, `status` (starts PENDING), `items_total`, `delivery_fee`, `total`, `client_request_id` (unique) |
| `order_items` | item, `size`, **`unit_price` copied at order time**, `quantity` 1–10, `note` ≤ 200, `line_total` |
| `order_item_customizations` | each chosen extra with its **price copied at order time** |
| `order_status_history` | every status + when + who (PENDING is the first row) |
| `payments` | `method` LYNK/CASH, `amount`, `status` UNPAID (PAID/REFUNDED in step 7) |

### Rules the database enforces
- **The 7 statuses** are an enum: exactly PENDING, IN_PROGRESS, READY_FOR_PICKUP, BEING_DELIVERED, COMPLETED, CANCELLED, ABANDONED.
- **Total adds up:** `total = items_total + delivery_fee` (CHECK).
- **Delivery needs a location; pickup has none and no fee** (CHECK).
- **Quantity 1–10, note ≤ 200 characters, no negative money** (CHECKs).
- **Foreign keys:** an order must point to a real customer, menu items and location. That's also why the menu seed's `truncate` will now be refused once orders exist: it protects order history.

### Who can do what (RLS)
| Action | Visitor | The customer who ordered | Any other user | Our server (secret key) |
|---|---|---|---|---|
| Read the order, items, extras, history, payment | ❌ | ✅ | ❌ | ✅ |
| Insert / change orders directly | ❌ | ❌ | ❌ | only via `create_order` |
| Run `create_order()` | ❌ | ❌ | ❌ | ✅ |

### Why the secret key is needed (and why it must stay on the server)
Supabase gives us **two keys**:
- **Publishable key** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`): safe in the browser. Everything done with it is limited by RLS. Anyone can see it in the page's code, so it must never be able to do anything RLS forbids.
- **Secret key** (`SUPABASE_SECRET_KEY`, the "service_role"): **skips RLS completely**. Whoever has it can read and change *any* row.

**Why we need the secret key now:** creating an order must be impossible for customers to do directly, otherwise someone could use the publishable key to save an order with any price they like (e.g. J$0). So customers get **no** insert rights, and `create_order()` can only be run by `service_role`. Our server action (Part 21) checks every rule, recalculates every price from the database, and only then uses the secret key to call `create_order()`.

**How we keep it secret:**
1. It goes in `.env.local` as `SUPABASE_SECRET_KEY`, **without** the `NEXT_PUBLIC_` prefix. Next.js only sends `NEXT_PUBLIC_…` variables to the browser, so without the prefix it stays on the server.
2. Only server-only code will use it (a file marked `server-only` in Part 21, so the build fails if browser code ever imports it).
3. `.env.local` is in `.gitignore` (checked before every push), so it's never on GitHub. On Vercel it's entered in the project's Environment Variables.
4. If it ever leaked, we would **rotate** it (make a new one in Supabase), and the old one would stop working.

### Key concepts
- **Copy prices into the order:** `unit_price` and `extra_price` are saved at order time, so later menu changes never alter old orders or old sales reports (FR-06).
- **One transaction:** `create_order()` saves the order, items, extras, first status and payment **all or nothing**: never half an order.
- **No duplicate orders (`client_request_id`):** the checkout page makes one random id per checkout. A double tap or network retry sends the same id, and `create_order` returns the first order's number instead of making a second order.
- **Defence in depth:** the server checks everything (Part 21); the database *also* checks that totals add up, quantities are 1–10, delivery has a location, etc. If one layer has a bug, the other still stops bad data.
- **Indexes:** like a book's index, they help Postgres find a customer's orders quickly at lunchtime (PR-3).
- **A statement sees a "snapshot":** one SQL statement reads the database as it was when that statement *started*. In our first test, `create_order` and a `count(*)` in the **same** SELECT gave count 0, because the count couldn't see the row just added. Splitting it into two statements fixed the test (the function itself was fine).
- **Rollback doesn't reset counters:** Postgres never reuses an id, even from a cancelled transaction. That's why the test file ends by resetting the Order ID counter to 1001.

### Possible lecturer questions
- *Why can't customers insert orders, if they're the ones ordering?* Because the public key is visible to everyone. If it could insert orders, prices could be faked. Orders are created by our server after it has checked and priced everything.
- *What does the secret key do, and where is it?* It skips RLS. It lives only on the server (`.env.local`, Vercel settings), never in browser code or on GitHub.
- *What stops two orders from one double tap?* `client_request_id` is unique; the second attempt returns the first order's ID.
- *Why copy the price into `order_items`?* So changing a menu price tomorrow doesn't change what yesterday's customer paid.

## Part 20: The checkout page (no submitting yet)
`/checkout` lets a logged-in customer choose **pickup or delivery** (and where), **when** (as soon as possible, or a time later today), and **Lynk or Cash**, and shows the order and the **total** (items + extras + delivery fee). "Place order" is connected in Part 21. Logged-out visitors are sent to log in and then **come straight back** to checkout.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/app/checkout/page.tsx` | Presentation | **New.** Customers only (`requireRole(["customer"], { returnTo: "/checkout" })`); loads phone, delivery locations, made-to-order item ids. |
| `src/components/CheckoutForm.tsx` | Presentation | **New, client.** The choices, the order summary, the total, what's still missing. |
| `src/lib/order-rules.ts` | Application | **New.** FR-01 time rules in **Jamaica time**: lead times, opening hours, earliest time, 15-minute slots, and `checkRequestedTime()` for the server (Part 21). |
| `src/lib/browser-hooks.ts` | Presentation | **New.** `useIsBrowser()` (moved from CartView) and `useNow()` (a clock that ticks every 30 s). |
| `src/lib/auth/safe-next.ts` | Application | **New.** `safeNextPath()`: only allows "come back to" paths inside our site. `pathAfterLogin()`: the ONE rule for where a logged-in user goes (customer + next -> next, otherwise their role's screen). |
| `src/components/RedirectIfLoggedIn.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx` | Presentation | An already logged-in visitor is sent on with `pathAfterLogin()` too (the page hands `?next=` over as `searchParams`). |
| `require-role.ts`, `actions.ts`, `LoginForm.tsx`, `SignUpForm.tsx` | Application / Presentation | Support `?next=/checkout` so customers return to checkout after logging in or signing up. The forms read it with `useNextParam()` (in `browser-hooks.ts`, built on Next.js's `useSearchParams()`). |
| `src/components/CartView.tsx` | Presentation | The Checkout button now goes to `/checkout`. |

### The FR-01 time rules (`order-rules.ts`)
| Situation | Lead time |
|---|---|
| Pickup | 0 (straight away) |
| Pickup with a made-to-order item (fries) | 15 min |
| Delivery (with or without fries) | 20 min (the larger rule wins) |

- **Earliest time** = (now, or 11:00 a.m. if earlier: the kitchen starts at opening) + lead time. Example: delivery ordered at 9:30 a.m. → 11:20 a.m.
- **Later today:** every 15 minutes from the first slot after the earliest time, up to 7:00 p.m.
- **Closed:** if even the earliest time is after 7:00 p.m., no orders until tomorrow (same day only).

### Key concepts
- **Time zones:** Vercel's servers use UTC; phones can be set to any zone. Jamaica is always **UTC−5** (no daylight saving), so the rules shift every time into Jamaica time before comparing. `Intl.DateTimeFormat` with `timeZone: "America/Jamaica"` shows times correctly on any device.
- **One set of rules, two users:** the page uses `order-rules.ts` to **offer** only allowed times; the server (Part 21) uses the **same** functions to **check** them, because the browser can be tampered with.
- **A ticking clock (`useNow`):** the offered times move on by themselves if the page stays open. A chosen time that becomes too soon is simply un-chosen.
- **Open redirect protection:** `/login?next=…` only accepts paths inside our site, so a trick link like `/login?next=https://evil.example` can't send people to a fake site after logging in.
- **No pre-chosen answers for important choices:** pickup/delivery and payment start empty (like sizes), so nobody orders the wrong way by accident; "As soon as possible" is pre-chosen because it's what most people want.
- **Show what's missing:** instead of a silently disabled button, the summary lists what still needs choosing.

### Fix: after logging in, customers landed on Home instead of checkout
- **Symptom:** `/login?next=%2Fcheckout` was correct, but after logging in you went to the Home page. Staff logins looked fine.
- **How we found it:** we drove a real Chrome with a test script, used the real Checkout link, and recorded what the login form sends. The form DID send `next=/checkout` (React renames it `_1_next` while sending; the server turns it back into `next`). So the form was fine; the problem came AFTER a successful login.
- **Cause: two pieces of code disagreed about where to go.**
  1. The `logIn` action said: customer + `next` -> go to `/checkout`.
  2. `RedirectIfLoggedIn` (on the login page) said: logged in -> go to your role's home, and a customer's home is `/`.
  After logging in, the cookies change, so Next.js refreshes the pages it still has loaded, including the login page it keeps alive in the background (Next.js 16 keeps recent pages ready for the Back button). That refreshed login page now saw a logged-in customer, and its "go to `/`" won.
  Staff never noticed, because for them both pieces said the same thing (e.g. `/staff`).
- **Fix:** one shared rule, `pathAfterLogin(role, next)` in `src/lib/auth/safe-next.ts`. The `logIn` and `signUp` actions and `RedirectIfLoggedIn` all use it (the page hands `?next=` to RedirectIfLoggedIn as `searchParams`). Now every path says `/checkout`.
- **Also tidied:** the forms read `?next=` with Next.js's `useSearchParams()` (part of the router, so it always knows the current address), inside `<Suspense>` with a plain grey box as the placeholder (never a second copy of the form).
- **Lesson:** if two places make the same decision ("where does this user go?"), put the rule in ONE function and call it from both. Otherwise they drift apart and the one that runs last wins. And test with a check that shows what was actually sent, instead of guessing.

### Possible lecturer questions
- *How do you stop a customer choosing 10:00 a.m. or 8:00 p.m.?* The page only offers allowed times, and the server checks again with the same rules (Part 21).
- *What happens if I order fries for pickup?* The earliest time moves 15 minutes later; for delivery it's 20 minutes either way.
- *Why Jamaica time in code instead of the computer's time?* The server runs on UTC; using the computer's time would make the shop "open" at the wrong hours.
- *What if I'm logged out when I tap Checkout?* You're sent to log in (or sign up) and then returned to checkout; the address is checked so it can only send you somewhere on our site.

## Test setting: ignore opening hours (laptop only)
So we can test checkout at night, there is a **test-only** setting that makes The Spot "open all day" (midnight to 11:45 p.m.). Lead times and "same day only" still apply. It can **never** work on the live site.

### How to use it
1. In `.env.local` add the line `TEST_IGNORE_OPENING_HOURS=true`
2. Stop the dev server (Ctrl + C) and run `npm run dev` again.
3. Checkout now shows a yellow **TEST MODE** banner. To switch off: delete the line and restart.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/test-settings.ts` | Application (server only) | **New.** `isIgnoreOpeningHoursOn()` and `getOpeningHours()`: the ONE place that decides real hours vs test hours. |
| `src/lib/order-rules.ts` | Application | Opening hours are now an optional value (`OpeningHours`) the rule functions accept. Left out = the real FR-01 hours (`STORE_HOURS`). |
| `src/app/checkout/page.tsx` | Presentation | Asks the server which hours to use and passes them to the form. |
| `src/components/CheckoutForm.tsx` | Presentation | Uses the hours it's given; shows the TEST MODE banner. |

### Key concepts
- **Two locks:** it only turns on if `NODE_ENV` is `"development"` (Next.js sets this itself: only `npm run dev`; Vercel is always `"production"`) **and** `TEST_IGNORE_OPENING_HOURS` is `"true"` (only in `.env.local`, which git ignores). Even a mistake in Vercel's settings can't open lock 1.
- **Fail safe:** the value must be exactly `true`; a typo means "off", the real hours.
- **Server decides, browser shows:** a variable without `NEXT_PUBLIC_` is invisible to the browser, so the server reads it and hands the hours to the page. Part 21's `placeOrder` will use the same `getOpeningHours()`, so what the page offers and what the server accepts always match.
- **`import "server-only"`:** the build fails if browser code ever imports that file.

### Possible lecturer questions
- *Couldn't a customer turn test mode on?* No. It's read on the server from the server's own settings; nothing the browser sends can change it, and on Vercel `NODE_ENV` is always production.

## Part 21: Place order (the placeOrder server action)
"Place order" now sends the order to our server. The server checks everything again, works out every price from the database, and saves the order with `create_order()` (Part 19). The customer sees **"Order #1001 placed"** and the cart is emptied. (Part 22 replaces that message with a real confirmation page.)

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/orders/actions.ts` | Application | **New.** `placeOrder()`: the Server Action with every ordering rule (steps below). |
| `src/lib/supabase/admin.ts` | Application (server only) | **New.** `createAdminClient()`: a connection with the **secret key** (`SUPABASE_SECRET_KEY`), used ONLY to run `create_order()`. |
| `src/components/CheckoutForm.tsx` | Presentation | The button is connected: "Placing order…" while waiting, red box with what changed, Order ID on success, cart cleared. |
| `src/lib/order-rules.ts` | Application | `checkRequestedTime()` now also refuses times that aren't on a 15-minute step. |

### What placeOrder checks, in order
1. **Who:** a logged-in **customer**. Their id comes from the signed login cookie, never from the browser.
2. **Shape:** every field has the right type; quantity 1–10; note ≤ 200 characters; each extra at most once; delivery has a location, pickup doesn't.
3. **Fresh data:** reads menu items, extras and the delivery location straight from the database (not the ~1-minute cached copy).
4. **Each line:** item exists and is available; the size is really offered; extras only on food and available; the **real** price is used.
5. **Delivery:** location still active; fee from the database.
   - If anything in 4–5 changed since it was added to the cart → **refuse, list every change, leave the cart alone** (decision).
6. **Time:** lead time from the fresh "made to order" flags; hours (or test hours, laptop only), same day, 15-minute steps.
7. **Save:** `create_order()` via the secret key: the whole order in one transaction, or nothing.

### Key concepts
- **Never trust the browser:** the cart's prices are only *compared* (to say what changed), never *charged*. A customer who edits their cart to say J$1 gets "Fry Chicken (Large) is now J$1,200 (your cart says J$1)" and nothing is saved.
- **Least privilege:** the secret key skips RLS, so we use it for as little as possible. Reading the menu uses the normal public key; only the save uses the secret key. `import "server-only"` stops browser code from ever importing it.
- **Idempotency (doing it twice = doing it once):** each checkout gets one random id (`client_request_id`). A double tap or a retry after a bad connection sends the same id, and the database returns the first order instead of making a second.
- **Server Action:** a function in a `"use server"` file. The browser calls it like a normal function, but it runs on the server and the code never reaches the browser.
- **Prices are copied into the order:** `order_items` stores the name and price at the moment of ordering, so tomorrow's price change doesn't change today's order.

### Possible lecturer questions
- *What stops a customer from paying less by editing their cart?* The server reads every price from the database and refuses the order if the cart's prices don't match.
- *Why is the secret key needed at all?* Customers aren't allowed to insert orders (RLS), and only our server may run `create_order()`. The server proves it's the server with the secret key.
- *What happens if the Manager changes a price while I'm checking out?* The order is refused with a message saying exactly what changed; you update your cart and try again.

### Fix: a second checkout still showed "Order #1001 placed"
- **Symptom:** after placing an order, adding a new item and tapping Checkout showed the old "Order #1001 placed" message instead of the form.
- **Cause:** with our Next.js setting (`cacheComponents`), leaving a page doesn't remove it. Next.js **hides** it (React's `<Activity>`) and keeps its state, so Back is instant. The checkout form still remembered `placedOrderId = 1001`.
- **Fix:** in `CheckoutForm.tsx`, a `useLayoutEffect` **cleanup** (the function it returns) runs when the page is hidden. If an order was placed (`shouldResetRef`), it clears every choice and message, so the next visit starts fresh. Mid-checkout choices are still kept if you just pop over to the cart.
- **Lesson:** in this Next.js version, a page's state survives navigation. Decide for each piece of state whether it should be kept (a half-filled form) or reset (a "done" message).

## Part 22: The order confirmation page ("invoice")
After "Place order", the customer goes to **`/orders/1001`**. It shows the **Order ID** (big, for SAF-1), when it was placed, **pickup or delivery** (and where), **when** it will be ready, every **item** (size, extras with prices, meal note), the **totals** and the **payment method**. The Lynk QR code and payment instructions come in Part 23 (Junelle); live status comes in Build step 5.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/app/orders/[id]/page.tsx` | Presentation | **New.** The page. Customers only (`requireRole`, with `returnTo` so a logged-out visitor comes back after logging in). Shows "Order not found" for a wrong, missing or someone else's number. |
| `src/lib/orders/get-order.ts` | Application (server only) | **New.** `getOrderForCustomer(id, customerId)`: ONE query that brings the order with its location, payment, items and extras. Uses the **logged-in** connection, so RLS applies. |
| `src/lib/order-rules.ts` | Application | **New helper** `formatJamaicaDateTime()`: "Mon 23 Nov, 12:05 p.m." |
| `src/components/CheckoutForm.tsx` | Presentation | On success: empty the cart, then `router.replace("/orders/<id>")`. |
| `CLAUDE.md` | n/a | Records the Part 22 / Part 23 split and the page decisions. |

### Key concepts
- **Dynamic route:** a folder named `[id]` makes ONE page file serve every order: `/orders/1001`, `/orders/1002`... The part after `/orders/` arrives as `params.id`. In this Next.js version `params` is only known when someone visits, so the page uses it inside `<Suspense>`.
- **RLS does the hiding, not the page:** we read with the customer's own login, so the database only returns THEIR orders. We also add `.eq("customer_id", …)` ourselves: two locks. The secret key is NOT used here, because it would skip RLS.
- **Same message for "not yours" and "doesn't exist":** otherwise someone could try numbers and learn which orders exist.
- **Embedded select:** `orders.select("…, order_items ( …, order_item_customizations ( … ) ), payments ( method )")` lets Supabase follow the foreign keys and return everything in one trip to the database.
- **Prices from the order, not the menu:** the page shows the prices saved when the order was placed, so a later menu change doesn't rewrite the invoice.
- **`router.replace` vs `router.push`:** replace swaps the current page in the history, so Back from the confirmation skips the used-up checkout.

### Possible lecturer questions
- *What if I type someone else's order number in the address?* RLS returns nothing, so you see "Order not found", exactly like a number that doesn't exist.
- *Why not use the secret key to read the order?* It skips RLS. Reading with the customer's own login means the database itself guarantees they only see their own orders.
- *If the Manager changes a price tomorrow, does my invoice change?* No. The price is copied into `order_items` when you order.

## Part 23: How to pay (sample Lynk QR, cash instructions)
The confirmation page now has a **"How to pay"** box (FR-02):
- **Lynk:** a **SAMPLE** QR code, the **amount** (order total), the **payment reference** (the Order ID), the **Lynk ID** to type into the Lynk app, and "A supervisor will confirm your payment."
- **Cash + pickup:** "Pay J$X at the counter." **Cash + delivery:** "Pay J$X to the driver when your food arrives."

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/payments/lynk.ts` | Application (external service: Lynk) | **New.** `generateLynkQRCode({ orderId, amount })` (SDS name): who to pay, how much, the reference, and a sample QR pattern (`isSample: true`). |
| `src/components/PaymentInstructions.tsx` | Presentation | **New.** Draws the box: the QR as an SVG picture with a red SAMPLE band, or the cash message. |
| `src/lib/store-info.ts` | Application | **New values** `LYNK_ID` / `LYNK_ID_CONFIRMED`: The Spot's Lynk ID, a sample for now. |
| `src/app/orders/[id]/page.tsx` | Presentation | Shows `<PaymentInstructions>` under the order details. |

### Key concepts
- **Simulating an external service:** we're not connected to Lynk, so `generateLynkQRCode()` makes a picture that only *looks* like a QR code (no phone can scan it) and says `isSample: true`. When Lynk is really connected, only this one function changes; the page stays the same. That's the point of keeping external services in the Application layer.
- **Pseudo-random:** the pattern comes from a formula (mulberry32) that gives random-looking numbers, but the SAME numbers for the same starting value ("seed"). The seed is the Order ID + amount, so order 1001 always shows the same pattern and 1002 a different one. `Math.random()` would change it on every refresh.
- **Why the Order ID is the reference:** the Supervisor (who verifies Lynk payments) sees "1001" on the payment and knows which order it's for.
- **Why also a Lynk ID:** most customers order on their phone and can't scan a QR code on their own screen; they type the ID into the Lynk app instead.
- **Why "[sample Lynk ID]" and not "@thespot":** a made-up handle might belong to a real person, and a customer could send them real money. The bracketed placeholder can't be a real account.
- **SVG:** a picture described as shapes. One `<path>` draws all the little squares, so it stays sharp at any size and needs no image file or package.

### Possible lecturer questions
- *Can a customer really pay with this QR code?* No. It's a clearly marked sample; the real Lynk connection is simulated for now (SRS: external services simulated).
- *How does the Supervisor know which order a Lynk payment belongs to?* The customer uses the Order ID as the payment reference.
- *What changes when the client gives the real Lynk ID?* One line in `store-info.ts` (and `LYNK_ID_CONFIRMED = true`); no other code.

## Step 24: The staff live order queue (FR-03)
`/staff` is now the counter staff's **live queue**: every **active** order (Pending, In progress, Ready for pickup, Being delivered), **oldest first**, so new orders arrive at the **bottom** as **Pending**. Each card shows the **Order ID**, **items** (size, extras, meal notes), **order time**, **Ready by**, **pickup or delivery** (and where) and the **status**. New orders appear **within seconds without refreshing**. Status buttons and "Past Orders" come in Step 26; the server's status rules in Step 28.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0007_staff_order_access.sql` | Data | **New.** RLS: counter staff may **read** all orders, items and extras (still no writing). Adds `orders` to Supabase Realtime. |
| `supabase/tests/0007_staff_queue_checks.sql` | Data | **New.** 5 checks: staff see all; customers still only their own; other roles see none; staff can't update directly; Realtime is on for orders. |
| `src/lib/order-status.ts` | Application | **New.** The 7 status names (must match the database), `ACTIVE_STATUSES`, and labels like "Ready for pickup". |
| `src/lib/orders/get-queue.ts` | Application (server only) | **New.** `getActiveOrders()`: active orders with items, extras and location, oldest first, read through RLS. |
| `src/components/StaffQueue.tsx` | Presentation (browser) | **New.** The cards, the Realtime subscription, the "● Live" label. |
| `src/app/staff/page.tsx` | Presentation | Placeholder replaced by the queue; `requireRole(["counter_staff"])` stays. |

### Key concepts
- **Supabase Realtime:** the database sends a short message to every connected browser when a row in a "published" table changes. We published only `orders`.
- **Subscribe, then refresh:** on each message the queue calls `router.refresh()`, so the server builds the queue again. The message alone doesn't contain the items; re-reading keeps ONE way of building the queue.
- **Realtime respects RLS:** each listener only hears about rows they're allowed to read. A customer would only hear about their own orders; staff hear about all.
- **Policies add up:** a row is visible if ANY policy allows it, so adding a staff policy doesn't change what customers see.
- **Read-only staff access:** staff can READ orders, but changing a status will only be possible through a server rule (Step 28), so "status only moves forward" can't be skipped from the browser.
- **Cleanup:** the subscription is closed when the queue is hidden or left, and opened again (with one refresh) when it comes back, so no order is missed.

### Possible lecturer questions
- *How does a new order reach the staff screen within 3 seconds?* Realtime sends a message when the `orders` row is inserted; the queue re-reads the active orders immediately.
- *Could a customer use Realtime to spy on other orders?* No. Realtime applies the same RLS rules, so they'd only hear about their own.
- *Why can't staff just update the status in the database?* The grants only allow SELECT. Status changes go through the server, where the forward-only rule lives.

## Step 25: Order details for counter staff (FR-03, SR-3.2 / AC-1)
Tapping an order in the queue opens **`/staff/orders/1004`**: the Order ID and status, the **customer's name and phone** (tap to call), every **item** (size, extras with prices, meal note, line total), **pickup or delivery** location, **ready by**, **order time**, **payment method** and **totals**. View only: status buttons come in Step 26. It updates live if the order changes.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0008_staff_order_details.sql` | Data | **New.** Counter staff may read the profiles of **customers who have an order** (not other staff), and all payments. Read-only. |
| `supabase/tests/0008_staff_order_details_checks.sql` | Data | **New.** 4 checks: staff see name/phone/payment; staff can't see other staff or customers without orders; customers still only see themselves; other roles see nothing. |
| `src/lib/orders/get-order.ts` | Application (server only) | **Reorganised.** One shared query + one conversion; `getOrderForCustomer()` (Part 22) and the new `getOrderForStaff()` (adds the customer's name and phone). |
| `src/app/staff/orders/[id]/page.tsx` | Presentation | **New.** The details page (counter staff only, "Order not found" for a bad number). |
| `src/components/OrderLiveRefresh.tsx` | Presentation (browser) | **New.** The Realtime "listen, then refresh" logic and the "● Live" label, shared by the queue and the details page. Can listen to ONE order (`filter: id=eq.1004`). |
| `src/components/StatusBadge.tsx` | Presentation | **New.** The coloured status label, the same on every screen. |
| `src/components/StaffQueue.tsx` | Presentation | Cards are now links to the details. Uses `OrderLiveRefresh`, so it no longer needs `"use client"` (drawn on the server). |

### Key concepts
- **Least privilege in RLS:** staff need customers' phone numbers, but not other staff accounts or people who never ordered. The rule is "counter staff AND the profile is a customer AND that customer has an order".
- **Why there's no loop between rules:** the profiles rule looks at orders; the orders rule calls `current_user_role()`, which reads profiles as its owner ("security definer") and skips RLS.
- **Don't repeat yourself:** the customer page and the staff page read an order with the SAME query and conversion, so they can't drift apart. The same goes for `OrderLiveRefresh` and `StatusBadge`.
- **Server vs browser components:** once the live part moved into its own small browser component, the queue list could be drawn on the server, which means less JavaScript sent to staff phones.
- **Privacy by design:** a customer's phone number is only loaded when staff open THAT order, not for every order in the queue.

### Possible lecturer questions
- *Can counter staff see the manager's phone number?* No. They can only read profiles of customers who have placed an order.
- *Why a separate page instead of a pop-up?* Easier on phones, Back returns to the queue, and phone numbers are only sent when needed.
- *What happens if the status changes while I'm looking at an order?* The page listens to that order through Realtime and refreshes itself.

## Step 26: Status buttons and Past Orders (FR-03, SR-3.4 / SR-3.5 / AC-3)
The staff order details page has an **Actions** box with **one button for the next step only** (e.g. "Mark In progress") and **Cancel order** (with "Are you sure?"). Every change is saved with **who** made it and **when** in `order_status_history`. `/staff` has a **Past orders (today)** section for Completed, Cancelled and Abandoned orders. Everything updates live. No Abandoned button yet; the full rules are Step 28 (Evon).

| Status now | Pickup: next | Delivery: next |
|---|---|---|
| Pending | In progress | In progress |
| In progress | Ready for pickup | Ready for pickup |
| Ready for pickup | Completed | Being delivered |
| Being delivered | (never) | Completed |
| Completed / Cancelled / Abandoned | finished | finished |

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0009_order_status_changes.sql` | Data | **New.** `change_order_status()`: updates the status AND adds the history row in ONE transaction, only if the status is still what staff saw. Only the server may run it. |
| `supabase/tests/0009_order_status_checks.sql` | Data | **New.** 3 checks: status + history saved together; "someone else changed it" changes nothing; staff can't run it themselves. |
| `src/lib/order-status.ts` | Application | **Added** `nextStatus()`, `FINAL_STATUSES`, `isFinalStatus()`. |
| `src/lib/orders/status-rules.ts` | Application | **New.** `checkStatusChange()`: THE rule (Step 26 minimum). Marked "STEP 28 (Evon)" where the full rules go. |
| `src/lib/orders/status-actions.ts` | Application | **New.** `updateOrderStatus()` Server Action: counter staff only → fresh order → rule → save. |
| `src/components/StatusButtons.tsx` | Presentation (browser) | **New.** Next-step button, Cancel with confirmation, "Saving…", messages. |
| `src/app/staff/orders/[id]/page.tsx` | Presentation | Shows the Actions box. |
| `src/lib/orders/get-queue.ts` | Application | **Added** `getPastOrders()`: today's finished orders, newest first. |
| `src/components/StaffQueue.tsx`, `src/app/staff/page.tsx` | Presentation | The Past Orders section (loaded together with the queue). |
| `src/lib/order-rules.ts` | Application | `jamaicaDayStart()` is now exported ("today" in Jamaica time). |

### Key concepts
- **Buttons show, the server decides:** the page only shows the next step, but a request can be sent without the page. So the server action checks again with the SAME `nextStatus()` the buttons use.
- **One transaction for status + history:** like `create_order`, the database function saves both or neither, so there's never a status change without a record of who made it.
- **Optimistic check ("someone else just changed it"):** the browser sends the status it SAW; the database only updates if it's still that status. Two staff tapping at once can't skip a step.
- **Audit trail:** `order_status_history` (status, changed_by, changed_at) shows who did what and when. Step 28 uses it for the 20-minute Abandoned rule.
- **A marked place for the next person:** `checkStatusChange()` is the ONE function every status change goes through, with a clear "STEP 28 (Evon)" note. That's how team members can build on each other's code safely.
- **Promise.allSettled:** the queue and Past Orders load at the same time; if one fails, the other still shows.

### Possible lecturer questions
- *What stops staff from moving an order from Pending straight to Completed?* The page doesn't offer it, and the server refuses anything except the next step or Cancel.
- *How do you know who cancelled an order?* `order_status_history.changed_by` records the staff member's id, and `changed_at` records when.
- *What if two staff tap at the same time?* The database only changes the status if it's still what they saw; the second person gets "just updated by someone else".

## Step 27: Pickup handover: Order ID check and cash received (FR-03, SAF-1, FR-06)
When a **pickup** order's next step is Completed, the button is **"Hand over order"**. Staff type the **Order ID the customer gives them**; if it doesn't match, it's blocked ("Check you have the right bag…"). For an **unpaid cash** order they must also tick **"Cash received (J$X)"**, and the payment becomes **PAID** in the **same** server step as the status change. **Lynk** orders can be handed over too, but stay **Unpaid** (the Supervisor verifies them, Build step 7). **Delivery** orders are unchanged (driver handover: Build step 6). Staff now see the payment status on the details page.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0010_pickup_handover.sql` | Data | **New.** Allows `PAID`; adds `paid_at` / `paid_by` (a PAID payment must say when and by whom); `change_order_status()` gets `p_cash_received`: marks an UNPAID **cash** payment PAID in the same transaction, refuses Lynk. |
| `supabase/tests/0010_pickup_handover_checks.sql` | Data | **New.** 5 checks: completed + history + paid together; Lynk refused; cash only with Completed; PAID needs who/when; staff can't change payments themselves. |
| `src/lib/orders/status-rules.ts` | Application | **Added** `needsPickupHandover()`, `cashToCollect()`, `checkPickupHandover()`. |
| `src/lib/orders/status-actions.ts` | Application | `updateOrderStatus` takes the handover form, reads the payment fresh, checks it, passes "cash received" to the database. |
| `src/lib/order-status.ts` | Application | **Added** payment names and labels (`PaymentMethod`, `PaymentStatus`). |
| `src/lib/orders/get-order.ts` | Application | Also loads the payment status and amount. |
| `src/components/StatusButtons.tsx` | Presentation | The "Hand over order" form (number keypad, cash tick, Lynk note). |
| `src/app/staff/orders/[id]/page.tsx` | Presentation | Passes the payment; shows "Cash · Paid" / "Lynk · Unpaid". |

### Key concepts
- **SAF-1 in practice:** the check catches the WRONG BAG: staff have #1004 open, the customer says 1007, the system stops the handover.
- **All or nothing:** COMPLETED, the history row and the cash PAID are one database transaction. If marking the cash fails, the order is NOT completed either: never "completed but the cash wasn't recorded".
- **Defence in depth:** the page checks the ID instantly (a hint); the server checks again with the same function; the database only marks CASH (never Lynk) as paid, and won't accept PAID without who and when.
- **Why PAID matters (FR-06):** revenue reports count PAID orders only, so cash has to be marked paid at the moment it's received.
- **Default values keep old code working:** `p_cash_received boolean default false` means every Step 26 call still works unchanged.

### Possible lecturer questions
- *What if staff hand over the wrong order?* They must type the customer's Order ID; a different number is blocked.
- *How do you know who took the cash?* `payments.paid_by` and `paid_at`, saved in the same transaction as the COMPLETED status.
- *Why isn't a Lynk order marked paid when it's handed over?* FR-02: the Supervisor verifies Lynk payments. The counter can't see whether the money really arrived.

## Step 28: Full status rules + Abandoned (FR-05 SR-5.3 / SR-5.5)
The status rules are now **complete and enforced twice**: by the server (with a clear message for each mistake) and by the **database** (a trigger, so nothing can get around them).
- **Finished orders are locked:** Completed, Cancelled and Abandoned never change again.
- **Forward only, one step at a time:** going backwards, skipping a step, or a status from the other path (e.g. "Being delivered" for a pickup order) is refused, each with its own message.
- **Cancel** is allowed from any status that isn't finished.
- **Abandoned:** pickup orders only, only from Ready for pickup, and only **20 minutes or more** after it became Ready for pickup (the time comes from `order_status_history`).
- On the staff details page: **"Ready since 2:15 p.m."**, a hint "You can mark it Abandoned from 2:36 p.m.", and from that time a **"Mark Abandoned"** button (with "Are you sure?") that appears by itself, without refreshing.

### Messages staff can see
| Mistake | Message |
|---|---|
| Finished order | "Order #1004 is already Completed. Finished orders can't change." |
| Backwards | "Order #1004 can't go back from Ready for pickup to In progress. Statuses only move forward." |
| Skip | "You can't skip steps. The next step for order #1004 is In progress." |
| Wrong path | "Pickup orders don't go to Being delivered." |
| Abandon a delivery | "Only pickup orders can be marked Abandoned." |
| Abandon too soon | "Order #1004 has been ready for 12 minutes. It can be marked Abandoned from 2:36 p.m. (20 minutes after it was ready)." |

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0011_status_rules.sql` | Data | **New.** (1) Counter staff may READ `order_status_history`. (2) The trigger `orders_enforce_status_rules` + function `enforce_order_status_rules()`: checks EVERY status change (same rules as the server). |
| `supabase/tests/0011_status_rules_checks.sql` | Data | **New.** 8 checks: 19 min refused, exactly 20 min allowed, delivery can't be abandoned, only from Ready, skip refused, backwards refused, finished locked, staff can read history (customers only their own). |
| `supabase/tests/0010_pickup_handover_checks.sql` | Data | Block 2 now walks the order to Ready first (the trigger refuses the old skip to Completed). |
| `src/lib/order-status.ts` | Application | **Added** `statusSteps()` (each path as a list), `ABANDON_AFTER_MINUTES = 20`; `nextStatus()` now reads from `statusSteps()`. |
| `src/lib/orders/status-rules.ts` | Application | `checkStatusChange(order, newStatus, now)`: the full rules. **Added** `abandonAllowedFrom()`, `formatAbandonTime()`, `findReadyForPickupAt()`. |
| `src/lib/orders/status-actions.ts` | Application | Reads the order's history fresh, passes the "ready" time and the server's clock into the rule. |
| `src/lib/orders/get-order.ts` | Application | `getOrderForStaff` also returns `readyForPickupAt`. |
| `src/components/StatusButtons.tsx` | Presentation (browser) | The hint, the "Mark Abandoned" button with confirmation, and the timer that shows the button when 20 minutes pass. |
| `src/app/staff/orders/[id]/page.tsx` | Presentation | "Ready since …"; passes the ready time to the buttons. |

### Key concepts
- **State machine:** an order can only be in one status at a time, and only certain moves are allowed. We store each path as a LIST (`statusSteps`) and compare positions: lower = backwards, two or more ahead = a skip, exactly one ahead = allowed.
- **Trigger:** a function Postgres runs automatically BEFORE every change of `orders.status`. If it raises an error, the change (and everything else in the same transaction, like the history row) is cancelled. It runs even for our secret key and the SQL Editor; that's why it's a real safety net.
- **Defence in depth:** button (a hint) → server action (decides, friendly message) → trigger (final lock). Each layer would still stop a bad change if the one before it had a bug.
- **Boundaries:** "20 minutes OR MORE" is written `>=` (TypeScript: `now < allowedFrom` → refuse; SQL: `now() < ready + 20 min` → refuse). So 19:59 is refused and 20:00 is allowed. We tested both sides.
- **`now()` is fixed inside a transaction:** Postgres gives the transaction's START time every time you call `now()`. That's why our tests can set "exactly 20 minutes ago" and get an exact result.
- **Time is passed in, not read inside:** `checkStatusChange(order, status, now)` takes the time as an input, so it can be tested by "pretending" it's 19 or 20 minutes later. The server passes its OWN clock, never a time from the browser.
- **Same first render on server and browser:** the button's clock starts at 0 and a timer sets the real time just after. If the server drew "Mark Abandoned" and the browser didn't (or the other way round), React would report a mismatch.
- **Display rounding:** allowed from 2:35:40 → we show "2:36 p.m." (rounded UP), so the time we show is always true.

### Possible lecturer questions
- *What if someone sends a request to abandon an order after 5 minutes?* The server refuses it ("has been ready for 5 minutes…"); even if that check were skipped, the database trigger refuses it.
- *Where does the 20 minutes count from?* From the `changed_at` of the READY_FOR_PICKUP row in `order_status_history`, written when staff pressed "Mark Ready for pickup".
- *Why can't delivery orders be abandoned?* The food is with the driver, not waiting at the counter; SR-5.5 is about pickup orders that nobody collects.
- *Can a manager "undo" a cancelled order in the SQL Editor?* No: the trigger runs for everyone, so finished orders stay finished.
- *What happens to the money of an abandoned order?* Unpaid cash stays UNPAID, so FR-06 doesn't count it as revenue. A verified Lynk payment would need a refund (Supervisor, Build step 7).

## Step 29: My orders + live order status for customers (FR-05 SR-5.1 / SR-5.2)
Customers now have an **"Orders"** link in the header (customers only). It opens **"My orders"** (`/orders`): their own orders, newest first, each with Order ID, date/time, pickup or delivery, total and a status badge. Tapping one opens `/orders/1004`, which now starts with an **"Order status"** box: the status badge, **one plain sentence** (e.g. "Your food is ready. Show Order ID #1004 at the counter.") and a **progress line**. Both pages are **live**: when staff press a status button, the customer's screen changes within seconds, with no refresh.

### The progress line
```
Pickup:    ✓ Pending  →  ✓ In progress  →  ● Ready for pickup  →  ○ Completed
Delivery:  ✓ Pending  →  ✓ In progress  →  ✓ Ready for pickup  →  ● Being delivered  →  ○ Completed
```
✓ = done, ● = you are here, ○ = still to come. Cancelled / Abandoned: no line, just a clear box ("This order was cancelled. Questions? Please ask at the counter.").

### Files
| File | Layer | What it does |
|---|---|---|
| `src/app/orders/page.tsx` | Presentation | **New.** "My orders": customers only, newest first, empty state with a menu link, live. |
| `src/lib/orders/get-my-orders.ts` | Application (server only) | **New.** `getMyOrders(customerId)`: the newest 50 of the customer's orders, read with the logged-in connection (RLS) + our own `customer_id` filter. |
| `src/components/OrderProgress.tsx` | Presentation | **New.** Status badge + plain sentence + progress line (steps from `statusSteps()`), or the Cancelled/Abandoned box. |
| `src/app/orders/[id]/page.tsx` | Presentation | The live "Order status" box; a "My orders" button at the bottom. |
| `src/components/OrderLiveRefresh.tsx` | Presentation (browser) | **Added** `customerId` (filter `customer_id=eq.…`); comments explain why it's safe for customers. |
| `src/components/SiteHeader.tsx` | Presentation | "Orders" link for customers. |

No database change: customers could already read only their own orders (0006), and Realtime was already on for `orders` (0007).

### Key concepts
- **Realtime respects RLS:** before Supabase sends a change to a browser, it checks whether THAT logged-in person may read the row. A customer listening to `orders` only ever hears about their own orders. The filters (`id=eq.1004`, `customer_id=eq.…`) just make the list of messages shorter; RLS is the real lock.
- **Three locks for "own orders only":** `requireRole(["customer"])` on the page, our own `.eq("customer_id", …)` in the query, and RLS in the database (and in Realtime).
- **Live = "message → re-read":** the Realtime message only says "order 1004 changed"; the page then asks the server to rebuild itself (`router.refresh()`), reading fresh through RLS. The first load and every update are built the SAME way.
- **One list of steps for everything:** the progress line uses the same `statusSteps()` as the staff rules and (the same lists as) the database trigger from Step 28, so the customer never sees a step that staff can't do.
- **Accessible progress:** an `<ol>` with `aria-current="step"` on the current step, and hidden words ("done", "current step", "next") instead of relying on ✓ / ● / ○ or colour.

### Possible lecturer questions
- *Could a customer see someone else's order by typing /orders/1005?* No: RLS hides it, our query also filters by their id, and the page shows "Order not found" (the same message as for a number that doesn't exist).
- *How does the status reach the customer within 5 seconds (PR-2)?* Staff press a button → the database row changes → Supabase Realtime sends a message to the customer's browser (usually under a second) → the page re-reads and re-draws.
- *Why not send the new status in the message and show it directly?* The message only holds the orders row. Re-reading keeps ONE way of building the page, and every read goes through RLS.

## Step 30: Customer notifications, simulated SMS/email (FR-05 SR-5.4 / AC-4)
When an order's status changes to **Ready for pickup**, **Cancelled** or **Abandoned**, the **database** automatically writes **one notification** for that customer. Nothing is really sent yet (simulated): the row records the **channel** (SMS, or EMAIL only if there's no phone), **where it went** (a copy of the phone/email), the **message** and **when**. The customer sees them on their order page under **"Messages we sent you"** (phone masked as "•••• 1234"), live.

### The messages
| Status | Message |
|---|---|
| Ready for pickup (pickup) | "The Spot: Order #1004 is ready for pickup. Show your Order ID at the counter." |
| Ready for pickup (delivery) | "The Spot: Order #1004 is ready and will leave with a driver soon." |
| Cancelled | "The Spot: Order #1004 was cancelled. Questions? Please ask at the counter." |
| Abandoned | "The Spot: Order #1004 was not collected, so it was marked abandoned. Questions? Please ask at the counter." |

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0012_notifications.sql` | Data | **New.** `notifications` table (unique per order + status), RLS (customers read their own; nobody writes with the public key), function `notify_customer_of_status()` + AFTER trigger `orders_notify_customer`. |
| `supabase/tests/0012_notifications_checks.sql` | Data | **New.** 7 checks: Ready = 1, Cancelled = 1, Abandoned adds 1, In progress = 0 (+ delivery wording), no duplicates, other customers see 0, customers can't write. |
| `src/lib/orders/get-order.ts` | Application | `getOrderForCustomer` also loads the order's notifications (newest first). New types `OrderNotification`, `CustomerOrderDetails`. |
| `src/components/OrderNotifications.tsx` | Presentation | **New.** "Messages we sent you": masked contact, time, message; a note before any message. |
| `src/app/orders/[id]/page.tsx` | Presentation | Shows the box under the order status. |

### Key concepts
- **AFTER trigger vs BEFORE trigger:** Step 28's rules run BEFORE the change (to refuse it); this one runs AFTER (to react to it). A refused change never reaches the AFTER trigger, so it never sends a message.
- **Same transaction = can't be missed:** the status change, its history row and the notification are saved together. If the notification failed, the status change would be undone too.
- **"Never twice":** a UNIQUE rule on (order_id, status), and the insert uses `on conflict do nothing`. (Step 28 already makes a status impossible to repeat; this is a second lock.)
- **security definer:** the trigger function runs with its owner's rights, because the login email is in Supabase's `auth.users` table, which normal users can't read. Nobody can call it directly.
- **Copy, don't link:** `sent_to` stores the phone/email AT THAT MOMENT, like order items store the price at that moment (Part 19). A record of what happened must not change later.
- **Live for free:** the order's Realtime message only arrives after the transaction is saved, so the page's re-read already includes the new notification. No extra subscription.
- **Simulation that fits the real thing:** a real SMS service later only has to read new rows and send them; nothing else changes.

### Possible lecturer questions
- *What if staff mark an order ready and the notification fails?* Then the whole change is undone (same transaction) and staff see "We couldn't save the change". It can't be ready without a notification.
- *Why is it in the database, not the server action?* Every way of changing a status (staff buttons now, the driver screen later) goes through the orders table, so the trigger can't be forgotten.
- *Can a customer see another customer's messages?* No: RLS only returns rows where customer_id is the logged-in user (tested in block 6).
- *Why no message for In progress?* SR-5.4 only asks for Ready, Cancelled and Abandoned; the trigger's WHEN condition only fires for those.

## Step 31: Assign delivery orders to a driver (FR-04 SR-4.1 / AC-1, TS-4.1.1 / TS-4.1.2)
On the counter staff order details page, **delivery** orders now have a **Delivery** box near the top: the **drop-off location** in large text, ready-by time, the customer (tap to call), the **driver** (or "No driver yet"), and an **"Assign driver"** list showing each driver's **active deliveries**, e.g. "Jane Brown (2 active)", fewest first. Staff can **change the driver** until the order leaves. **"Mark Being delivered"** is replaced by "Assign a driver first" until a driver is set. Queue cards show "Driver: Jane" or an amber "No driver yet".

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0013_deliveries.sql` | Data | **New.** `deliveries` table (one per order: driver, drop-off location copy, assigned_at/by, picked_up_at + delivered_at for Step 33, time rules); RLS (counter staff read deliveries + delivery staff profiles); `assign_delivery()` (server only); trigger "Being delivered needs a driver". |
| `supabase/tests/0013_deliveries_checks.sql` | Data | **New.** 12 checks: assign, change, pickup refused, non-driver refused, locked after it leaves, finished refused, no-driver Being delivered refused, "someone else changed it", active count, time rule, who can read, nobody can write. |
| `src/lib/orders/delivery-rules.ts` | Application | **New.** `canChangeDriver()`, `checkDriverAssignment()` (a message per mistake). |
| `src/lib/orders/delivery-actions.ts` | Application | **New.** `assignDriver()` Server Action: counter staff only → shape → fresh reads → rule → `assign_delivery()`. |
| `src/lib/orders/get-drivers.ts` | Application (server only) | **New.** Drivers + their active delivery count, fewest first. |
| `src/components/AssignDriver.tsx` | Presentation (browser) | **New.** The list, Assign / Change driver, "Saving…", messages. |
| `src/lib/orders/get-order.ts`, `get-queue.ts` | Application | Also load the driver. |
| `src/lib/orders/status-rules.ts`, `status-actions.ts` | Application | Being delivered needs a driver (`hasDriver`). |
| `src/components/StatusButtons.tsx`, `StaffQueue.tsx`, `src/app/staff/orders/[id]/page.tsx` | Presentation | "Assign a driver first"; driver on queue cards; the Delivery box. |

### Key concepts
- **One row per delivery, updated on change (decision: latest only):** `order_id` is UNIQUE, and `insert ... on conflict (order_id) do update` either adds the row or changes the driver in it.
- **Copy the location name:** `drop_off_location` keeps the name at assignment time, like order items keep their price.
- **Row lock (`for update`):** while one staff member assigns a driver, the order row is locked, so a second staff member at the same moment waits, then sees the first driver and gets "someone else just changed the driver".
- **"Available" without a new switch:** the list counts each driver's deliveries whose order isn't finished. The busiest drivers sink to the bottom.
- **Two links to the same table:** `deliveries` links to `profiles` twice (driver and assigned_by), so the query says which one: `driver:profiles!deliveries_driver_id_fkey ( full_name )`.
- **Live without a new Realtime table:** `assign_delivery()` "touches" the order (updated_at), and every open screen already listens to orders.
- **Rules in three layers again:** page (hint) → server action (friendly message) → database function + trigger (final lock).

### Possible lecturer questions
- *How do staff know which driver is available?* Each driver shows how many unfinished deliveries they have; fewest first.
- *Can an order go out without a driver?* No: the button is replaced, the server refuses, and the database trigger refuses BEING_DELIVERED without a deliveries row.
- *Can staff change the driver after the food has left?* No: only before Being delivered (server rule + database function).
- *Why can't staff just edit the deliveries table?* Only SELECT is granted; every change goes through the server action and `assign_delivery()`, which only the server can run.

## Known issues
- ~~Customer order page doesn't update live (since migration 0013).~~ **FIXED in Step 32** (see "Step 32" below: the browser joined Realtime before the login token had loaded).

## Step 32: The driver's screen + the "not live" fix (FR-04 SR-4.2 view part / AC-2, TS-4.1.3)

### First: what was wrong with live updates (the known issue)
**Symptom:** the customer's order page showed "● Live" but never changed when staff changed the status (data was right after a refresh).

**How we found it:** a throwaway test customer and order (deleted afterwards), first in a small script, then in a real (headless) Edge browser on the running app:
1. In the script, Realtime delivered the change to the customer in ~0.35 s, so the **database, RLS and Realtime were fine** (and migration 0013 was not the cause).
2. In the browser, the Realtime server answered: *"Unable to subscribe to changes ... invalid column for filter id"*, and the browser's join message carried **no login token**.

**The cause:** the Supabase browser client loads the login token from the cookies **in the background**. `OrderLiveRefresh` joined the channel **before** that finished (and in development React mounts it twice: join → leave → join, all before the token). Without a token, Realtime treats you as a **logged-out visitor** (`anon`), who may not read `orders` (RLS). With a filter like `id=eq.1004`, Realtime then REFUSES the subscription. Our label only looked at the first "ok" reply, so it still said "● Live". (It's a timing race, which is why it hadn't shown up before: it depends on how fast the token loads, e.g. a full page load vs arriving by a link inside the app.)

**The fix (in `OrderLiveRefresh.tsx`):**
1. read the session first (`supabase.auth.getSession()`) and hand the token to Realtime (`supabase.realtime.setAuth(token)`), THEN join;
2. if the screen goes away while we're getting ready, don't join at all (`cancelled`);
3. listen to the server's `system` messages: if it says `status: "error"`, the label shows **"Live updates off: refresh the page"** instead of lying.

Verified in the headless browser: the join now carries an `authenticated` token, Realtime says "Subscribed to PostgreSQL", and the page went Pending → In progress by itself.

### Then: the driver's screen
`/driver` now shows the logged-in driver's deliveries:
- **To deliver** (earliest ready-by first): Order ID, status, **drop-off location** (large), ready-by, **customer + "Call" link**, items (extras, notes), total, and the **money line**: "Collect cash: J$1,400" (cash, unpaid), "Paid by Lynk: don't collect money", or "Paid: nothing to collect".
- **Done today**: today's Completed / Cancelled deliveries.
- **Live**: Realtime (only the driver's own orders, by RLS) **plus a refresh every 30 seconds and when the driver comes back to the app**, because a driver who LOSES a delivery (moved to another driver) can no longer read that order, so Realtime can't tell them.
- View only: the buttons and Order ID check come in Step 33.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/components/OrderLiveRefresh.tsx` | Presentation (browser) | **The fix** (token first, then join; "Live updates off" on a refused subscription) + optional `refreshEverySeconds` and refresh-on-return. |
| `supabase/migrations/0014_driver_access.sql` | Data | **New.** Read-only RLS for drivers: own deliveries, those orders, items, extras, payments, and those customers' profiles. |
| `supabase/tests/0014_driver_access_checks.sql` | Data | **New.** 7 checks: driver sees own; other driver sees none; no unassigned / pickup orders; reassignment moves access; no other profiles; can't write; others unchanged. |
| `src/lib/orders/get-driver-deliveries.ts` | Application (server only) | **New.** The driver's deliveries in two groups (own login + our own driver_id filter). |
| `src/components/DriverDeliveries.tsx` | Presentation | **New.** Cards, money line, Done today. |
| `src/app/driver/page.tsx` | Presentation | Replaces the placeholder. |

### Key concepts
- **Who is listening matters to Realtime:** every Realtime subscription is checked against RLS as the person whose token it carries. No token = logged-out visitor.
- **Race condition:** two things happen "at the same time" and the result depends on which finishes first (token loading vs joining). Fix it by making one wait for the other (`await`).
- **An honest status label:** show what the server actually said, not what we hoped.
- **RLS that follows the assignment:** a driver's access is "orders that have a delivery row with my driver_id". Change the driver and the access moves with it, with no extra code.
- **Why a timed refresh too:** Realtime only tells you about rows you can STILL read. Losing access is invisible to it.

### Possible lecturer questions
- *Why did the page say "Live" when it wasn't?* The first reply said "ok"; the refusal came a moment later in a separate "system" message we weren't listening to. Now we are.
- *Can a driver see other drivers' deliveries?* No: RLS only returns deliveries (and their orders, items, payments, customers) where driver_id is the logged-in driver (tested in blocks 2-4).
- *How does the driver know to collect cash?* The card shows "Collect cash: J$X" for unpaid cash orders; Lynk orders say not to collect.

## Step 33: The driver's buttons: Being delivered + handover (FR-04 SR-4.2 / SR-4.3 / SR-4.4, AC-2-AC-4, SAF-1, FR-06)
Each delivery card on `/driver` now has the driver's **one next step**:
| Order status | The driver sees |
|---|---|
| Pending / In progress | "Not ready yet: wait for the counter" |
| Ready for pickup | **Mark Being delivered**, then "Leaving now with order #1004? **Yes, leaving now** / Not yet" (statuses can't go back, so a mis-tap mustn't count) |
| Being delivered | **Hand over**: type the customer's Order ID (wrong number = blocked), tick "Cash received (J$X)" for unpaid cash, **Complete handover** |
| Completed / Cancelled | moves to "Done today" ("Delivered 1:05 p.m.") |

**Counter staff (decision B):** no "Mark Being delivered" for delivery orders any more (a note says the driver does it). They keep **Cancel** and a **"Complete delivery (backup)"** button with the same handover form, for when the driver can't (e.g. phone died), so no order is stuck "open" and blocks the daily closeout (FR-06).

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0015_driver_status.sql` | Data | **New.** `driver_change_delivery_status()` (server only: assigned driver only, only Being delivered / Completed, unpaid cash needs "cash received", then REUSES `change_order_status()`); trigger `orders_record_delivery_times` fills `picked_up_at` / `delivered_at`. |
| `supabase/tests/0015_driver_status_checks.sql` | Data | **New.** 9 checks: Being delivered + picked_up_at; not my delivery; too early; cash handover → PAID by driver + delivered_at; cash not confirmed refused; Lynk stays unpaid; no skipping; counter backup; nobody can call it directly. |
| `src/lib/orders/delivery-rules.ts` | Application | **Added** `checkDriverStatusChange()`, `counterDeliveryProblem()`. |
| `src/lib/orders/delivery-actions.ts` | Application | **Added** `updateDeliveryStatus()` (the driver's Server Action). |
| `src/lib/orders/status-rules.ts` | Application | The handover check is now SHARED: `checkHandover()`, `needsHandover()`, `readHandover()` (were pickup-only). |
| `src/lib/orders/status-actions.ts` | Application | Counter: no Being delivered for delivery orders; Completed for delivery = backup with the handover check. |
| `src/components/DriverActions.tsx` | Presentation (browser) | **New.** The driver's buttons, "Leaving now?" and the handover form. |
| `src/components/StatusButtons.tsx` | Presentation | Note instead of "Mark Being delivered"; "Complete delivery (backup)". |
| `src/components/DriverDeliveries.tsx`, `get-driver-deliveries.ts`, `src/app/driver/page.tsx` | Presentation / Application | Buttons on each card; "Delivered H:MM" in Done today. |

### Key concepts
- **Reuse instead of copy:** the driver's save calls the SAME `change_order_status()` as the counter, so the history row, cash PAID (paid_at, paid_by), the Step 28 rules trigger, the "needs a driver" trigger and the notifications all work for drivers with no new code. The handover check is the SAME function at the counter and at the drop-off.
- **Layers again:** page (quick hint) → server action (who + my delivery + rules + typed Order ID) → database function (assigned driver + cash rule) → triggers (status rules, times).
- **Times recorded by a trigger:** `picked_up_at` / `delivered_at` are filled when the STATUS changes, so they're right whichever path made the change (driver or counter backup).
- **Who received the cash:** `payments.paid_by` is the driver (or the counter staff member for the backup). FR-06 closeout can later compare cash per person.
- **SAF-1 is a server check:** only the server knows what the driver typed; the database can't, so the typed Order ID is checked in `checkHandover()` on the server (and as a hint on the page).

### Possible lecturer questions
- *What stops a driver completing someone else's delivery?* RLS hides other drivers' orders, the server checks "is it mine", and the database function checks the assigned driver again (tested in block 2).
- *What if the driver forgets to collect the cash?* They can't complete a cash order without ticking "Cash received", and the database refuses it too (block 5). That keeps FR-06 revenue correct.
- *What if the driver's phone dies on the way?* Counter staff use "Complete delivery (backup)" with the same Order ID and cash checks, recorded under their name.
- *How do you know how long a delivery took?* `deliveries.picked_up_at` and `delivered_at` (SR-4.3).

## Step 34: Daily Sales Summary (FR-06 SR-6.1 / SR-6.2 / SR-6.3 / SR-6.10, AC-6.1 to AC-6.3)
`/manager` now shows the **Daily Sales Summary** for a chosen business day (default today, Jamaica time); counter staff see **today only** at `/staff/sales` ("Today's sales" link on the queue).

### What it shows (and the rules)
| Figure | Rule |
|---|---|
| Orders (paid) | orders placed that day whose payment is **PAID** and that are **not** Cancelled / Abandoned |
| Gross sales | total of those orders (items + delivery fees); delivery fees shown as "of which" |
| Refunds | **J$0** until Step 38 (refunds table); the place is marked "STEP 38" in the SQL |
| Net sales | gross sales − refunds |
| By payment type | Lynk / Cash: transactions, amount, refunds, net, **% of net sales** |
| Warning | red box if the payment-type totals ≠ net sales (AC-6.3) |
| For information | Cancelled, Abandoned, and **Not counted** (unpaid, e.g. Lynk waiting for the Supervisor) |

A **business day** = midnight to midnight **Jamaica time**; an order belongs to the day it was **placed**.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0016_sales_summary.sql` | Data | **New.** Index on `orders.created_at`; `daily_sales_summary(p_day)`: all figures in one query, with the role + date check inside (manager any day, counter staff today only, others refused). |
| `supabase/tests/0016_sales_summary_checks.sql` | Data | **New.** 6 checks with KNOWN numbers (test day 15 Jan 2020): the full summary, the mismatch warning, counter staff past day refused / today OK, driver (and customer) refused, empty day. |
| `src/lib/reports/get-sales-summary.ts` | Application (server only) | **New.** `jamaicaToday()`, `parseReportDay()` (valid, not future), `getSalesSummary()` (calls the function with the person's own login). |
| `src/components/SalesSummary.tsx` | Presentation | **New.** Figures, breakdown table, warning, info lines (shared by both pages). |
| `src/app/manager/page.tsx` | Presentation | Replaces the placeholder: date picker (plain GET form, `?date=`) + summary. |
| `src/app/staff/sales/page.tsx` | Presentation | **New.** Counter staff, today only. |
| `src/components/StaffQueue.tsx` | Presentation | "Today's sales" link. |

### Key concepts
- **Let the database do the maths:** exact money (`numeric`), one fast query, no rounding errors from JavaScript. The browser only shows the result.
- **Index:** like a book's index: Postgres jumps straight to one day's orders instead of reading every order (the 3-second target).
- **A function that returns only totals (least privilege):** the Manager gets the numbers without being able to read every order and customer. It runs as its owner (`security definer`) but checks the role FIRST.
- **The access rule lives in TWO places:** the page (who may open it) and the function (which day each role may see). Typing `?date=yesterday` on `/staff/sales` changes nothing.
- **A check that really checks (AC-6.3):** the breakdown is added up from `payments.amount`, net sales from `orders.total`. If a payment record doesn't match its order, the two differ and the warning appears.
- **Time zones:** `timestamp '2020-01-15 00:00' at time zone 'America/Jamaica'` = "midnight on that day IN Jamaica" as an exact moment; the server itself runs on UTC.

### Possible lecturer questions
- *Why doesn't a cancelled order count even if it was paid?* FR-06: revenue excludes cancelled and abandoned orders (a paid-then-cancelled order needs a refund, Step 38).
- *Why is Lynk often 0?* Lynk payments only count once the Supervisor has verified them (PAID); until then they're in "Not counted".
- *Can counter staff see yesterday's sales?* No: there's no date picker for them, and the database function refuses any day but today for counter staff (tested in block 3).
- *How is % of net sales worked out?* Each type's net ÷ total net × 100, rounded to 1 decimal; on a day with no sales it's 0 (no division by zero).

## Step 35: Item Volume Report + date ranges (FR-06 SR-6.4 / SR-6.5, AC-6.4 / AC-6.5)
The Manager's page (`/manager`, now "Sales reports") can show **one day or a range of up to 31 days** (From / To, plus quick links Today, Last 7 days, This month):
- **Range:** a **Daily totals** table (one line per day, days with no sales show 0, then a Total line) and the combined summary (the same figures as Step 34) for the whole range.
- **Item volume** (for the day or range): **one line per item AND size**, e.g. "Fry Chicken (Large)", with category, quantity sold and revenue; sorted by quantity (default), revenue or name; filtered by category and by order type (pickup / delivery). A check line shows that item revenue = gross sales − delivery fees.

Counter staff are unchanged (today only, `/staff/sales`).

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0017_item_volume_and_ranges.sql` | Data | **New.** `report_orders()` (THE shared "which orders count" rule, nobody may call it directly), `report_summary()`, `daily_sales_summary()` rewritten to use them, `sales_range_summary()` and `item_volume_report()` (Manager only, 1-31 days, no future). |
| `supabase/migrations/0018_fix_sales_range_summary.sql` | Data | **New (fix).** `sales_range_summary()` again, computing each day's totals FIRST, then listing them (see "Bug we fixed" below). |
| `supabase/tests/0017_item_volume_checks.sql` | Data | **New.** Block 1 checks ALL the known numbers at once (sorts, filters, sizes, item total = gross − fees, daily totals, one-day range = daily summary); date rules; who; counter staff today still works. |
| `src/lib/reports/get-sales-summary.ts` | Application | **Added** `parseReportRange()`, `getSalesRange()`, shared `toSummary()` and `safeMessage()`. |
| `src/lib/reports/get-item-volume.ts` | Application (server only) | **New.** `readItemFilters()` (only known values), `getItemVolume()`. |
| `src/components/DailyTotals.tsx` | Presentation | **New.** The per-day table + Total. |
| `src/components/ItemVolumeReport.tsx` | Presentation | **New.** Filters (GET form) + item table + check line. |
| `src/app/manager/page.tsx` | Presentation | From / To + quick links; summary or range; item report. |

### Key concepts
- **One rule, one place:** "which orders count" is written ONCE (`report_orders`). The daily summary, the range and the item report all use it, so they can never disagree.
- **Helpers nobody can call:** `report_orders` returns real order rows, so its EXECUTE right is removed from everyone; only our checked report functions (which run as the owner) use it.
- **generate_series:** makes a row for every day in the range, so a day with no sales still shows a 0 line.
- **Group by item and size:** sizes have different prices, so "Fry Chicken (Large)" and "(Small)" are separate lines.
- **Built-in cross-check:** item revenue + delivery fees = gross sales. If not, something is wrong with the data, and the page says so.
- **WITH ORDINALITY** (in the test): numbers the rows of a function's result in the order it returned them.
- **Forms that carry each other's choices:** hidden fields keep the dates when changing filters, and the filters when changing dates.

### Bug we fixed: "aggregate function calls cannot be nested"
The first version of `sales_range_summary()` (0017) did two "squeezes" in ONE step: `jsonb_agg(...)` (squeeze all the days into one list) with `count()` / `sum()` (squeeze each day's orders into totals) INSIDE it. Postgres can't nest aggregates like that. The fix (0018) does it in two steps: a `per_day` CTE adds up each day (`group by day`), then `jsonb_agg` lists those day rows. Because 0017 had already been run, the fix is a NEW migration with `create or replace function`, not an edit to 0017: migrations are a history, each run once, in order.

### Possible lecturer questions
- *Why does "Fry Chicken" appear twice?* Once per size, because each size has its own price and the kitchen plans by size.
- *How do you make sure the item report and the sales summary agree?* Both use the same database rule for which orders count, and the page checks item revenue = gross sales − delivery fees.
- *Why limit ranges to 31 days?* It covers a monthly report and meets the SRS speed target (10 s for 31 days); longer exports can come later.
- *Can counter staff see the item report?* No: the database functions are Manager only, and counter staff's page has no ranges or item report.

## Step 36: Daily closeout (FR-06 SR-6.6 / SR-6.7 / SR-6.8 / SR-6.10)
A **Daily closeout** box on `/manager` (when ONE day is chosen) and on `/staff/sales` (today):
1. **Count the cash** (counter staff: today only; Manager: any day up to today): type the cash in the till; the box shows **expected cash** (paid cash orders), the **difference** (live), and asks for an **explanation** when the difference is more than the limit (J$500 by default, over OR short).
2. **Approve and lock** (Manager only): the day's figures are saved and the day is **locked**.
3. **Reopen** (Manager only, with a written reason): unlock; then count and approve again.

**Open orders** (Pending, In progress, Ready, Being delivered) block counter staff; the Manager can close anyway only with an **override reason**, and those orders are then frozen until a reopen. A range on `/manager` shows a **Closed** column (✓ / –).

### What "locked" means (enforced by the DATABASE)
For an order **placed on a locked day**: the order (status included), its payment and its delivery can't change; and **no new order** can be placed on a locked day ("The Spot has closed for today. Please order tomorrow.").

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0019_daily_closeout.sql` | Data | **New.** `store_settings` (cash difference limit), `daily_closeouts` (SDS DailyCloseout, `is_locked`), `daily_closeout_events` (history with reasons), lock triggers on orders / payments / deliveries, `submit_closeout_count`, `approve_closeout`, `reopen_closeout`, `set_cash_difference_limit` (server only), `closeout_details` (read, role-checked). |
| `supabase/tests/0019_closeout_checks.sql` | Data | **New.** 12 checks: open order blocks counter staff, within / over the limit, counter staff past day / approve refused, approve + lock, the lock holds, figures changed, override, reopen, who sees, no direct writes, details. |
| `src/lib/reports/closeout-rules.ts` | Application | **New.** `parseCashAmount()`, `needsExplanation()`, `cashDifference()` (in cents). |
| `src/lib/reports/closeout-actions.ts` | Application | **New.** The four Server Actions (role check, values, then the database with the secret key; our own database messages shown as they are). |
| `src/lib/reports/get-closeout.ts` | Application (server only) | **New.** `getCloseout(day)`, `getClosedDays(start, end)`. |
| `src/components/CloseoutPanel.tsx` | Presentation (browser) | **New.** Status, open orders, count form, approve, reopen, history, limit. |
| `src/app/manager/page.tsx`, `src/app/staff/sales/page.tsx`, `src/components/DailyTotals.tsx` | Presentation | The box; the Closed column. |
| `src/lib/orders/actions.ts` | Application | `placeOrder` shows "closed for today" plainly. |

### Key concepts
- **A lock enforced by triggers:** the database itself refuses any change to a locked day's orders, payments and deliveries, whoever tries (server, driver, SQL Editor). The app can't forget it.
- **Re-check at approval:** expected cash is worked out AGAIN when approving; if it changed since the count (a late cash order), approval is refused, so the saved difference is always true.
- **Snapshot:** at approval the day's figures are saved (`summary`), so the closed day's record never changes.
- **History, not overwrite:** every count, approval and reopen (with its reason) is a NEW row in `daily_closeout_events`; nothing is lost when a day is reopened twice.
- **One-row settings table:** `store_settings` has exactly one row (`id` can only be `true`); the Manager changes the limit without a code change (maintainability).
- **Error codes:** our own `raise exception` messages arrive with code `P0001`, so the app can show them as they are, and hide anything unexpected behind "try again".
- **Money in cents:** counted − expected is worked out in whole cents, so J$0.30 − J$0.10 is exactly J$0.20.
- **A clear "closed" message everywhere:** when the lock refuses a change, the staff status buttons (incl. the pickup handover and cash received), the driver's buttons and "Assign driver" all show "This day is closed. The Manager must reopen it before orders can change." (`isDayClosedError()` in `closeout-rules.ts` recognises the lock's message) instead of a general "try again".

### Possible lecturer questions
- *Can staff change an order after the day is closed?* No: the lock trigger refuses it (tested in block 6). The Manager must reopen the day, with a reason that's recorded.
- *What if the till is J$700 short?* Over the J$500 limit, so the count needs a written explanation (block 3), saved with the closeout.
- *What if an order is still open at closing time?* Counter staff can't close out; the Manager can, only with an override reason, and the open order is frozen until a reopen.
- *Who can approve?* Only the Manager (block 4); counter staff can only count today's cash.

## Step 37: Print and export reports (FR-06 SR-6.9 / SR-6.10)
On `/manager`, a **Print and export** box under the dates gives, for what's on screen:
- **one day:** the **Daily Closeout report**, "Print / PDF" or "Download CSV";
- **a range:** the **Daily totals**, "Print / PDF" or "Download CSV";
- **always:** the **Item volume** report, WITH the filters you chose.

Every report (paper and file) starts with the same header: **The Spot**, the report name, the business day or range, **Generated** (date + time, Jamaica) and **Generated by** (the Manager's name), and a label:
- **FINAL**: every day in it is approved and locked;
- **DRAFT**: at least one day isn't approved yet, so the figures may still change (decision: drafts may be printed, but clearly marked).

**PDF without a library:** the print page has a "Print / Save as PDF" button that opens the browser's print window. Choosing **Save as PDF** as the printer makes the PDF. On paper, the site header and the buttons are hidden and the page is plain white.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/reports/csv.ts` | Application | **New.** `csvCell()` (quotes, CSV injection guard), `money()`, `toCsv()` (BOM + CRLF), `csvFileName()`. |
| `src/lib/reports/report-info.ts` | Application | **New.** The report header: `makeReportInfo()`, `reportState()` (FINAL / DRAFT), `formatReportDay()`, `formatReportTime()`, closeout words. |
| `src/lib/reports/report-csv.ts` | Application | **New.** Lays the figures out as CSV rows: `closeoutCsvRows`, `dailyTotalsCsvRows`, `itemVolumeCsvRows`. |
| `src/lib/reports/load-report.ts` | Application (server only) | **New.** Loads one report (period + filters checked) for BOTH the print page and the CSV files, so they always match. `reportNow()` = "generated at". |
| `src/lib/reports/export-response.ts` | Application (server only) | **New.** `managerForExport()` (401 / 403, no file), `csvResponse()` (download headers). |
| `src/app/manager/export/closeout/route.ts`, `.../daily-totals/route.ts`, `.../items/route.ts` | Application | **New.** Route handlers that send the CSV files. |
| `src/app/manager/print/page.tsx` | Presentation | **New.** The print-friendly page (`?report=closeout` / `range` / `items`). |
| `src/components/PrintButton.tsx` | Presentation (browser) | **New.** `window.print()`. |
| `src/app/manager/page.tsx` | Presentation | The "Print and export" box. |
| `src/components/ItemVolumeReport.tsx` | Presentation | `ItemTable` exported, so the print page shows the same table. |
| `src/components/SiteHeader.tsx`, `src/app/globals.css` | Presentation | `print:hidden` on the header; print styles (white paper, no shadows, 12 mm margin). |

### Key concepts
- **Route handler:** a server address (`route.ts`) that sends back a FILE instead of a page. `Content-Disposition: attachment; filename="..."` tells the browser to save it.
- **Every address checks the role:** anyone can type `/manager/export/items`. The proxy stops logged-out visitors; the route itself refuses everyone but the Manager (401 / 403); the database checks the role AGAIN when loading the figures.
- **CSV injection:** Excel treats a cell starting with `=`, `+`, `-` or `@` as a formula. A text cell like that gets a `'` in front, so it stays plain text. Real numbers (a cash difference of -50.00) are left alone.
- **Quoting:** a cell containing a comma, a quote or a new line is put in "double quotes" (and a quote inside is doubled), so the columns never shift.
- **BOM:** an invisible marker at the start of the file so Excel reads it as UTF-8.
- **One loader for paper and file:** `load-report.ts` is used by both, so the PDF and the CSV can never show different figures.
- **Print CSS:** Tailwind's `print:` styles (e.g. `print:hidden`) only apply on paper.

### Possible lecturer questions
- *Can counter staff download the sales CSV?* No: they get "Only the Manager can download reports." (403) and no file.
- *Why no PDF library?* Every supported browser (Chrome, Safari, Firefox, Edge) can already "Save as PDF" from the print window; a library would add weight and another thing to maintain. SR-6.9 makes PDF optional.
- *How do you know a printed report is final?* The header says FINAL only if every day in it is approved and locked; otherwise DRAFT.

## Step 38a: Supervisor screen, verifying Lynk payments (FR-02, FR-06, UC-07; SDS Supervisor)
`/supervisor` is now the **Payments** screen:
- **Lynk payments to check:** every UNPAID Lynk payment whose order isn't cancelled or abandoned, oldest first. Each card shows the amount, the **reference (= Order ID)**, customer + "Call", order time, pickup or delivery, and the order status.
  - **Verify payment** -> "Received J$1,200 for #1043 in Lynk? **Yes, received** / Cancel". The payment becomes **PAID** (paid_at, paid_by = the Supervisor), so it now **counts in the sales reports** (Step 34).
  - **Not received** (+ optional note, max 200) -> the payment is flagged but stays **UNPAID**. Counter staff see "Lynk payment not received ... Ask the customer about it before handing over the food." on the order page. If the money arrives later, the Supervisor can still verify it (the flag is then cleared).
- **Verified today:** what's already done ("by you" / "by another supervisor").
- Live: refreshes when any order changes, and every 30 seconds.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0020_supervisor_lynk.sql` | Data | **New.** Flag columns on payments (`not_received_at/_by/_note`); Supervisor READ rules (orders, payments, customers who ordered); `verify_lynk_payment()` and `flag_lynk_not_received()` (server only). |
| `supabase/tests/0020_supervisor_lynk_checks.sql` | Data | **New.** 10 checks: verify + counts in sales, verify twice, only the Supervisor, not for cash, not received then verified, note length, closed day, what the Supervisor reads, no direct writes, counter staff see the flag. |
| `src/lib/payments/supervisor-rules.ts` | Application | **New.** `NOTE_MAX`, `readNote()`, `readOrderId()`. |
| `src/lib/payments/supervisor-actions.ts` | Application | **New.** Server Actions `verifyLynkPayment`, `flagNotReceived` (Supervisor only, secret key, clear messages). |
| `src/lib/payments/get-lynk-payments.ts` | Application (server only) | **New.** `getLynkToCheck()`, `getLynkVerifiedToday()`. |
| `src/components/LynkPaymentList.tsx` | Presentation (browser) | **New.** The cards, the confirmation and the note form. |
| `src/app/supervisor/page.tsx` | Presentation | The placeholder replaced by the Payments screen. |
| `src/lib/orders/get-order.ts`, `src/app/staff/orders/[id]/page.tsx` | Application / Presentation | The "not received" note for counter staff. |

### Key concepts
- **Why the Supervisor matters for sales:** FR-06 counts PAID orders only. A Lynk order is UNPAID until the Supervisor verifies it, so verifying is what makes it appear in the reports.
- **Row lock ("for update"):** the function locks the payment row while it works, so two Supervisors pressing at the same moment can't both verify it; the second gets "Someone else already verified this payment."
- **Touching the order:** payments aren't in Realtime, but orders are. The function updates `orders.updated_at`, so every screen showing that order refreshes by itself.
- **Least privilege:** the Supervisor can READ orders, payments and customers who ordered, but can't change anything directly; only the server functions can, and they check the role again.
- **The closed-day lock still applies:** a Lynk payment of a closed day can't be verified until the Manager reopens it ("This day is closed...").

### Possible lecturer questions
- *Can the Manager verify a Lynk payment?* No: only the Supervisor (block 3).
- *What if the customer says they paid but nothing is in Lynk?* The Supervisor marks it "not received"; counter staff see that before handing over the food. If the money shows up later, the Supervisor verifies it then.
- *When does a Lynk order count in the sales summary?* From the moment the Supervisor verifies it (block 1).
