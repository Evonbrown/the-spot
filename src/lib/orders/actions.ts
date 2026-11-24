/*
 * src/lib/orders/actions.ts
 *
 * WHAT: placeOrder(): the Server Action behind the "Place order" button.
 *       It checks the whole order again, works out every price from the
 *       database, and saves the order with the create_order() database
 *       function. It returns the new Order ID (e.g. 1001) or a message
 *       saying what's wrong.
 *
 * LAYER: Application layer. This is where the ordering business rules live
 *        (CLAUDE.md: "never only in the browser"). The checkout page
 *        (Presentation) only CALLS it; the tables (Data layer) are written by
 *        create_order(), which only our server may run.
 *
 * WHY CHECK EVERYTHING AGAIN? The cart lives in the browser, and anyone can
 * edit what their browser sends (DevTools, a hand-made request). So we trust
 * NOTHING from the browser except "which item, which size, which extras,
 * how many, which note". Prices, fees, availability, lead times and the
 * customer's identity all come from the server's side.
 *
 * SRS rules enforced here:
 *   FR-01  items must be available; delivery only to active locations;
 *          lead times (pickup 0 / fries 15 / delivery 20, larger wins);
 *          hours 11:00-7:00; same day; 15-minute steps.
 *   FR-02  extras only on food, each at most once; meal note <= 200 chars;
 *          total = items + extras + delivery fee (delivery only);
 *          payment Lynk or Cash (the order is submitted straight away).
 *   Security: logged-in customers only; the customer id comes from the
 *          login cookie, never from the browser.
 * Decision: if a price, fee or availability changed since the customer
 *   added it, REFUSE the order and list exactly what changed. The cart is
 *   left as it is (the customer fixes it on the cart page).
 *
 * "use server" = every exported function here is a Server Action: the browser
 * can ask the server to run it, but the code itself never goes to the browser.
 */
"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import {
  calculateLinePrice,
  formatExtraPrice,
  formatPrice,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  type Size,
} from "@/lib/menu-helpers";
import {
  canOrderToday,
  checkRequestedTime,
  earliestReadyTime,
  leadTimeMinutes,
  type Fulfilment,
} from "@/lib/order-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { getOpeningHours } from "@/lib/test-settings";

// ---- What the browser sends, and what it gets back ---------------------------

/*
 * PlaceOrderLine: one cart line as the browser sends it.
 * unitPrice / extraPrice / name are what the CART SHOWED. We never charge
 * them; we only compare them with the database to tell the customer what
 * changed (decision).
 */
export type PlaceOrderLine = {
  itemId: number;
  name: string;
  size: Size | null;
  unitPrice: number;
  extras: { id: number; name: string; extraPrice: number }[];
  note: string;
  quantity: number;
};

export type PlaceOrderInput = {
  clientRequestId: string; // random id for THIS checkout (stops double orders)
  fulfilment: Fulfilment; // "PICKUP" | "DELIVERY"
  deliveryLocationId: number | null; // delivery only
  shownDeliveryFee: number; // the fee the page showed (0 for pickup)
  timeChoice: "ASAP" | "LATER";
  requestedTime: number | null; // "LATER" only: milliseconds since 1970
  paymentMethod: "LYNK" | "CASH";
  lines: PlaceOrderLine[];
};

/*
 * PlaceOrderResult:
 *   ok: true  -> the order was saved; orderId is its number (e.g. 1001)
 *   ok: false -> nothing was saved; error says why, and changes (if any)
 *                lists each thing that changed since it was added to the cart
 */
export type PlaceOrderResult =
  | { ok: true; orderId: number }
  | { ok: false; error: string; changes?: string[] };

// ---- Small helpers -------------------------------------------------------------

// Shown when what the browser sent doesn't have the right shape. That only
// happens with a damaged cart or a hand-made request, so we keep it general.
const BAD_REQUEST =
  "Something in your order doesn't look right. Please go back to your cart, remove the item and add it again.";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prices are compared in whole cents, so 1200 and 1200.00 count as the same.
const cents = (dollars: number) => Math.round(dollars * 100);

const isWholeNumber = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;
const isMoney = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

