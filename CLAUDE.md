# The Spot Food Sales Management System

COMP2140 group project (Group ACE, UWI Mona). This web app must match our SRS (requirements) and SDS (design). When anything below conflicts with an idea you have, follow this file.

## How to work with me (most important section)
I am a student and I must understand everything we build, because my lecturer can ask me about any part of it. Teaching me matters more than speed.

Build in parts:
- Work on ONE small part at a time (for example "the login page" or "the cart", not "the whole ordering feature").
- Before writing any code, explain in plain words: what this part does, why we need it (link it to the SRS feature, e.g. FR-05), and which files you will create or change. Then wait for me to say "go".
- After finishing a part, STOP. Tell me how to test it in the browser and wait for me to confirm it works before starting the next part.

Comment the code:
- At the top of every file, write a short comment explaining what the file is for and where it fits in our three layers (Presentation, Application or Data).
- Above every function, component and important block, write a comment explaining WHAT it does and WHY it is done this way.
- Explain any rule from our SRS where it is enforced (e.g. "// FR-05 SR-5.3: status can only move forward").
- Use plain, beginner-friendly English in comments. Avoid jargon, or explain it the first time you use it.

Explain as we go:
- After each part, give me a short summary: what you built, what each new file does, and one or two key ideas I should understand (e.g. what Row Level Security is).
- Keep a file called LEARNING.md. After each part, add a section with: the part's name, the files involved, what they do, and the key concepts, so I can study it before presentations.
- If I ask "why", explain it simply with an example from our system.

Rules:
- Do not rename classes, statuses or roles listed here. Ask before adding anything not listed.
- Never build several parts at once, even if it would be faster.

## Stack
- Next.js (App Router, TypeScript) with Tailwind CSS
- Supabase: Postgres database, Auth (email + password), Realtime (live status updates without refresh)
- Deploy on Vercel
- Must work in current Chrome, Safari, Firefox and Edge on phones and computers. Staff and Manager screens are used on smartphones, so design mobile-first.

## Branding (for a later "branding" part; do not change the design until then)
- The Spot's real logo is `public/the-spot-logo.jpeg`: a red circle with "spot" in white script, "Sports Bar & Grill" underneath, and "THE" in a small orange box.
- In the branding part: switch the colour scheme to match the logo (red = main colour, orange = accent, white text on red), and put the logo at the top left of the header.
- Current placeholder colours live in `src/app/globals.css` (`@theme`), so the switch should happen there.

## Open decisions (settle before Build step 8)
- (none open) Student ID login was settled in Step 39a (see "Decisions made").

