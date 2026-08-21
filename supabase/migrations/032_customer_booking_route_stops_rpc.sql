-- Allows a signed-in customer to read only route stops that belong to their own booking.
-- The customer portal uses this as the source of truth for delivery and pickup timing.

create or replace function public.get_my_booking_route_stops(p_booking_id uuid)
returns table (
  id uuid,
  booking_id uuid,
  stop_type text,
  stop_date date,
  scheduled_start_time time,
  scheduled_end_time time,
  status text,
  sort_order integer,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rs.id,
    rs.booking_id,
    rs.stop_type::text,
    rs.stop_date,
    rs.scheduled_start_time,
    rs.scheduled_end_time,
    rs.status::text,
    rs.sort_order,
    rs.updated_at,
    rs.created_at
  from public.route_stops rs
  join public.bookings b on b.id = rs.booking_id
  join public.customers c on c.id = b.customer_id
  where rs.booking_id = p_booking_id
    and c.auth_user_id = auth.uid()
  order by
    rs.updated_at desc nulls last,
    rs.created_at desc nulls last;
$$;

revoke all on function public.get_my_booking_route_stops(uuid) from public;
grant execute on function public.get_my_booking_route_stops(uuid) to authenticated;

notify pgrst, 'reload schema';
