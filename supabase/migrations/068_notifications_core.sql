-- 068 Notifications & Messaging core
-- Foundation only: rules, templates, preferences, delivery log, provider settings.
-- Existing booking email delivery is intentionally left untouched in this migration.

create extension if not exists pgcrypto;

create table if not exists public.notification_categories (
  code text primary key,
  label text not null,
  description text,
  customer_configurable boolean not null default true,
  mandatory boolean not null default false,
  allow_email boolean not null default true,
  allow_sms boolean not null default true,
  allow_in_app boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  code text primary key,
  category_code text not null references public.notification_categories(code) on update cascade,
  label text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  event_code text not null references public.notification_events(code) on delete cascade,
  channel text not null check (channel in ('email','sms','in_app')),
  name text not null,
  subject text,
  body_html text,
  body_text text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_code, channel)
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  event_code text not null references public.notification_events(code) on delete cascade,
  recipient_role text not null,
  channel text not null check (channel in ('email','sms','in_app')),
  enabled boolean not null default true,
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  template_id uuid references public.notification_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_code, recipient_role, channel)
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  category_code text not null references public.notification_categories(code) on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, category_code)
);

create table if not exists public.notification_channel_settings (
  channel text primary key check (channel in ('email','sms','in_app')),
  enabled boolean not null default false,
  provider text,
  sender_label text,
  sender_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_code text not null references public.notification_events(code),
  category_code text not null references public.notification_categories(code),
  channel text not null check (channel in ('email','sms','in_app')),
  recipient_role text,
  customer_id uuid references public.customers(id) on delete set null,
  auth_user_id uuid,
  recipient_email text,
  recipient_phone text,
  booking_id uuid references public.bookings(id) on delete set null,
  template_id uuid references public.notification_templates(id) on delete set null,
  subject text,
  rendered_body text,
  status text not null default 'queued' check (status in ('queued','processing','sent','delivered','failed','suppressed','cancelled')),
  provider_message_id text,
  error_message text,
  attempt_count integer not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_deliveries_status_schedule
  on public.notification_deliveries(status, scheduled_for);
create index if not exists idx_notification_deliveries_booking
  on public.notification_deliveries(booking_id);
create index if not exists idx_notification_deliveries_customer
  on public.notification_deliveries(customer_id);

create table if not exists public.notification_unsubscribe_tokens (
  token uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  category_code text references public.notification_categories(code) on delete cascade,
  channel text check (channel is null or channel in ('email','sms')),
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Seed customer-facing categories.
insert into public.notification_categories
  (code, label, description, customer_configurable, mandatory, sort_order)
values
  ('reservation', 'Reservation & event updates', 'Booking confirmations, changes, cancellations and event reminders.', true, false, 10),
  ('payments', 'Payments & receipts', 'Deposit confirmations, receipts, balance reminders and payment updates.', true, false, 20),
  ('contracts', 'Contracts & documents', 'Contract ready, signed contract and document updates.', true, false, 30),
  ('delivery', 'Delivery & pickup', 'Delivery windows, driver updates and pickup reminders.', true, false, 40),
  ('account_security', 'Account & security', 'Sign-in and important account/security messages.', false, true, 50),
  ('marketing', 'Promotions & offers', 'Special offers, seasonal availability and marketing campaigns.', true, false, 60)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  customer_configurable = excluded.customer_configurable,
  mandatory = excluded.mandatory,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.notification_events (code, category_code, label, description, sort_order)
values
  ('booking_created', 'reservation', 'Booking created', 'A booking or temporary reservation was created.', 10),
  ('booking_confirmed', 'reservation', 'Booking confirmed', 'Deposit/requirements completed and booking confirmed.', 20),
  ('booking_changed', 'reservation', 'Booking changed', 'Date, items, address or other booking details changed.', 30),
  ('booking_cancelled', 'reservation', 'Booking cancelled', 'Booking was cancelled.', 40),
  ('deposit_paid', 'payments', 'Deposit paid', 'Deposit payment successfully received.', 50),
  ('payment_received', 'payments', 'Payment received', 'Any successful customer payment.', 60),
  ('balance_reminder', 'payments', 'Balance reminder', 'Upcoming balance reminder.', 70),
  ('contract_ready', 'contracts', 'Contract ready', 'Contract is ready for review/signature.', 80),
  ('contract_signed', 'contracts', 'Contract signed', 'Contract successfully signed.', 90),
  ('delivery_scheduled', 'delivery', 'Delivery scheduled', 'Delivery window assigned.', 100),
  ('driver_on_the_way', 'delivery', 'Driver on the way', 'Driver started travel to customer.', 110),
  ('pickup_scheduled', 'delivery', 'Pickup scheduled', 'Pickup window assigned.', 120),
  ('marketing_campaign', 'marketing', 'Marketing campaign', 'Promotional email/SMS campaign.', 200)
on conflict (code) do update set
  category_code = excluded.category_code,
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.notification_channel_settings(channel, enabled, provider, sender_label)
values
  ('email', true, 'smtp', 'Bounce Party LA'),
  ('sms', false, 'twilio', 'Bounce Party LA'),
  ('in_app', true, 'internal', 'Bounce Party LA')
on conflict (channel) do nothing;

-- Safe starter templates. They are intentionally simple and editable later.
insert into public.notification_templates(event_code, channel, name, subject, body_text)
select e.code, 'email', e.label || ' email',
       case e.code
         when 'booking_confirmed' then 'Your Bounce Party LA booking {{booking_number}} is confirmed'
         when 'payment_received' then 'Payment received for {{booking_number}}'
         when 'deposit_paid' then 'Deposit received for {{booking_number}}'
         when 'contract_ready' then 'Your contract is ready for {{booking_number}}'
         when 'contract_signed' then 'Signed contract {{booking_number}}'
         when 'driver_on_the_way' then 'Your Bounce Party LA driver is on the way'
         else 'Bounce Party LA — ' || e.label
       end,
       'Hi {{customer_first_name}},\n\n' || e.label || ' for booking {{booking_number}}.\n\nManage notification preferences: {{preferences_url}}'
from public.notification_events e
on conflict (event_code, channel) do nothing;

insert into public.notification_templates(event_code, channel, name, body_text)
select e.code, 'sms', e.label || ' SMS',
       'Bounce Party LA: ' || e.label || ' — {{booking_number}}. Preferences: {{preferences_url}}'
from public.notification_events e
where e.category_code <> 'account_security'
on conflict (event_code, channel) do nothing;

-- Default customer rules: transactional email enabled, SMS only for delivery; marketing off until explicitly enabled.
insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select e.code, 'customer', 'email', (e.category_code <> 'marketing'), t.id
from public.notification_events e
left join public.notification_templates t on t.event_code=e.code and t.channel='email'
on conflict (event_code, recipient_role, channel) do nothing;

insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select e.code, 'customer', 'sms', (e.category_code = 'delivery'), t.id
from public.notification_events e
left join public.notification_templates t on t.event_code=e.code and t.channel='sms'
where e.category_code <> 'account_security'
on conflict (event_code, recipient_role, channel) do nothing;

-- Employee/admin starter rules. Internal delivery only for now.
insert into public.notification_rules(event_code, recipient_role, channel, enabled)
select e.code, role_name, 'in_app', true
from public.notification_events e
cross join (values ('admin'),('manager'),('driver'),('cleaner')) roles(role_name)
where (role_name in ('admin','manager') and e.code in ('booking_created','booking_confirmed','payment_received','booking_cancelled'))
   or (role_name='driver' and e.code in ('delivery_scheduled','pickup_scheduled'))
   or (role_name='cleaner' and false)
on conflict (event_code, recipient_role, channel) do nothing;

-- Generic updated_at trigger without depending on a project-specific function signature.
create or replace function public.touch_notification_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'notification_categories','notification_events','notification_templates','notification_rules',
    'notification_preferences','notification_channel_settings','notification_deliveries'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_notification_updated_at()', t, t);
  end loop;
end $$;

-- RLS helpers/policies.
alter table public.notification_categories enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_channel_settings enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_unsubscribe_tokens enable row level security;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and coalesce(p.role,'customer') <> 'customer'
  );
$$;

-- Shared catalog can be read by authenticated users; staff manages it.
do $$
declare t text;
begin
  foreach t in array array['notification_categories','notification_events'] loop
    execute format('drop policy if exists %I_read_authenticated on public.%I', t, t);
    execute format('create policy %I_read_authenticated on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_staff_manage on public.%I', t, t);
    execute format('create policy %I_staff_manage on public.%I for all to authenticated using (public.current_user_is_staff()) with check (public.current_user_is_staff())', t, t);
  end loop;
end $$;

-- Staff-only configuration/log tables.
do $$
declare t text;
begin
  foreach t in array array['notification_templates','notification_rules','notification_channel_settings','notification_deliveries'] loop
    execute format('drop policy if exists %I_staff_all on public.%I', t, t);
    execute format('create policy %I_staff_all on public.%I for all to authenticated using (public.current_user_is_staff()) with check (public.current_user_is_staff())', t, t);
  end loop;
end $$;

-- Customer preferences: own row only; staff may manage all.
drop policy if exists notification_preferences_own_select on public.notification_preferences;
create policy notification_preferences_own_select on public.notification_preferences
for select to authenticated using (
  exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=auth.uid())
  or public.current_user_is_staff()
);
drop policy if exists notification_preferences_own_insert on public.notification_preferences;
create policy notification_preferences_own_insert on public.notification_preferences
for insert to authenticated with check (
  exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=auth.uid())
  or public.current_user_is_staff()
);
drop policy if exists notification_preferences_own_update on public.notification_preferences;
create policy notification_preferences_own_update on public.notification_preferences
for update to authenticated using (
  exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=auth.uid())
  or public.current_user_is_staff()
) with check (
  exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=auth.uid())
  or public.current_user_is_staff()
);

-- Tokens are service/staff managed. Public unsubscribe will use a server service client, not direct anon access.
drop policy if exists notification_unsubscribe_tokens_staff_all on public.notification_unsubscribe_tokens;
create policy notification_unsubscribe_tokens_staff_all on public.notification_unsubscribe_tokens
for all to authenticated using (public.current_user_is_staff()) with check (public.current_user_is_staff());

notify pgrst, 'reload schema';
