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
- Login with "email or student ID": the SRS allows both. For now login is EMAIL ONLY. Decide whether to add student ID login (and how customers without a student ID log in) before Build step 8.

## Decisions made
- Menu is public: anyone can browse it without logging in. Only ordering needs an account.
- Menu item category is a plain text column (not an enum).
- The cart lives in the browser for now; the server re-checks prices and availability at checkout (Build step 3).
- Strict role access: each role opens only its own screen (e.g. a manager cannot open /staff).
- Phone number is required at sign-up; minimum password length is 8.
- Login is email only for now (see "Open decisions" for student ID login).
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
- NOTE for Build step 6 (Donica): delivery orders are still completed without an Order ID check and their CASH payment stays UNPAID. The driver handover must confirm the Order ID (SAF-1) and mark cash received by the driver as PAID (p_cash_received), or FR-06 revenue will miss delivery cash.
- IMPORTANT for Build step 7 (FR-06 counts PAID orders only): cash orders must be marked PAID when the cash is received (at the counter or by the driver), and Lynk orders when the Supervisor verifies them. Otherwise revenue reports would miss them. Descriptions empty until the client says what comes with each meal.

## Known issues (fix before the demo)
- Customer order page (/orders/[id]) does not update live since migration 0013 (Step 31): staff status changes only show after a manual refresh (data is correct then). Worked in Steps 29-30. Checked so far: data and code paths correct, Realtime connects, no Supabase incident, build passes, customer page/OrderLiveRefresh/orders policies unchanged by Step 31. Next: check the live label + browser console on the customer page, and whether Realtime delivers orders changes to a customer login after 0013.

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
