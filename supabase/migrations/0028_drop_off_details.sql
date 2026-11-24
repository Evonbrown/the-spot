-- =============================================================================
-- supabase/migrations/0028_drop_off_details.sql   (Build step 8, Step 41)
--
-- WHAT: DROP-OFF DETAILS for delivery orders (FR-01 SR-1.3, AC-2, TS-2.2):
--       the building, room or landmark at the delivery location, e.g.
--       "Chancellor Hall, Block B", so the driver knows exactly where to go.
--         1. orders.drop_off_details: 3-200 characters for DELIVERY orders;
--            pickup orders never have any;
--         2. create_order() gets one more input, p_drop_off_details, and
--            REFUSES a new delivery order without it.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHY THE "REQUIRED" RULE IS IN create_order() AND NOT A CHECK RULE:
--   older delivery orders already exist WITHOUT details. A CHECK rule would
--   also run when such an order's STATUS changes later (any update re-checks
--   the row), and refuse it. create_order() only runs for NEW orders.
--
-- NO NEW READ RULES: counter staff (0007), the assigned driver (0014) and the
--   customer (their own order, 0006) can already read the orders row.
--
-- OLDER TEST FILES: every create_order call for a DELIVERY order now needs
--   the extra input; those test files were updated in this step. Pickup
--   calls are unchanged (the new input defaults to empty).
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0028_drop_off_details_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The column and its rules.
--    - when filled in: 3 to 200 characters (without spaces at the ends);
--    - pickup orders: always empty.
-- -----------------------------------------------------------------------------
alter table public.orders add column drop_off_details text;

alter table public.orders
  add constraint orders_drop_off_details_length
    check (drop_off_details is null or char_length(btrim(drop_off_details)) between 3 and 200),
  add constraint orders_drop_off_details_delivery_only
    check (fulfilment = 'DELIVERY' or drop_off_details is null);


-- -----------------------------------------------------------------------------
-- 2. create_order(), with p_drop_off_details at the END (default null), so
--    every existing pickup call works unchanged.
--    Changing a function's inputs = drop the old one and create the new one.
--    Everything else is EXACTLY as in 0006 (see the comments there), plus the
--    new "delivery needs drop-off details" check and the new column.
-- -----------------------------------------------------------------------------
drop function public.create_order(uuid, uuid, text, bigint, timestamptz, boolean, numeric, numeric, text, jsonb);

create function public.create_order(
  p_customer_id          uuid,
  p_client_request_id    uuid,
  p_fulfilment           text,
  p_delivery_location_id bigint,
  p_requested_time       timestamptz,
  p_is_asap              boolean,
  p_items_total          numeric,
  p_delivery_fee         numeric,
  p_payment_method       text,
  p_items                jsonb,
  p_drop_off_details     text default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_order_id      bigint;
  v_order_item_id bigint;
  v_item          jsonb;
  v_extra         jsonb;
  v_sum_lines     numeric := 0;
  -- Tidied: spaces at the ends removed; "" counts as nothing.
  v_drop_off      text := nullif(btrim(coalesce(p_drop_off_details, '')), '');
begin
  -- Safety net 1: an order must have at least one item.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item.';
  end if;

  -- Safety net 2: the line totals must add up to items_total.
  select coalesce(sum((item ->> 'line_total')::numeric), 0)
    into v_sum_lines
    from jsonb_array_elements(p_items) as item;
  if v_sum_lines <> p_items_total then
    raise exception 'Line totals (%) do not add up to items_total (%).', v_sum_lines, p_items_total;
  end if;

  -- Safety net 3 (Step 41, FR-01 SR-1.3): a DELIVERY order needs drop-off
  -- details; a pickup order has none (not saved even if sent).
  if p_fulfilment = 'DELIVERY' and v_drop_off is null then
    raise exception 'Add drop-off details (building, room or landmark).';
  end if;
  if p_fulfilment <> 'DELIVERY' then
    v_drop_off := null;
  end if;

  -- The order itself (same as 0006, plus drop_off_details).
  insert into public.orders (
    customer_id, client_request_id, fulfilment, delivery_location_id,
    requested_time, is_asap, items_total, delivery_fee, total, drop_off_details
  )
  values (
    p_customer_id, p_client_request_id, p_fulfilment, p_delivery_location_id,
    p_requested_time, p_is_asap, p_items_total, p_delivery_fee,
    p_items_total + p_delivery_fee, v_drop_off
  )
  on conflict (client_request_id) do nothing
  returning id into v_order_id;

  -- Already saved before? Return that order's id (same customer only).
  if v_order_id is null then
    select id into v_order_id
      from public.orders
     where client_request_id = p_client_request_id
       and customer_id = p_customer_id;
    if v_order_id is null then
      raise exception 'This checkout id was already used.';
    end if;
    return v_order_id;
  end if;

  -- Each order item, then its extras.
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items (
      order_id, menu_item_id, item_name, size, unit_price, quantity, note, line_total
    )
    values (
      v_order_id,
      (v_item ->> 'menu_item_id')::bigint,
      v_item ->> 'item_name',
      nullif(v_item ->> 'size', ''),
      (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'quantity')::integer,
      coalesce(v_item ->> 'note', ''),
      (v_item ->> 'line_total')::numeric
    )
    returning id into v_order_item_id;

    for v_extra in select * from jsonb_array_elements(coalesce(v_item -> 'extras', '[]'::jsonb)) loop
      insert into public.order_item_customizations (
        order_item_id, customization_id, customization_name, extra_price
      )
      values (
        v_order_item_id,
        (v_extra ->> 'customization_id')::bigint,
        v_extra ->> 'customization_name',
        (v_extra ->> 'extra_price')::numeric
      );
    end loop;
  end loop;

  -- FR-01: the order starts as PENDING. Record that in the history.
  insert into public.order_status_history (order_id, status, changed_by)
  values (v_order_id, 'PENDING', p_customer_id);

  -- FR-02: the payment (LYNK or CASH), UNPAID for now.
  insert into public.payments (order_id, method, amount)
  values (v_order_id, p_payment_method, p_items_total + p_delivery_fee);

  return v_order_id;
end;
$$;

-- Only the server (service_role) may run create_order(), as before.
revoke execute on function public.create_order(
  uuid, uuid, text, bigint, timestamptz, boolean, numeric, numeric, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.create_order(
  uuid, uuid, text, bigint, timestamptz, boolean, numeric, numeric, text, jsonb, text
) to service_role;