/*
 * readInput(raw) -> the input if EVERY field has the right type, otherwise null.
 * The type PlaceOrderInput only exists while we write code; at run time the
 * browser could send anything. So we check by hand before using it.
 */
function readInput(raw: unknown): PlaceOrderInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const okTop =
    typeof input.clientRequestId === "string" &&
    UUID_PATTERN.test(input.clientRequestId) &&
    (input.fulfilment === "PICKUP" || input.fulfilment === "DELIVERY") &&
    (input.deliveryLocationId === null || isWholeNumber(input.deliveryLocationId)) &&
    isMoney(input.shownDeliveryFee) &&
    (input.timeChoice === "ASAP" || input.timeChoice === "LATER") &&
    (input.requestedTime === null ||
      (input.timeChoice === "LATER" &&
        typeof input.requestedTime === "number" &&
        Number.isFinite(input.requestedTime))) &&
    (input.paymentMethod === "LYNK" || input.paymentMethod === "CASH") &&
    Array.isArray(input.lines) &&
    input.lines.length <= 100;
  if (!okTop) return null;

  const linesOk = (input.lines as unknown[]).every((value) => {
    if (typeof value !== "object" || value === null) return false;
    const line = value as Record<string, unknown>;
    return (
      isWholeNumber(line.itemId) &&
      typeof line.name === "string" &&
      line.name.trim().length > 0 &&
      (line.size === null || line.size === "Small" || line.size === "Medium" || line.size === "Large") &&
      isMoney(line.unitPrice) &&
      typeof line.note === "string" &&
      Number.isInteger(line.quantity) &&
      Array.isArray(line.extras) &&
      (line.extras as unknown[]).every((e) => {
        if (typeof e !== "object" || e === null) return false;
        const extra = e as Record<string, unknown>;
        return isWholeNumber(extra.id) && typeof extra.name === "string" && isMoney(extra.extraPrice);
      })
    );
  });
  return linesOk ? (input as PlaceOrderInput) : null;
}

// What we read from the database (fresh, NOT the cached menu copy).
type MenuRow = {
  id: number;
  name: string;
  price: number | string | null;
  price_small: number | string | null;
  price_medium: number | string | null;
  price_large: number | string | null;
  is_available: boolean;
  is_made_to_order: boolean;
};
type ExtraRow = { id: number; name: string; extra_price: number | string; is_available: boolean };
type LocationRow = { id: number; name: string; delivery_fee: number | string; is_active: boolean };

/*
 * priceFor(row, size) -> the real price for that size, or null if the item
 * isn't sold that way. Single-price items (drinks) must have size null;
 * sized items (food) must name a size they offer (an empty size = not offered).
 */
function priceFor(row: MenuRow, size: Size | null): number | null {
  if (row.price !== null) return size === null ? Number(row.price) : null;
  const bySize = { Small: row.price_small, Medium: row.price_medium, Large: row.price_large };
  if (size === null || bySize[size] === null) return null;
  return Number(bySize[size]);
}

// One order item in the shape create_order() expects (see migration 0006).
type OrderItemJson = {
  menu_item_id: number;
  item_name: string;
  size: Size | null;
  unit_price: number;
  quantity: number;
  note: string;
  line_total: number;
  extras: { customization_id: number; customization_name: string; extra_price: number }[];
};

// ---- The Server Action ------------------------------------------------------------

/*
 * placeOrder(rawInput) -> PlaceOrderResult
 * Steps 1-7 below. Nothing is saved unless every step passes, and the save
 * itself (step 7) is one transaction: the whole order or nothing.
 */