## Decisions made
- Menu is public: anyone can browse it without logging in. Only ordering needs an account.
- Menu item category is a plain text column (not an enum).
- The cart lives in the browser for now; the server re-checks prices and availability at checkout (Build step 3).
- Strict role access: each role opens only its own screen (e.g. a manager cannot open /staff). Exception (Step 39a): /account ("My account") is open to every logged-in role, own details only.
- Phone number is required at sign-up; minimum password length is 8.
- Login with EMAIL OR STUDENT ID (Step 39a, SRS Section 3, Evon): profiles.student_id optional, exactly 9 digits, UNIQUE, entered at sign-up and editable on /account (name in the header links there; name, phone, student ID editable; email/role read-only). Login box "Email or student ID": "@" = email, 9 digits = student ID (server looks up the email with login_identify(), migration 0022, service_role only), else "Enter your email or your 9-digit student ID." Every failure: "Email/student ID or password is incorrect." Sign-up / My account say "That student ID is already used by another account" (accepted trade-off). Step 39 split: 39a student ID login, 39b lock after 5 failed logins (15 min; per account, email + student ID together; unknown identifiers lock too; server also bans the account in Supabase Auth for 15 min; message shows the time), 39c staff idle logout after 30 min (warning at 28 min; profiles.last_active_at checked by the server; customers unaffected). Dev-only TEST_SHORT_SECURITY_TIMERS for quick tests.
- Login lockout (Step 39b, Evon): migration 0023: login_attempts (server only, RLS on, no grants; key user:<id> or unknown:<sha256 of lowercased identifier>); login_lock_status / login_record_failure(user, identifier, max, minutes) / login_record_success, service_role only. logIn: findAccount -> if locked stop ("Too many failed attempts. Try again at H:MM.") without trying the password -> unknown identifier counts as failure -> only invalid_credentials counts -> 5th failure locks + admin ban_duration "<minutes>m" -> success resets. Numbers in src/lib/auth/security-settings.ts (LOCK_AFTER_FAILS 5, lockMinutes 15 or 1 with TEST_SHORT_SECURITY_TIMERS; isShortSecurityTimersOn in test-settings.ts, dev only; TEST MODE note on /login). DB errors in the counter are logged and the login continues (fail open). From the 3rd failure in a row the message adds "N tries left before a 15-minute lock." (login_failed_count, migration 0024; failedLoginMessage in src/lib/auth/login-messages.ts; unknown identifiers get the same text).
- Staff idle logout (Step 39c, Evon): migration 0025: profiles.last_active_at (not user-editable) + touch_staff_activity(user) (service_role, staff roles only). Browser: StaffIdleWatcher (in SiteHeader for staff only) counts pointerdown/keydown/wheel/touchstart/scroll (not auto-refreshes), shares the time across tabs (localStorage), pings stillHere() at most once a minute, warns at 28 min ("Are you still there? ... Stay logged in / Log out now"), goes to /logout?reason=idle at 30. Server: getLoginState() in get-profile.ts marks staff idle when last_active_at is older than 32 min (30 + 2 grace); getCurrentProfile returns null for them (actions: "Please log in again."), requireRole redirects to /logout?reason=idle (route handler clears cookies -> /login with an idle note). logIn touches activity. null last_active_at = not idle. Times in idleTimes() (security-settings.ts; test mode 2 min / warn 1 / server 3).
- Sizes (Option C): MenuItem has `price` (single-price items, e.g. drinks) OR `price_small` / `price_medium` / `price_large` (food). An empty size = not offered. No new class/table. Drinks sold in two sizes stay as separate single-price items (e.g. "Sprite (Small)").
- Real menu (the-spot-real-menu.md), until the client answers:
  - Items with no price (Snapper Fish, Boom, Supligen, True Juice) are left out.
  - Curry Goat Large = 1500 (unconfirmed: 1500 or 1600).
  - Allergens unknown: `allergens` NULL = not confirmed, shown as "ask at the counter" (SAF-2). Never show "None listed" for unconfirmed items.
  - Alcohol items are added but marked unavailable until the client decides on online alcohol sales.
  - Oxtail (Thursdays) and Stew Peas (Wednesdays) are daily specials; the Manager switches is_available on for their day, so they show in "Today's specials" only then. Day noted in the description.
  - Categories (Part 10): Chicken, Pork & Beef, Goat & Fish, Mixes, Sodas, Water & Juice, Energy & Sports, Alcohol. Each has its own sort_order block (100s, 200s, ... 1500s). Only Chicken & Fries is made-to-order.
  - Menu usability parts: 10 categories, 11 sticky bar + highlight + 4 cards per row, 12 compact rows for single-price items, 13 search. Then customizations, then cart.
