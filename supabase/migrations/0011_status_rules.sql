-- =============================================================================
-- supabase/migrations/0011_status_rules.sql   (Build step 4, Step 28)
--
-- WHAT: The FULL order status rules, enforced by the DATABASE itself
--       (FR-05 SR-5.3 and SR-5.5, CLAUDE.md "Order statuses"):
--         1. Counter staff may READ order_status_history (until now only
--            customers could, for their own orders). The server needs it to
--            know WHEN an order became Ready for pickup (the 20-minute rule),
--            and the staff page shows "Ready since 2:15 p.m.".
--         2. A TRIGGER on orders that checks every status change:
--              - finished orders (COMPLETED, CANCELLED, ABANDONED) are locked;
--              - CANCELLED is allowed from any status that isn't finished;
--              - ABANDONED: pickup orders only, only from READY_FOR_PICKUP,
--                only 20 minutes or more after it became READY_FOR_PICKUP;
--              - everything else: exactly ONE step forward on the order's path
--                (no skipping, no going backwards).
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHY HERE TOO? The server already checks these rules and gives staff a
--   friendly message (src/lib/orders/status-rules.ts). The trigger is the
--   SAFETY NET: it also catches a hand-made request, a future function (e.g.
--   the driver screen, Build step 6) or a mistake typed into the SQL Editor.
--   "Defence in depth" = more than one lock on the same door.
--
-- WHAT IS A TRIGGER? A small function that Postgres runs AUTOMATICALLY, here
--   "before any UPDATE of orders.status". If it raises an error, the whole
--   change is cancelled (and, inside change_order_status(), the history row
--   and cash payment too: it's one transaction).
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0011_status_rules_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. RLS: counter staff may READ every order's status history (read-only;
--    nobody can write it except through change_order_status(), 0009/0010).
--    Policies ADD UP, so customers still see only their own orders' history
--    (0006).
-- -----------------------------------------------------------------------------
create policy "Counter staff can read all order history"
  on public.order_status_history
  for select
  to authenticated
  using ((select public.current_user_role()) = 'counter_staff');


-- -----------------------------------------------------------------------------
-- 2. The rule function the trigger runs.
--    "old" = the order row BEFORE the change, "new" = the row AFTER it.
--    Returning "new" = "allowed, go ahead". "raise exception" = refuse.
--    The messages are for us (developers): staff normally see the friendly
--    message from the server, which checks first.
-- -----------------------------------------------------------------------------
create function public.enforce_order_status_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_steps    public.order_status[]; -- the order's normal path, in order
  v_from     integer;               -- position of the old status on that path
  v_to       integer;               -- position of the new status on that path
  v_ready_at timestamptz;           -- when it became READY_FOR_PICKUP
begin
  -- SR-5.3: finished orders stay finished.
  if old.status in ('COMPLETED', 'CANCELLED', 'ABANDONED') then
    raise exception 'Order % is already %. Finished orders can''t change.', old.id, old.status;
  end if;

  -- Nothing would change.
  if new.status = old.status then
    raise exception 'Order % is already %.', old.id, old.status;
  end if;

  -- Cancel: allowed at any stage before the order is finished.
  if new.status = 'CANCELLED' then
    return new;
  end if;

  -- SR-5.5: Abandoned.
  if new.status = 'ABANDONED' then
    if old.fulfilment <> 'PICKUP' then
      raise exception 'Order %: only pickup orders can be marked ABANDONED.', old.id;
    end if;
    if old.status <> 'READY_FOR_PICKUP' then
      raise exception 'Order %: only a READY_FOR_PICKUP order can be marked ABANDONED (it is %).',
        old.id, old.status;
    end if;

    -- When did it become ready? The LATEST such history row (same as the server).
    select max(h.changed_at) into v_ready_at
      from public.order_status_history h
     where h.order_id = old.id
       and h.status = 'READY_FOR_PICKUP';

    if v_ready_at is null then
      raise exception 'Order %: we can''t tell when it became READY_FOR_PICKUP, so it can''t be ABANDONED.', old.id;
    end if;

    -- 20 minutes OR MORE: at exactly 20:00 it IS allowed (same as the server,
    -- ABANDON_AFTER_MINUTES in src/lib/order-status.ts: change both together).
    -- now() = the database's clock, the final say.
    if now() < v_ready_at + interval '20 minutes' then
      raise exception 'Order % can only be marked ABANDONED 20 minutes after it was ready (ready at %, allowed from %).',
        old.id, v_ready_at, v_ready_at + interval '20 minutes';
    end if;

    return new;
  end if;

  -- Forward, one step at a time, on the order's own path
  -- (same lists as statusSteps() in src/lib/order-status.ts).
  if old.fulfilment = 'DELIVERY' then
    v_steps := array['PENDING', 'IN_PROGRESS', 'READY_FOR_PICKUP', 'BEING_DELIVERED', 'COMPLETED']::public.order_status[];
  else
    v_steps := array['PENDING', 'IN_PROGRESS', 'READY_FOR_PICKUP', 'COMPLETED']::public.order_status[];
  end if;

  -- array_position = "where is it in the list?" (1, 2, 3...), or null if not there.
  v_from := array_position(v_steps, old.status);
  v_to   := array_position(v_steps, new.status);

  if v_to is null then
    raise exception 'Order %: % orders don''t go to %.', old.id, old.fulfilment, new.status;
  end if;
  if v_from is null then
    raise exception 'Order %: status % isn''t on the % path.', old.id, old.status, old.fulfilment;
  end if;
  if v_to < v_from then
    raise exception 'Order % can''t go back from % to %. Statuses only move forward.',
      old.id, old.status, new.status;
  end if;
  if v_to > v_from + 1 then
    raise exception 'Order %: can''t skip steps. The next step after % is %.',
      old.id, old.status, v_steps[v_from + 1];
  end if;

  return new; -- exactly one step forward: allowed
end;
$$;

-- Nobody calls this function directly; only the trigger below runs it.
revoke execute on function public.enforce_order_status_rules() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. The trigger itself.
--    "before update of status" = run the check BEFORE the change is saved,
--    and only when an UPDATE names the status column (e.g. not for the
--    updated_at trigger). "for each row" = once for every order changed.
--    It runs for EVERYONE, even our server's secret key and the SQL Editor:
--    that's the point.
-- -----------------------------------------------------------------------------
create trigger orders_enforce_status_rules
  before update of status on public.orders
  for each row
  execute function public.enforce_order_status_rules();
