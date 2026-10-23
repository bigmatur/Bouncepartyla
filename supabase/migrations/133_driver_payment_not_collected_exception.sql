-- 133_driver_payment_not_collected_exception.sql
-- Driver can report payment-not-collected (with mandatory reason)
-- and still complete the exact stop without marking money as collected.

begin;

create table if not exists public.route_stop_payment_exceptions (
  id uuid primary key default gen_random_uuid(),
  route_stop_id uuid not null references public.route_stops(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  stop_type text not null,
  route_driver_id uuid references public.route_drivers(id) on delete set null,
  driver_name text,
  auth_user_id uuid,
  reason_code text not null,
  reason_comment text,
  outstanding_balance numeric(10,2) not null default 0,
  reported_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_route_stop_payment_exceptions_booking_id
  on public.route_stop_payment_exceptions(booking_id);

create index if not exists idx_route_stop_payment_exceptions_reported_at
  on public.route_stop_payment_exceptions(reported_at desc);

create index if not exists idx_route_stop_payment_exceptions_stop_booking
  on public.route_stop_payment_exceptions(route_stop_id, booking_id);

create unique index if not exists uq_route_stop_payment_exceptions_active_stop_booking
  on public.route_stop_payment_exceptions(route_stop_id, booking_id)
  where is_active = true;

alter table public.route_stop_payment_exceptions enable row level security;

revoke all privileges on table public.route_stop_payment_exceptions from anon;
revoke all privileges on table public.route_stop_payment_exceptions from authenticated;
grant select on table public.route_stop_payment_exceptions to authenticated;

create policy route_stop_payment_exceptions_select_route_staff
on public.route_stop_payment_exceptions
for select
to authenticated
using (
  public.current_user_can_manage_routes()
  or (
    public.current_user_is_route_driver()
    and (
      route_stop_payment_exceptions.auth_user_id = auth.uid()
      or exists (
        select 1
        from public.route_drivers rd
        where rd.id = route_stop_payment_exceptions.route_driver_id
          and rd.auth_user_id = auth.uid()
          and coalesce(rd.active, true) = true
          and rd.deleted_at is null
      )
    )
  )
);

create policy route_stop_payment_exceptions_manage_route_staff
on public.route_stop_payment_exceptions
for all
to authenticated
using (public.current_user_can_manage_routes())
with check (public.current_user_can_manage_routes());

create or replace function public.report_my_route_stop_payment_not_collected(
  p_stop_id uuid,
  p_reason_code text,
  p_reason_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_driver_id uuid;
  v_driver_name text;
  v_stop public.route_stops%rowtype;
  v_booking public.bookings%rowtype;
  v_existing_exception public.route_stop_payment_exceptions%rowtype;
  v_now timestamptz := now();
  v_reason text := lower(trim(coalesce(p_reason_code, '')));
  v_comment text := nullif(trim(coalesce(p_reason_comment, '')), '');
  v_effective_balance numeric := 0;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_stop_id is null then
    raise exception 'Route stop id is required.';
  end if;

  if v_reason not in (
    'customer_will_pay_later',
    'customer_not_available',
    'online_payment_pending',
    'payment_issue',
    'other'
  ) then
    raise exception 'A valid payment-not-collected reason is required.';
  end if;

  if v_reason = 'other' and v_comment is null then
    raise exception 'Comment is required when reason is Other.';
  end if;

  select rd.id, rd.name
    into v_driver_id, v_driver_name
  from public.route_drivers rd
  where rd.auth_user_id = v_user_id
    and coalesce(rd.active, true) = true
    and rd.deleted_at is null
  order by rd.sort_order asc nulls last, rd.created_at asc nulls last, rd.id
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

  if lower(coalesce(v_stop.status::text, '')) in ('cancelled', 'failed', 'installed', 'picked_up', 'completed') then
    raise exception 'This route stop is not eligible for payment exception reporting.';
  end if;

  if v_stop.booking_id is null then
    raise exception 'This route stop is not linked to a booking.';
  end if;

  select *
    into v_booking
  from public.bookings b
  where b.id = v_stop.booking_id;

  if not found then
    raise exception 'Booking not found.';
  end if;

  if lower(coalesce(v_booking.status::text, '')) in ('cancelled', 'closed', 'refunded') then
    raise exception 'This booking is not eligible for payment exception reporting.';
  end if;

  v_effective_balance := greatest(coalesce(v_booking.balance_due, 0), 0);

  if v_effective_balance <= 0 then
    return jsonb_build_object(
      'stop_id', v_stop.id,
      'booking_id', v_stop.booking_id,
      'driver_name', v_driver_name,
      'reason_code', v_reason,
      'reason_comment', v_comment,
      'outstanding_balance', 0,
      'reported_at', v_now,
      'already_reported', false,
      'report_status', 'no_balance_due'
    );
  end if;

  select ex.*
    into v_existing_exception
  from public.route_stop_payment_exceptions ex
  where ex.route_stop_id = v_stop.id
    and ex.booking_id is not distinct from v_stop.booking_id
    and ex.is_active = true
  order by ex.reported_at asc, ex.created_at asc, ex.id asc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'stop_id', v_existing_exception.route_stop_id,
      'booking_id', v_existing_exception.booking_id,
      'driver_name', coalesce(v_existing_exception.driver_name, v_driver_name),
      'reason_code', v_existing_exception.reason_code,
      'reason_comment', v_existing_exception.reason_comment,
      'outstanding_balance', v_existing_exception.outstanding_balance,
      'reported_at', v_existing_exception.reported_at,
      'already_reported', true,
      'report_status', 'already_reported'
    );
  end if;

  insert into public.route_stop_payment_exceptions(
    route_stop_id,
    booking_id,
    stop_type,
    route_driver_id,
    driver_name,
    auth_user_id,
    reason_code,
    reason_comment,
    outstanding_balance,
    reported_at,
    is_active,
    updated_at
  ) values (
    v_stop.id,
    v_stop.booking_id,
    lower(coalesce(v_stop.stop_type::text, 'delivery')),
    v_driver_id,
    v_driver_name,
    v_user_id,
    v_reason,
    v_comment,
    v_effective_balance,
    v_now,
    true,
    v_now
  )
  on conflict (route_stop_id, booking_id)
  where is_active = true
  do nothing;

  get diagnostics v_inserted_count = row_count;

  select ex.*
    into v_existing_exception
  from public.route_stop_payment_exceptions ex
  where ex.route_stop_id = v_stop.id
    and ex.booking_id is not distinct from v_stop.booking_id
    and ex.is_active = true
  order by ex.reported_at asc, ex.created_at asc, ex.id asc
  limit 1;

  if not found then
    raise exception 'Could not persist payment-not-collected report.';
  end if;

  return jsonb_build_object(
    'stop_id', v_existing_exception.route_stop_id,
    'booking_id', v_existing_exception.booking_id,
    'driver_name', coalesce(v_existing_exception.driver_name, v_driver_name),
    'reason_code', v_existing_exception.reason_code,
    'reason_comment', v_existing_exception.reason_comment,
    'outstanding_balance', v_existing_exception.outstanding_balance,
    'reported_at', v_existing_exception.reported_at,
    'already_reported', (v_inserted_count = 0),
    'report_status', case when v_inserted_count = 0 then 'already_reported' else 'reported' end
  );
end;
$function$;

revoke all on function public.report_my_route_stop_payment_not_collected(uuid, text, text)
  from public, anon;

grant execute on function public.report_my_route_stop_payment_not_collected(uuid, text, text)
  to authenticated;

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
  v_has_payment_exception boolean := false;
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

    if
      v_effective_balance > 0
      and not coalesce(v_stop.payment_collected, false)
    then
      select exists (
        select 1
        from public.route_stop_payment_exceptions ex
        where ex.route_stop_id = v_stop.id
          and ex.booking_id is not distinct from v_stop.booking_id
          and ex.is_active = true
      )
      into v_has_payment_exception;

      if not v_has_payment_exception then
        raise exception 'Collect payment before completing this stop, or report Payment Not Collected with a reason.';
      end if;
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
    'payment_not_collected_reported', v_has_payment_exception,
    'proof_photo_uploaded', v_stop.proof_photo_uploaded,
    'updated_at', v_stop.updated_at
  );
end;
$function$;

revoke all on function public.update_my_route_stop_status(uuid, text)
  from public, anon;

grant execute on function public.update_my_route_stop_status(uuid, text)
  to authenticated;

insert into public.notification_events (
  code,
  category_code,
  label,
  description,
  sort_order,
  active
)
values (
  'payment_not_collected',
  'payments',
  'Payment not collected',
  'Driver reported payment was not collected at stop completion.',
  61,
  true
)
on conflict (code) do update set
  category_code = excluded.category_code,
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

insert into public.notification_templates (
  event_code,
  channel,
  name,
  subject,
  body_text,
  active
)
values (
  'payment_not_collected',
  'email',
  'Payment not collected email',
  'Payment not collected for {{booking_number}}',
  E'Driver reported payment was not collected for booking {{booking_number}}.\n\nOutstanding: {{balance_due}}\nDriver: {{driver_name}}\nStop type: {{stop_type}}\nReason: {{payment_exception_reason}}\nComment: {{payment_exception_comment}}\n\nOpen booking: {{action_url}}',
  true
)
on conflict (event_code, channel) do update set
  name = excluded.name,
  subject = excluded.subject,
  body_text = excluded.body_text,
  active = true,
  updated_at = now();

insert into public.notification_templates (
  event_code,
  channel,
  name,
  body_text,
  active
)
values (
  'payment_not_collected',
  'in_app',
  'Payment not collected in-app',
  E'Payment not collected for {{booking_number}}. Outstanding: {{balance_due}}. Driver: {{driver_name}}. Stop: {{stop_type}}. Reason: {{payment_exception_reason}}.',
  true
)
on conflict (event_code, channel) do update set
  name = excluded.name,
  body_text = excluded.body_text,
  active = true,
  updated_at = now();

insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select
  'payment_not_collected',
  role_name,
  channel_name,
  true,
  t.id
from (values ('admin'), ('manager')) as roles(role_name)
cross join (values ('in_app'), ('email')) as channels(channel_name)
left join public.notification_templates t
  on t.event_code = 'payment_not_collected'
 and t.channel = channels.channel_name
on conflict (event_code, recipient_role, channel) do update set
  enabled = true,
  template_id = coalesce(excluded.template_id, public.notification_rules.template_id),
  updated_at = now();

create or replace function public.enqueue_staff_booking_notification(
  p_event_code text,
  p_booking_id uuid,
  p_recipient_role text,
  p_dedupe_suffix text default null,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event public.notification_events%rowtype;
  v_rule record;
  v_recipient record;
  v_inserted integer := 0;
  v_inserted_for_rule integer := 0;
  v_key text;
  v_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_personalize_event boolean := p_event_code in (
    'booking_created',
    'customer_booking_approval_requested',
    'payment_received',
    'payment_not_collected'
  );
  v_personalize_rule boolean;
begin
  if p_booking_id is null or v_role = '' then
    return 0;
  end if;

  select * into v_event
  from public.notification_events
  where code = p_event_code and active = true;

  if not found then
    return 0;
  end if;

  for v_rule in
    select r.*, cs.enabled as channel_enabled
    from public.notification_rules r
    join public.notification_channel_settings cs on cs.channel = r.channel
    where r.event_code = p_event_code
      and lower(coalesce(r.recipient_role, '')) = v_role
      and r.enabled = true
      and cs.enabled = true
  loop
    v_inserted_for_rule := 0;
    v_personalize_rule := v_personalize_event and v_rule.channel in ('in_app', 'email');

    if v_personalize_rule then
      for v_recipient in
        select
          p.auth_user_id,
          nullif(lower(trim(coalesce(au.email, ''))), '') as email
        from public.profiles p
        left join auth.users au
          on au.id = p.auth_user_id
        where coalesce(p.is_active, true) = true
          and p.auth_user_id is not null
          and (
            lower(coalesce(p.role, '')) = v_role
            or (
              v_role = 'admin'
              and lower(coalesce(p.role, '')) = 'super_admin'
            )
          )
      loop
        if v_rule.channel = 'email' and v_recipient.email is null then
          continue;
        end if;

        v_key := concat_ws(
          ':',
          p_event_code,
          p_booking_id::text,
          v_role,
          v_rule.channel,
          v_recipient.auth_user_id::text,
          coalesce(p_dedupe_suffix, 'booking')
        );

        insert into public.notification_deliveries(
          event_code,
          category_code,
          channel,
          recipient_role,
          auth_user_id,
          recipient_email,
          booking_id,
          template_id,
          status,
          scheduled_for,
          dedupe_key,
          payload
        ) values (
          p_event_code,
          v_event.category_code,
          v_rule.channel,
          v_role,
          v_recipient.auth_user_id,
          case when v_rule.channel = 'email' then v_recipient.email else null end,
          p_booking_id,
          v_rule.template_id,
          'queued',
          now() + make_interval(mins => greatest(coalesce(v_rule.delay_minutes, 0), 0)),
          v_key,
          coalesce(p_payload, '{}'::jsonb)
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;

        if found then
          v_inserted := v_inserted + 1;
          v_inserted_for_rule := v_inserted_for_rule + 1;
        end if;
      end loop;

      -- For personalized channels, intentionally do not fall back to role-level
      -- deliveries: staff inboxes require concrete recipients.
      continue;
    end if;

    -- Legacy role-level behavior for unrelated events/channels.
    v_key := concat_ws(
      ':',
      p_event_code,
      p_booking_id::text,
      v_role,
      v_rule.channel,
      coalesce(p_dedupe_suffix, 'booking')
    );

    insert into public.notification_deliveries(
      event_code,
      category_code,
      channel,
      recipient_role,
      booking_id,
      template_id,
      status,
      scheduled_for,
      dedupe_key,
      payload
    ) values (
      p_event_code,
      v_event.category_code,
      v_rule.channel,
      v_role,
      p_booking_id,
      v_rule.template_id,
      'queued',
      now() + make_interval(mins => greatest(coalesce(v_rule.delay_minutes, 0), 0)),
      v_key,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.enqueue_staff_booking_notification(text, uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.enqueue_staff_booking_notification(text, uuid, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
