-- 071 Notifications: configurable scheduled reminders.
-- Requires 068, 069 and 070.
-- This migration only enqueues reminders; it never sends directly and never mutates bookings.

create extension if not exists pgcrypto;

create table if not exists public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  event_code text not null references public.notification_events(code) on delete cascade,
  name text not null,
  enabled boolean not null default false,
  anchor_type text not null check (anchor_type in ('event_start','delivery_start','pickup_start')),
  offset_minutes integer not null default 0 check (offset_minutes >= 0),
  catchup_minutes integer not null default 180 check (catchup_minutes >= 5),
  requires_balance_due boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_code)
);

-- Add reminder events if they do not already exist.
insert into public.notification_events(code, category_code, label, description, sort_order)
values
  ('event_reminder', 'reservation', 'Event reminder', 'Reminder before the customer event.', 35),
  ('delivery_reminder', 'delivery', 'Delivery reminder', 'Reminder before the planned delivery window.', 105),
  ('pickup_reminder', 'delivery', 'Pickup reminder', 'Reminder before the planned pickup window.', 125)
on conflict (code) do update set
  category_code = excluded.category_code,
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Templates for scheduled events.
insert into public.notification_templates(event_code, channel, name, subject, body_text)
values
  ('event_reminder', 'email', 'Event reminder email', 'Reminder for your Bounce Party LA event {{booking_number}}',
   'Hi {{customer_first_name}},\n\nA reminder for your Bounce Party LA event {{booking_number}} on {{event_date}}.\n\nView booking: {{booking_url}}'),
  ('event_reminder', 'sms', 'Event reminder SMS', null,
   'Bounce Party LA reminder: your event {{booking_number}} is on {{event_date}}. {{booking_url}}'),
  ('event_reminder', 'in_app', 'Event reminder in-app', 'Event reminder',
   'Your event {{booking_number}} is coming up on {{event_date}}.'),
  ('balance_reminder', 'email', 'Balance reminder email', 'Balance reminder for {{booking_number}}',
   'Hi {{customer_first_name}},\n\nYour remaining balance for {{booking_number}} is {{balance_due}}.\n\nPay/view booking: {{booking_url}}'),
  ('balance_reminder', 'sms', 'Balance reminder SMS', null,
   'Bounce Party LA: balance {{balance_due}} remains for {{booking_number}}. {{booking_url}}'),
  ('balance_reminder', 'in_app', 'Balance reminder in-app', 'Balance reminder',
   'Remaining balance for {{booking_number}}: {{balance_due}}.'),
  ('delivery_reminder', 'email', 'Delivery reminder email', 'Delivery reminder for {{booking_number}}',
   'Hi {{customer_first_name}},\n\nYour Bounce Party LA delivery is coming up. Booking {{booking_number}}.\n\nView booking: {{booking_url}}'),
  ('delivery_reminder', 'sms', 'Delivery reminder SMS', null,
   'Bounce Party LA: delivery for {{booking_number}} is coming up. {{booking_url}}'),
  ('delivery_reminder', 'in_app', 'Delivery reminder in-app', 'Delivery reminder',
   'Delivery for {{booking_number}} is coming up.'),
  ('pickup_reminder', 'email', 'Pickup reminder email', 'Pickup reminder for {{booking_number}}',
   'Hi {{customer_first_name}},\n\nA reminder that pickup for {{booking_number}} is coming up.\n\nView booking: {{booking_url}}'),
  ('pickup_reminder', 'sms', 'Pickup reminder SMS', null,
   'Bounce Party LA: pickup for {{booking_number}} is coming up. {{booking_url}}'),
  ('pickup_reminder', 'in_app', 'Pickup reminder in-app', 'Pickup reminder',
   'Pickup for {{booking_number}} is coming up.')
on conflict (event_code, channel) do nothing;

-- Customer rules. Email/in-app are available; SMS delivery-related reminders are available
-- but the global SMS channel remains disabled until the admin enables Twilio.
insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select e.code, 'customer', ch.channel,
       case
         when ch.channel = 'email' then true
         when ch.channel = 'in_app' then true
         when ch.channel = 'sms' and e.code in ('delivery_reminder','pickup_reminder') then true
         else false
       end,
       t.id