export async function placeOrder(rawInput: unknown): Promise<PlaceOrderResult> {
  // ---- 1. WHO: a logged-in customer (Security; strict role screens) ----
  // The id comes from the signed login cookie, never from the browser's data.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: "Please log in again to place your order." };
  }
  if (profile.role !== "customer") {
    return { ok: false, error: "Only customer accounts can place orders." };
  }

  // ---- 2. SHAPE: every field the right type and within the rules ----
  const input = readInput(rawInput);
  if (!input) return { ok: false, error: BAD_REQUEST };
  if (input.lines.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }
  for (const line of input.lines) {
    // Decision: 1 to 10 of an item per cart line.
    if (line.quantity < 1 || line.quantity > MAX_QUANTITY) return { ok: false, error: BAD_REQUEST };
    // FR-02 / decision: a meal note is at most 200 characters.
    if (line.note.length > MAX_NOTE_LENGTH) {
      return {
        ok: false,
        error: `A meal note is longer than ${MAX_NOTE_LENGTH} characters. Please remove that item and add it again with a shorter note.`,
      };
    }
    // FR-02 / decision: each extra at most once per line.
    const extraIds = line.extras.map((e) => e.id);
    if (new Set(extraIds).size !== extraIds.length) return { ok: false, error: BAD_REQUEST };
  }
  // FR-01/FR-04: delivery needs a location; pickup must not have one.
  if ((input.fulfilment === "DELIVERY") !== (input.deliveryLocationId !== null)) {
    return { ok: false, error: BAD_REQUEST };
  }

  // ---- 3. FRESH DATA from the database ----
  // The public (normal) connection is enough to READ the menu: RLS lets anyone
  // read it. We don't use the cached menu (up to ~1 minute old): what we
  // charge must be what the database says right now.
  const db = createPublicClient();
  const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
  const extraIds = [...new Set(input.lines.flatMap((l) => l.extras.map((e) => e.id)))];

  const [menuResult, extrasResult, locationResult] = await Promise.all([
    db
      .from("menu_items")
      .select("id, name, price, price_small, price_medium, price_large, is_available, is_made_to_order")
      .in("id", itemIds),
    extraIds.length > 0
      ? db.from("customizations").select("id, name, extra_price, is_available").in("id", extraIds)
      : Promise.resolve({ data: [] as ExtraRow[], error: null }),
    input.deliveryLocationId !== null
      ? db
          .from("delivery_locations")
          .select("id, name, delivery_fee, is_active")
          .eq("id", input.deliveryLocationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (menuResult.error || extrasResult.error || locationResult.error) {
    // Logged in the terminal for us; customers get a friendly message.
    console.error(
      "placeOrder: could not read the menu:",
      menuResult.error?.message ?? extrasResult.error?.message ?? locationResult.error?.message
    );
    return { ok: false, error: "We couldn't reach our menu just now. Please try again." };
  }

  const menuById = new Map((menuResult.data as MenuRow[]).map((row) => [row.id, row]));
  const extraById = new Map((extrasResult.data as ExtraRow[]).map((row) => [row.id, row]));
  const location = locationResult.data as LocationRow | null;

  // ---- 4. CHECK EACH LINE and work out its REAL price (FR-01, FR-02) ----
  // "changes" collects every difference, so the customer sees them all at
  // once instead of one per attempt (decision).
  const changes: string[] = [];
  const orderItems: OrderItemJson[] = [];

  for (const line of input.lines) {
    const label = line.size ? `${line.name} (${line.size})` : line.name;
    const row = menuById.get(line.itemId);

    if (!row) {
      changes.push(`${label} is no longer on the menu.`);
      continue;
    }
    // FR-01: unavailable items cannot be ordered.
    if (!row.is_available) {
      changes.push(`${label} is not available right now.`);
      continue;
    }
    const realPrice = priceFor(row, line.size);
    if (realPrice === null) {
      changes.push(`${label} is no longer sold in that size.`);
      continue;
    }
    if (cents(realPrice) !== cents(line.unitPrice)) {
      changes.push(`${label} is now ${formatPrice(realPrice)} (your cart says ${formatPrice(line.unitPrice)}).`);
    }

    // Decision (FR-02): extras are only for food (sized items); drinks have none.
    if (line.extras.length > 0 && row.price !== null) return { ok: false, error: BAD_REQUEST };

    const extras: OrderItemJson["extras"] = [];
    for (const extra of line.extras) {
      const extraRow = extraById.get(extra.id);
      if (!extraRow || !extraRow.is_available) {
        changes.push(`The extra "${extra.name}" (on ${label}) is not available right now.`);
        continue;
      }
      const realExtraPrice = Number(extraRow.extra_price);
      if (cents(realExtraPrice) !== cents(extra.extraPrice)) {
        changes.push(
          `The extra "${extraRow.name}" (on ${label}) is now ${formatExtraPrice(realExtraPrice)} (your cart says ${formatExtraPrice(extra.extraPrice)}).`
        );
      }
      // Saved with the DATABASE name and price (a copy, so later price changes
      // don't change what this customer paid).
      extras.push({
        customization_id: extraRow.id,
        customization_name: extraRow.name,
        extra_price: realExtraPrice,
      });
    }

    orderItems.push({
      menu_item_id: row.id,
      item_name: row.name,
      size: line.size,
      unit_price: realPrice,
      quantity: line.quantity,
      note: line.note,
      // FR-02: (size price + extras) x quantity, the SAME function the cart uses.
      line_total: calculateLinePrice(
        realPrice,
        extras.map((e) => ({ extraPrice: e.extra_price })),
        line.quantity
      ),
      extras,
    });
  }

  // ---- 5. DELIVERY: an active location, fee from the database (FR-01, FR-02) ----
  let deliveryFee = 0;
  if (input.fulfilment === "DELIVERY") {
    if (!location || !location.is_active) {
      changes.push("We no longer deliver to the location you chose. Please choose another one.");
    } else {
      deliveryFee = Number(location.delivery_fee);
      if (cents(deliveryFee) !== cents(input.shownDeliveryFee)) {
        changes.push(
          `The delivery fee to ${location.name} is now ${formatPrice(deliveryFee)} (the page said ${formatPrice(input.shownDeliveryFee)}).`
        );
      }
    }
  }

  // Decision: anything changed -> refuse, list it, leave the cart alone.
  if (changes.length > 0) {
    return {
      ok: false,
      error: "Some things changed since you added them. Nothing was ordered. Please update your cart and try again.",
      changes,
    };
  }

  // ---- 6. TIME: hours, lead times, same day, 15-minute steps (FR-01) ----
  // Lead time from the FRESH "made to order" flags (fries need 15 min pickup).
  const hasMadeToOrder = orderItems.some((item) => menuById.get(item.menu_item_id)?.is_made_to_order);
  const lead = leadTimeMinutes(input.fulfilment, hasMadeToOrder);
  const hours = getOpeningHours(); // real hours, or "all day" only in laptop test mode
  const now = Date.now();

  let requestedTime: number;
  if (input.timeChoice === "ASAP") {
    if (!canOrderToday(now, lead, hours)) {
      return { ok: false, error: "Sorry, we're closed for orders today. We're open 11:00 a.m. – 7:00 p.m." };
    }
    requestedTime = earliestReadyTime(now, lead, hours);
  } else {
    if (input.requestedTime === null) return { ok: false, error: "Please choose a time." };
    const timeError = checkRequestedTime(now, input.requestedTime, lead, hours);
    if (timeError) return { ok: false, error: timeError };
    requestedTime = input.requestedTime;
  }

  // ---- 7. SAVE: create_order() with the secret key (one transaction) ----
  // FR-02: items total = sum of the line totals, added in whole cents.
  const itemsTotal = orderItems.reduce((sum, item) => sum + cents(item.line_total), 0) / 100;

  const admin = createAdminClient();
  const { data: orderId, error } = await admin.rpc("create_order", {
    p_customer_id: profile.id, // from the login cookie (step 1)
    p_client_request_id: input.clientRequestId, // same id twice -> same order, not two
    p_fulfilment: input.fulfilment,
    p_delivery_location_id: input.deliveryLocationId,
    p_requested_time: new Date(requestedTime).toISOString(),
    p_is_asap: input.timeChoice === "ASAP",
    p_items_total: itemsTotal,
    p_delivery_fee: deliveryFee,
    p_payment_method: input.paymentMethod,
    p_items: orderItems,
  });

  // Step 36: today has already been closed out (the database refuses new
  // orders for a locked day): say so plainly.
  if (error?.message === "The Spot has closed for today. Please order tomorrow.") {
    return { ok: false, error: error.message };
  }
  if (error || typeof orderId !== "number") {
    console.error("placeOrder: create_order failed:", error?.message ?? orderId);
    return { ok: false, error: "We couldn't place your order, so nothing was ordered. Please try again." };
  }

  // FR-01: the unique numeric Order ID for the confirmation.
  return { ok: true, orderId };
}
