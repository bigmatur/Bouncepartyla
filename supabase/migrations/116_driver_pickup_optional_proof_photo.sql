-- 116_driver_pickup_optional_proof_photo.sql
-- Delivery proof photo remains required.
-- Pickup proof photo is optional and is used only when evidence is needed.

begin;

create or replace function public.update_my_route_stop_status(
  p_stop_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_driver_name text;
  v_stop public.route_stops%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_now timestamptz := now();

  v_booking_balance numeric := 0;
  v_effective_balance numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_stop_id is null then
    raise exception 'Route stop id is required.';
  end if;

  if v_status not in (
    'on_the_way',
    'arrived',
    'installed',
    'picked_up',
    'completed'
  ) then
    raise exception 'Unsupported route stop status.';
  end if;

  select rd.name
    into v_driver_name
  from public.route_drivers rd
  where rd.auth_user_id = v_user_id
    and coalesce(rd.active, true) = true
    and rd.deleted_at is null
  order by
    rd.sort_order asc nulls last,
    rd.created_at asc nulls last,
    rd.id
  limit 1;

  if v_driver_name is null then
    raise exception 'An active linked driver account is required.';
  end if;

  select rs.*
    into v_stop
  from public.route_stops rs
  where rs.id = p_stop_id
    and rs.driver_name = v_driver_name
    and lower(coalesce(rs.stop_type::text, '')) in ('delivery', 'pickup')
  for update;

  if not found then
    raise exception 'The route stop is not assigned to this driver.';
  end if;

  if
    v_status = 'installed'
    and lower(coalesce(v_stop.stop_type::text, '')) <> 'delivery'
  then
    raise exception 'Only a delivery stop can be marked installed.';
  end if;

  if
    v_status = 'picked_up'
    and lower(coalesce(v_stop.stop_type::text, '')) <> 'pickup'
  then
    raise exception 'Only a pickup stop can be marked picked up.';
  end if;

  if v_status in ('installed', 'picked_up', 'completed') then
    if lower(coalesce(v_stop.stop_type::text, '')) = 'delivery' then
      if v_stop.booking_id is not null then
        select greatest(coalesce(b.balance_due, 0), 0)
          into v_booking_balance
        from public.bookings b
        where b.id = v_stop.booking_id;

        v_effective_balance := coalesce(v_booking_balance, 0);
      else
        v_effective_balance :=
          greatest(coalesce(v_stop.balance_due, 0), 0);
      end if;
    else
      v_effective_balance :=
        greatest(coalesce(v_stop.balance_due, 0), 0);
    end if;

    if
      v_effective_balance > 0
      and not coalesce(v_stop.payment_collected, false)
    then
      raise exception 'Collect payment before completing this stop.';
    end if;

    -- Delivery requires proof before completion.
    -- Pickup proof is intentionally optional.
    if
      lower(coalesce(v_stop.stop_type::text, '')) = 'delivery'
      and not coalesce(v_stop.proof_photo_uploaded, false)
    then
      raise exception 'Upload proof photo before completing this stop.';
    end if;
  end if;

  begin
    perform public.start_my_staff_time('driver_route');
  exception
    when others then
      if sqlerrm <>
        'A stale open work shift requires administrator review before work can be started.'
      then
        raise;
      end if;
  end;

  update public.route_stops
     set status = v_status::public.route_stop_status,
         arrived_at = case
           when v_status = 'arrived'
             then coalesce(arrived_at, v_now)
           else arrived_at
         end,
         completed_at = case
           when v_status in ('installed', 'picked_up', 'completed')
             then coalesce(completed_at, v_now)
           else completed_at
         end,
         updated_at = v_now
   where id = p_stop_id
   returning * into v_stop;

  return jsonb_build_object(
    'id', v_stop.id,
    'status', v_stop.status,
    'arrived_at', v_stop.arrived_at,
    'completed_at', v_stop.completed_at,
    'payment_collected', v_stop.payment_collected,
    'proof_photo_uploaded', v_stop.proof_photo_uploaded,
    'updated_at', v_stop.updated_at
  );
end;
$function$;

revoke all on function public.update_my_route_stop_status(uuid, text)
  from public, anon;

grant execute on function public.update_my_route_stop_status(uuid, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