from public.notification_events e
cross join (values ('email'),('sms'),('in_app')) ch(channel)
left join public.notification_templates t on t.event_code=e.code and t.channel=ch.channel
where e.code in ('event_reminder','balance_reminder','delivery_reminder','pickup_reminder')
on conflict (event_code, recipient_role, channel) do update set
  template_id = coalesce(public.notification_rules.template_id, excluded.template_id),
  updated_at = now();

-- Safe defaults: every schedule is OFF until explicitly enabled by an administrator.
insert into public.notification_schedules(event_code, name, enabled, anchor_type, offset_minutes, catchup_minutes, requires_balance_due)
values
  ('event_reminder', 'Event reminder', false, 'event_start', 1440, 1440, false),
  ('balance_reminder', 'Balance reminder', false, 'event_start', 10080, 1440, true),
  ('delivery_reminder', 'Delivery reminder', false, 'delivery_start', 120, 180, false),
  ('pickup_reminder', 'Pickup reminder', false, 'pickup_start', 120, 180, false)
on conflict (event_code) do nothing;

create or replace function public.notification_booking_anchor(
  p_booking public.bookings,
  p_anchor_type text
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  if p_anchor_type = 'event_start' then
    return (
      p_booking.event_date + coalesce(p_booking.event_start_time, time '10:00')
    ) at time zone 'America/Los_Angeles';
  end if;

  if p_anchor_type = 'delivery_start' then
    if p_booking.delivery_window_start is not null then
      return p_booking.delivery_window_start;
    end if;
    if p_booking.delivery_date is not null then
      return (p_booking.delivery_date + time '09:00') at time zone 'America/Los_Angeles';
    end if;
    return null;
  end if;

  if p_anchor_type = 'pickup_start' then
    if p_booking.pickup_window_start is not null then
      return p_booking.pickup_window_start;
    end if;
    if p_booking.pickup_date is not null then
      return (p_booking.pickup_date + coalesce(p_booking.event_end_time, time '18:00')) at time zone 'America/Los_Angeles';
    end if;
    return null;
  end if;

  return null;
end;
$$;

-- Scan configured schedules and enqueue due events. Dedupe is per schedule+booking,
-- so cron retries are safe and do not create duplicate notifications.
create or replace function public.enqueue_due_notification_schedules(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.notification_schedules%rowtype;
  v_booking public.bookings%rowtype;
  v_anchor timestamptz;
  v_due timestamptz;
  v_inserted integer := 0;
  v_bookings integer := 0;
  v_status text;
begin
  for v_schedule in
    select * from public.notification_schedules where enabled = true order by event_code
  loop
    for v_booking in
      select b.*
      from public.bookings b
      where b.customer_id is not null
        and lower(coalesce(b.status::text,'')) not in ('draft','quote','pending_deposit','cancelled','refunded','closed')
        and (not v_schedule.requires_balance_due or coalesce(b.balance_due,0) > 0.009)
    loop
      v_anchor := public.notification_booking_anchor(v_booking, v_schedule.anchor_type);
      if v_anchor is null then continue; end if;

      v_due := v_anchor - make_interval(mins => v_schedule.offset_minutes);

      -- Not due yet, or too late for this reminder.
      if v_due > p_now then continue; end if;
      if v_due < p_now - make_interval(mins => v_schedule.catchup_minutes) then continue; end if;

      v_bookings := v_bookings + 1;
      v_inserted := v_inserted + public.enqueue_customer_booking_notification(
        v_schedule.event_code,
        v_booking.id,
        'schedule:' || v_schedule.id::text,
        jsonb_build_object(
          'schedule_id', v_schedule.id,
          'anchor_type', v_schedule.anchor_type,
          'anchor_at', v_anchor,
          'due_at', v_due
        )
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'success', true,
    'evaluated_due_bookings', v_bookings,
    'deliveries_enqueued', v_inserted,
    'ran_at', p_now
  );
end;
$$;

revoke all on function public.enqueue_due_notification_schedules(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_due_notification_schedules(timestamptz) to service_role;

alter table public.notification_schedules enable row level security;

drop policy if exists notification_schedules_staff_all on public.notification_schedules;
create policy notification_schedules_staff_all
on public.notification_schedules
for all to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

notify pgrst, 'reload schema';