- Customizations (FR-02): one shared list for ALL food (sized items); drinks have none (no link table). `kind` is 'side' or 'sauce'. Chosen with tick boxes, each at most once (no quantities). Real extras unknown: sample extras are marked "(Sample)" in the name until the client gives the real ones.
- Parts: 14 customizations table + sample seed; 15 options panel on Add (size, extras, meal note, quantity, live price); 16 cart (browser storage, cart page, header count). Meal notes: max 200 characters, checked on the server at checkout; saved on the order item (Build step 3).
- Options panel: no size is pre-chosen unless the item has only one size; quantity per cart line is 1-10.
- Cart: split into Part 16 (browser storage + Add buttons + header count) and Part 17 (cart page). The cart link is for visitors and customers only (no cart for staff). On the cart page a line can only change quantity or be removed (to change size/extras/note: remove and add again). The cart is kept when someone logs in, but CLEARED when they log out (shared campus computers), and cleared after an order is placed (Build step 3).
- Cart page (Part 17): "−" is disabled at quantity 1 (remove only with the Remove button). Out-of-date prices/availability are NOT checked on the cart page; the server checks them at checkout (Build step 3) and tells the customer what changed. The Checkout button is shown disabled until Build step 3.
- Build step 3 parts: 18 delivery_locations table (sample fee); 19 order tables + create_order function + RLS; 20 checkout page; 21 placeOrder server action; 22 confirmation page (Rayna); 23 Lynk QR + payment instructions on the confirmation page (Junelle, FR-02).
- Confirmation page (Part 22): `/orders/[id]`, customers only, read with the logged-in connection (RLS = own orders only; someone else's or a missing id shows the same "Order not found"). Shows Order ID, placed time, pickup/delivery + location, time, items (size, extras, notes), totals, payment METHOD only (no payment status, no QR/instructions until Part 23). No print button. After placing an order, checkout goes there with router.replace.
- Delivery locations: table `delivery_locations` (approved addition) with a fee PER location, `fee_confirmed` flag (false = show "(sample, not final)"), `is_active`, `sort_order`. Sample fee J$200 until the client gives the real one; the Manager edits it and ticks fee_confirmed (no code change).
- Order writing: customers can only READ their own orders (no insert/update via RLS). The `placeOrder` server action does all checks and price maths, then calls DB function `create_order` (one transaction) that ONLY the server can call, using the Supabase secret key. The secret key is server-only: env var WITHOUT the NEXT_PUBLIC_ prefix, never imported by browser code, never committed.
- Scheduling: "As soon as possible" or a time later TODAY in 15-minute steps (same day only), Jamaica time (UTC-5, no DST), within 11:00-19:00 and the FR-01 lead times.
- Order IDs start at 1001. `client_request_id` (unique) prevents duplicate orders from double taps/retries.
- Lynk QR: a clearly marked SAMPLE placeholder (no QR package).
- Payment step (Part 23, on /orders/[id]): Lynk = SAMPLE QR from generateLynkQRCode() (src/lib/payments/lynk.ts; looks like a QR, cannot be scanned), amount = order total, reference = Order ID, "a supervisor will confirm your payment", plus the Lynk ID to type in (phones can't scan their own screen). The Lynk ID is a SAMPLE (`LYNK_ID` in src/lib/store-info.ts, shown as "[sample Lynk ID]" so no real account can receive money) until the client/Supervisor gives the real one; then set LYNK_ID_CONFIRMED = true. Cash: "Pay J$X at the counter" (pickup) / "Pay J$X to the driver" (delivery).
- Names: fulfilment PICKUP / DELIVERY; payment method LYNK / CASH; payment status UNPAID (PAID, REFUNDED added in Build step 7). Cash is allowed for pickup and delivery (paid to the driver).
- Build step 4 steps: 24 staff live queue on /staff (Deja); 25 order details page /staff/orders/[id] (Deja); 26 status-change buttons + "Past Orders" section (Deja); 27 confirm Order ID at handover, SAF-1 (Deja); 28 full server-side status rules + Abandoned (Evon).
- Staff queue (Step 24): active orders only (PENDING, IN_PROGRESS, READY_FOR_PICKUP, BEING_DELIVERED), oldest first, new at the bottom. Card: Order ID, items (size, extras, meal notes), order time, "Ready by" (ASAP about X / scheduled time), pickup or delivery + location, status label (display only, no buttons until Step 26). Live via Supabase Realtime on `orders` + router.refresh(). Counter staff read orders through RLS (read-only, migration 0007); no secret key.
- Staff order details (Step 25): own page /staff/orders/[id] (not a panel), counter staff only, view only, any order (Past Orders links here in Step 26). Shows customer name + phone (tel: link), items with size/extras/notes/prices, pickup or delivery location, ready-by, order time, payment method, totals. Migration 0008: counter staff may read profiles of CUSTOMERS WHO HAVE AN ORDER (not other staff) and all payments; read-only. Live via shared OrderLiveRefresh (filter id=eq.N).
- Status changes (Step 26): buttons on /staff/orders/[id] show only the next step (nextStatus) + Cancel (with confirmation); Abandoned button added in Step 28. Server action updateOrderStatus (counter staff only) -> checkStatusChange() in src/lib/orders/status-rules.ts (Step 26 minimum: only the next step or CANCELLED, finished orders can't change; Step 28 adds the full rules there) -> DB function change_order_status() (service_role only) updates orders.status AND inserts order_status_history in one transaction, only if the status is still the one staff saw. Counter staff may press Being delivered / Completed for delivery orders until the driver screen (Build step 6, Donica decides then). Past Orders on /staff: COMPLETED/CANCELLED/ABANDONED orders placed TODAY (Jamaica), newest first, linking to details.
- Pickup handover (Step 27, SAF-1 + FR-06): completing a PICKUP order opens "Hand over order": staff type the Order ID the customer gives (must match, else blocked); for unpaid CASH they tick "Cash received (J$X)". Same updateOrderStatus action + checkPickupHandover() (status-rules.ts); change_order_status(..., p_cash_received) sets COMPLETED + history + payment PAID (paid_at, paid_by) in one transaction (migration 0010; payments.status now allows PAID). Lynk is NOT marked paid here (Supervisor, Build step 7). Staff details page shows payment status (Unpaid/Paid); the customer page still shows the method only.
- Full status rules (Step 28, FR-05 SR-5.3 / SR-5.5): checkStatusChange(order, newStatus, now) in status-rules.ts gives a clear message per mistake (finished locked, same status, backwards, skip, wrong path). CANCELLED allowed from any unfinished status. ABANDONED: PICKUP only, only from READY_FOR_PICKUP, only >= 20 min (ABANDON_AFTER_MINUTES, order-status.ts) after the latest READY_FOR_PICKUP row in order_status_history; server uses its own clock. Same rules enforced in the DB by trigger orders_enforce_status_rules (migration 0011, runs for every UPDATE of orders.status incl. service_role and SQL Editor); change the 20 in BOTH places. 0011 also lets counter staff read order_status_history. Staff details page: "Ready since", grey hint "You can mark it Abandoned from H:MM" (rounded up to the minute) and then a "Mark Abandoned" button with confirmation that appears by itself (timer). Abandoned orders keep payment UNPAID; customer notification is Build step 5.
- Customer tracking (Step 29, FR-05 SR-5.1/5.2): header link "Orders" (customers only) -> /orders titled "My orders": own orders newest first (latest 50; getMyOrders in src/lib/orders/get-my-orders.ts, RLS + eq customer_id), Order ID, date, pickup/delivery, total, StatusBadge, live via OrderLiveRefresh customerId (filter customer_id=eq.). /orders/[id] has an "Order status" box (OrderProgress: badge + one plain sentence + vertical progress line from statusSteps(); Cancelled/Abandoned = a box, no line), live via OrderLiveRefresh orderId. No step times shown (not now). No DB change (0006 + 0007 already cover it).
- Notifications (Step 30, FR-05 SR-5.4): table `notifications` (migration 0012: order_id, customer_id, status in READY_FOR_PICKUP/CANCELLED/ABANDONED, channel SMS/EMAIL, sent_to copy, message, sent_at; unique (order_id, status)). Written ONLY by AFTER trigger orders_notify_customer (security definer fn notify_customer_of_status, same transaction as the status change). Channel: SMS to profile phone, EMAIL (auth.users) only if no phone. Delivery READY_FOR_PICKUP uses delivery wording. Simulated: nothing really sent. RLS: customers read own; no writes via public key; no staff access. Shown only on /orders/[id] ("Messages we sent you", contact masked), live via the existing orders Realtime refresh (notifications NOT in the Realtime publication). No backfill for older orders.
- Deliveries (Step 31, FR-04 SR-4.1, Donica): table `deliveries` (migration 0013, approved SDS class Delivery): one row per order (order_id unique), driver_id, drop_off_location (name COPY), assigned_at, assigned_by, picked_up_at + delivered_at (filled in Step 33), time-order CHECKs. Latest assignment only (changing the driver updates the row). Written ONLY by assign_delivery(p_order_id, p_expected_driver_id, p_driver_id, p_assigned_by) (service_role; delivery orders only, only PENDING/IN_PROGRESS/READY_FOR_PICKUP, driver must be delivery_personnel, assigner counter_staff, returns false if the driver changed since staff looked; touches orders.updated_at so Realtime refreshes screens). Server action assignDriver (delivery-actions.ts) + checkDriverAssignment/canChangeDriver (delivery-rules.ts). RLS: counter staff read deliveries + delivery_personnel profiles; customers none; drivers get their read rule in Step 32. Staff details page: "Delivery" box (drop-off large, ready-by, customer, driver, AssignDriver list "Name (N active)" fewest first; "active" = order not finished). Queue cards show driver or amber "No driver yet". Counter staff "Mark Being delivered" only once a driver is assigned (StatusButtons + checkStatusChange hasDriver + DB trigger orders_being_delivered_needs_driver); Step 33 moves Being delivered/Completed for delivery to the driver and removes them from counter staff. Customers don't see the driver (not now).
- Driver screen (Step 32, FR-04 SR-4.2 view part, Donica): /driver (delivery_personnel only) lists the driver's deliveries: "To deliver" (unfinished, earliest ready-by first) and "Done today" (today's COMPLETED/CANCELLED, newest first). Card: Order ID, status, drop-off location (large), ready-by, customer name + tel: "Call", items (extras, notes), total, money line ("Collect cash: J$X" for unpaid CASH; Lynk = don't collect; PAID = nothing to collect). View only (buttons + Order ID check = Step 33). Migration 0014: read-only RLS for drivers (own deliveries; orders/items/extras/payments of those; customer profiles of those). Live: OrderLiveRefresh (orders, RLS) + refreshEverySeconds=30 + refresh on returning to the tab (a driver who loses a delivery can't be told by Realtime).
- Driver buttons (Step 33, FR-04 SR-4.2/4.3/4.4, SAF-1, FR-06, Donica): on /driver each card has ONE step: Pending/In progress = "Not ready yet"; Ready for pickup = "Mark Being delivered" + confirm "Leaving now with order #N? Yes, leaving now / Not yet"; Being delivered = "Hand over" form (typed Order ID must match, "Cash received (J$X)" for unpaid CASH; Lynk = don't collect). Server action updateDeliveryStatus (delivery-actions.ts, delivery_personnel only): fresh read via driver RLS -> checkDriverStatusChange (my delivery; only BEING_DELIVERED/COMPLETED) + checkStatusChange (Step 28) + checkHandover (shared with the counter; renamed from checkPickupHandover, with needsHandover/readHandover) -> DB driver_change_delivery_status() (migration 0015, service_role: assigned driver check, unpaid CASH needs p_cash_received, then REUSES change_order_status: status + history + cash PAID with paid_by = driver). AFTER trigger orders_record_delivery_times fills deliveries.picked_up_at (BEING_DELIVERED) and delivered_at (COMPLETED) for delivery orders, whoever made the change. Counter staff (decision B): no "Mark Being delivered" button at all for delivery orders, only the note "The driver marks order #X Being delivered on their own screen when they leave." (server refuses via counterDeliveryProblem, same words); keep Cancel and a BACKUP "Complete delivery (backup)" with the same handover form (paid_by = counter staff). Drivers can't cancel/abandon. Done today shows "Delivered H:MM".
- Daily Sales Summary (Step 34, FR-06 SR-6.1/6.2/6.3/6.10, Giovanni): DB function daily_sales_summary(p_day) (migration 0016, security definer, returns jsonb TOTALS only; manager any day, counter_staff today (Jamaica) only, others refused) + index orders(created_at). Business day = midnight-midnight America/Jamaica by orders.created_at. Counted = payment PAID and status not CANCELLED/ABANDONED. Gross = sum orders.total (incl. delivery fees, shown "of which"); refunds = 0 until Step 38 (marked "STEP 38"); net = gross - refunds. By payment type (LYNK, CASH, both always listed): transactions, amount (sum payments.amount), refunds, net, % of net (1 decimal, 0 if no sales); totals_match compares payments-based total with orders-based net -> red warning (AC-6.3). Info lines: Cancelled, Abandoned, Not counted (unpaid). Pages: /manager (date picker GET ?date=, default today, no future), /staff/sales (counter staff, today only, link from the queue). Later: 35 item volume, 36 date range, 37 closeout/export, 38 Supervisor refunds.
- Item volume + ranges (Step 35, FR-06 SR-6.4/6.5, Giovanni): migration 0017: report_orders(from,to) = THE shared counted rule (no EXECUTE for anyone; used by security-definer report functions), report_summary(from,to), daily_sales_summary rewritten on top (same behaviour), sales_range_summary(start,end) (days[] via generate_series + total), item_volume_report(start,end,fulfilment,category,sort) — all Manager only (0018 fixes sales_range_summary: per-day CTE first, then jsonb_agg; 0017 had nested aggregates) via report_check_manager_range (1-31 days, end >= start, no future). Item lines = menu item + size (latest saved name; category from menu_items, 'Other' if none); revenue = order_items.line_total (incl. extras); delivery fees not item revenue (check line: items = gross - fees). No separate extras report (not now). /manager = "Sales reports": From/To (?from=&to=, empty To = one day, old ?date= still works), quick links Today / Last 7 days / This month; range shows DailyTotals + combined SalesSummary; ItemVolumeReport filters (category from menu order, type PICKUP/DELIVERY, sort quantity/revenue/name) as GET form with hidden date fields.
- Daily closeout (Step 36, FR-06 SR-6.6/6.7/6.8/6.10, Giovanni): migration 0019 (approved new tables store_settings [one row, cash_difference_limit default 500] and daily_closeout_events [history]; plus daily_closeouts = SDS DailyCloseout with is_locked, status SUBMITTED/APPROVED/REOPENED, expected/counted/difference, note, submitted_by/at, summary snapshot, override_reason, approved_by/at). Expected cash = report_summary CASH net (STEP 38: minus cash refunds). Difference over the limit (abs, cents) needs a 10+ char explanation. Counter staff count TODAY only and only with no open orders; Manager counts any day <= today; approve/reopen/set limit Manager only (reopen needs 10+ char reason; approve needs override reason if orders open -> they're frozen). Approval re-checks expected cash (changed -> count again). Lock triggers (orders insert/update, payments, deliveries) refuse changes for an order placed on a locked day; new orders on a locked day refused ("The Spot has closed for today. Please order tomorrow." shown by placeOrder). Writes only via service_role functions with p_actor; reads via closeout_details(day) (manager any day, counter staff today; names + events). UI: CloseoutPanel on /manager (one day) and /staff/sales (today); DailyTotals Closed column. STEP 38: refunds table needs the same lock trigger.
- Print / export (Step 37, FR-06 SR-6.9/6.10, Giovanni): Manager only. /manager has a "Print and export" box: one day -> Daily Closeout report; a range -> Daily totals; always -> Item volume with the chosen filters. Print page /manager/print?report=closeout|range|items (header hidden on paper via print:hidden; "Print / Save as PDF" = browser print window, no PDF library). CSV route handlers /manager/export/closeout?date=, /daily-totals?from=&to=, /items?from=&to=&category=&type=&sort= (401/403 for non-managers, no-store, attachment). Every report starts with The Spot, report name, day/range, Generated (Jamaica time), Generated by (full name, else email), FINAL (all days approved and locked) or DRAFT (decision: drafts may be printed, clearly labelled). CSV: header lines, blank line, then the table(s); amounts plain numbers 1200.00 with "(J$)" in column names; BOM + CRLF; text cells starting with = + - @ get a ' (CSV injection). Print page and CSVs share load-report.ts. No export log (not now). No DB change.
- Step 38 split (user): 38a Supervisor screen + Lynk verification; 38b refunds + real refunds in reports/closeout. Decisions for 38b: a refund counts on the day it's ISSUED (lowers that day's net and expected cash; that day's lock applies); payment becomes REFUNDED when fully refunded (partly refunded stays PAID; report counted rule must include PAID and REFUNDED); customers don't see refunds (not now).
- Supervisor Lynk verification (Step 38a, FR-02/FR-06/UC-07, Giovanni): migration 0020: payments.not_received_at/_by/_note (flag, stays UNPAID; note <= 200); Supervisor READ policies on orders, payments, customers who have orders; verify_lynk_payment(order, supervisor) (LYNK + UNPAID -> PAID, paid_at/paid_by, clears flag, returns false if already PAID) and flag_lynk_not_received(order, note, supervisor) (returns false if PAID meanwhile), both service_role only, lock the payment row, touch orders.updated_at for Realtime. Closed-day lock applies via payments_day_not_locked. /supervisor = "Payments": "Lynk payments to check" (unpaid LYNK, order not CANCELLED/ABANDONED, oldest first; Verify payment with "Received J$X for #N in Lynk? Yes, received / Cancel"; Not received + optional note) and "Verified today" (by you / another supervisor). Live: OrderLiveRefresh (all orders) + 30 s. Counter staff order page shows "Lynk payment not received" note while UNPAID. Customers don't see the flag (not now).
- Refunds (Step 38b, FR-06/UC-07, Giovanni): migration 0021: payments.status adds REFUNDED (full refund only; partial stays PAID). Table refunds (SDS Refund: order_id, payment_id, method copy, amount > 0, reason 10-500, refunded_by, refunded_at, business_day = Jamaica day ISSUED, CHECK matches); rows can never be updated/deleted (trigger); RLS read: supervisor + manager (customers/staff none). issue_refund(order, amount, reason, expected_refunded, supervisor) service_role only: supervisor only, payment not UNPAID, locks payment row, false if refunded-so-far changed, sum of refunds <= paid, sets REFUNDED when fully refunded. Lock: no refund on a locked ISSUE day ("Refund: the business day ... is closed ..." shown as is); payments lock (new enforce_day_not_locked_payments) allows only PAID -> REFUNDED on a locked order day. Reports: report_orders counted = PAID or REFUNDED (not cancelled/abandoned); report_summary/sales_range_summary subtract refunds ISSUED in the period (refunds of cancelled/abandoned orders excluded); range Cash/Lynk columns are net; expected cash = cash net (so minus cash refunds), approval re-check catches refunds after the count. UI: /supervisor "Refunds" box (?refund=ID#refunds GET lookup; paid / refunded so far / can still refund; amount + Full refund + reason; confirm "Refund J$X by Method to Name for #N? It can't be undone."; Refunds today). Staff page shows "Refunded"; driver card treats REFUNDED as paid.
- IMPORTANT for Build step 7 (FR-06 counts PAID orders only): cash orders must be marked PAID when the cash is received (at the counter or by the driver), and Lynk orders when the Supervisor verifies them. Otherwise revenue reports would miss them. Descriptions empty until the client says what comes with each meal.

## Known issues
- (none open) The "customer page not live since 0013" issue was FIXED in Step 32: OrderLiveRefresh joined Realtime before the browser had loaded the login token (anon -> RLS -> "invalid column for filter id"). It now calls auth.getSession() + realtime.setAuth(token) BEFORE subscribing, and shows "Live updates off: refresh the page" if the server sends a system error.

## Architecture (SDS 2.3: three-tier layered)
- Presentation layer: role screens in `app/` (customer, staff, driver, manager, supervisor)
- Application layer: server actions / route handlers in `lib/` and `app/api/`. All business rules live here, never only in the browser.
- Data layer: Supabase tables, protected by Row Level Security (RLS)
- External services: Lynk (Jamdex) QR payments (simulate for now), SMS/email notifications (simulate or log for now)

## Roles (User subclasses)
- customer: browse menu, cart, place and track orders
- counter_staff (CounterStaff): live order queue, update statuses, assign deliveries, mark abandoned, confirm Order ID at handover
- delivery_personnel (DeliveryPersonnel): see assigned deliveries, mark Being Delivered and Completed
- manager (Manager): sales reports, daily closeout, edit menu items/prices/delivery locations
- supervisor (Supervisor): verify Lynk payments, issue refunds (only role that can refund)
Hierarchy: User -> Customer, Supervisor, Staff; Staff -> CounterStaff, DeliveryPersonnel, Manager.

## Order statuses (use exactly these, in this order)
PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> COMPLETED (pickup)
PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> BEING_DELIVERED -> COMPLETED (delivery)
End states also allowed: CANCELLED, ABANDONED.
- Status may only move forward; reject skips and backwards moves with an error message.
- A pickup order can be marked ABANDONED only 20 minutes or more after it became READY_FOR_PICKUP.

## Features (SRS 2.3)
FR-01 Online Pre-Order Placement & Scheduling
- Show menu with prices, descriptions, daily specials and allergens. Unavailable items are greyed out and cannot be added.
- Pickup or Delivery. Delivery locations only: UWI Mona, UTech, UWI Hospital.
- Lead times: standard pickup immediate; pickup containing a made-to-order item (fries) at least 15 min; delivery at least 20 min. Use the larger rule when both apply.
- Opening/delivery hours 11:00 a.m. - 7:00 p.m.
- On submit: unique numeric Order ID, confirmation shown to customer, order appears in staff queue as PENDING within 3 seconds.

FR-02 Pre-Order Customization & Submission
- Customizations (sides, extra sauces) with extra cost; meal notes (dietary instructions).
- Total = items + customizations + delivery fee (delivery only).
- Payment method: Lynk (show QR code) or Cash. Lynk payments are verified by the Supervisor; the order is still submitted immediately.

FR-03 Real-Time Order Management Queue (CounterStaff)
- Vertical queue: Order ID, items, order time, pickup/delivery, status. New orders at the bottom as PENDING.
- Update status; completed/cancelled/abandoned orders move to a "Past Orders" section.

FR-04 Delivery Processing
- Validate delivery location and hours. Staff assign delivery orders to an available DeliveryPersonnel.
- Driver sees Order ID, customer phone, drop-off location; marks Being Delivered, then Completed after confirming the Order ID.

FR-05 Real-Time Order Status Tracking & Alerts (Customer)
- Customer sees Order ID and current status; updates appear within 5 seconds without refresh (Supabase Realtime).
- Notify customer (SMS/email, simulated) when READY_FOR_PICKUP, CANCELLED or ABANDONED.
- Customers can only see their own orders.

FR-06 Sales Summary & Daily Closeout (Manager)
- Revenue from paid orders only (exclude unpaid, cancelled, abandoned). Breakdown by payment type (Lynk vs Cash). Item volume report. Date range filter. Export CSV (PDF optional).
- Closeout blocked while any order is open. Staff enter counted cash; system shows difference from expected cash. Manager approves -> day is locked (read-only). Only Manager can reopen, with a reason.
- Counter staff may only see the current day's sales.

## Non-functional requirements (SRS 3)
- PR-1 menu loads within 3 s; PR-2 status update reaches customer within 5 s; PR-3 supports 100 concurrent customers at lunch.
- SAF-1 Order ID confirmed before handover. SAF-2 show allergens on menu items.
- Security: login required; role-based access (enforce with RLS + server checks); HTTPS; passwords handled by Supabase Auth (hashed); lock account 15 min after 5 failed logins; staff auto-logout after 30 min idle; never store card details.
- Usability: a first-time customer can order in under 3 minutes (Menu -> Cart -> Checkout).
- Maintainability: menu items, prices and delivery locations editable by Manager without code changes.
- No inventory/stock tracking (client said food never runs out); use MenuItem.isAvailable instead.

## Data model (match SDS class diagram names)
User/profile (role), Customer, Staff, CounterStaff, DeliveryPersonnel, Manager, Supervisor,
Cart, Order, OrderItem, OrderStatus, Notification, Menu, MenuItem, Customization,
Payment, Refund, Delivery, SalesReport, DailyCloseout.
Suggested tables: profiles, menu_items, customizations, orders, order_items, order_item_customizations,
order_status_history, payments, refunds, deliveries, notifications, daily_closeouts.

## Build order
1. Project setup, Supabase connection, auth (sign up / log in) and roles
2. Menu + cart (FR-01, FR-02)
3. Checkout + order submission + payment method (FR-01, FR-02)
4. Staff live queue + status rules (FR-03)
5. Customer live tracking + notifications (FR-05)
6. Delivery assignment + driver screen (FR-04)
7. Manager reports + daily closeout; Supervisor refunds (FR-06, UC-07)
8. Security hardening, seed data, testing against each SRS acceptance criterion, deploy to Vercel
