-- Staff Mobile proof-photo synchronization
--
-- The driver may insert/delete an assigned stop's booking photo, but route-stop
-- completion trusts route_stops.proof_photo_uploaded. Keep that marker derived
-- from the actual photo rows through a narrowly scoped, assignment-checked RPC.

begin;

create or replace function public.sync_my_route_stop_proof_photo_status(
  p_stop_id uuid,
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop public.route_stops%rowtype;
  v_has_proof boolean := false;
begin
  if p_stop_id is null or p_booking_id is null then
    raise exception 'Route stop and booking are required.';
  end if;

  v_stop := public.get_my_assigned_route_stop(p_stop_id);

  if v_stop.id is null
     or v_stop.booking_id is null
     or v_stop.booking_id is distinct from p_booking_id then
    raise exception 'The route stop is not assigned to this driver.';
  end if;

  select exists (
    select 1
    from public.booking_photos p
    where p.booking_id = p_booking_id
      and p.route_stop_id = p_stop_id
  )
  into v_has_proof;

  update public.route_stops
     set proof_photo_uploaded = v_has_proof,
         updated_at = now()
   where id = p_stop_id
     and booking_id = p_booking_id;

  return jsonb_build_object(
    'route_stop_id', p_stop_id,
    'proof_photo_uploaded', v_has_proof
  );
end;
$$;

revoke all on function public.sync_my_route_stop_proof_photo_status(uuid, uuid)
  from public, anon;

grant execute on function public.sync_my_route_stop_proof_photo_status(uuid, uuid)
  to authenticated;

-- Repair historical uploads that reached booking_photos but could not update
-- the route-stop marker under the driver's row-level permissions.
update public.route_stops rs
   set proof_photo_uploaded = true,
       updated_at = now()
 where not coalesce(rs.proof_photo_uploaded, false)
   and exists (
     select 1
     from public.booking_photos p
     where p.route_stop_id = rs.id
       and p.booking_id = rs.booking_id
   );

notify pgrst, 'reload schema';

commit;
