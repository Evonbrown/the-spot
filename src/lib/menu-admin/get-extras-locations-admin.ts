/*
 * src/lib/menu-admin/get-extras-locations-admin.ts   (SERVER ONLY)
 *
 * WHAT: Reads the Manager's "Extras" and "Delivery" tabs (Step 40b, QA-3):
 *         getAdminExtras()    -> EVERY extra, incl. unavailable and removed;
 *         getAdminLocations() -> EVERY delivery location, incl. switched off.
 *
 * LAYER: Application layer. NOT cached (the customer copies in
 *        customizations.ts / delivery-locations.ts are): the Manager must see
 *        their own change at once.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AdminExtra = {
  id: number;
  name: string;
  kind: "side" | "sauce";
  extraPrice: number;
  isAvailable: boolean;
  isArchived: boolean; // removed (kept for old orders)
  updatedAt: string; // to spot two Managers editing at once
};

export type AdminLocation = {
  id: number;
  name: string;
  deliveryFee: number;
  feeConfirmed: boolean; // false = shown as "(sample, not final)" at checkout
  isActive: boolean; // false = customers can't choose it
  updatedAt: string;
};

/* Every extra, in menu order. THROWS if the database can't be reached. */
export async function getAdminExtras(): Promise<AdminExtra[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customizations")
    .select("id, name, kind, extra_price, is_available, is_archived, updated_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("getAdminExtras failed:", error.message);
    throw new Error("Could not load the extras.");
  }
  type Row = {
    id: number;
    name: string;
    kind: "side" | "sauce";
    extra_price: number | string;
    is_available: boolean;
    is_archived: boolean;
    updated_at: string;
  };
  return (data as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    extraPrice: Number(row.extra_price),
    isAvailable: row.is_available,
    isArchived: row.is_archived,
    updatedAt: row.updated_at,
  }));
}

/* Every delivery location, in list order. THROWS if the database can't be reached. */
export async function getAdminLocations(): Promise<AdminLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_locations")
    .select("id, name, delivery_fee, fee_confirmed, is_active, updated_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("getAdminLocations failed:", error.message);
    throw new Error("Could not load the delivery locations.");
  }
  type Row = {
    id: number;
    name: string;
    delivery_fee: number | string;
    fee_confirmed: boolean;
    is_active: boolean;
    updated_at: string;
  };
  return (data as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    deliveryFee: Number(row.delivery_fee),
    feeConfirmed: row.fee_confirmed,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}
