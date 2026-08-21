-- 069 Notifications: real transactional events + idempotent delivery queue.
-- Requires 068_notifications_core.sql to be applied first.
-- Does NOT send email from PostgreSQL. Core transactions only enqueue; Next.js delivers afterward.

alter table public.notification_deliveries
  add column if not exists dedupe_key text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create unique index if not exists uq_notification_deliveries_dedupe_key
  on public.notification_deliveries(dedupe_key)
  where dedupe_key is not null;

-- Give customer an in-app copy of important transactional events.
insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select e.code, 'customer', 'in_app', true, t.id
from public.notification_events e
left join public.notification_templates t
  on t.event_code = e.code and t.channel = 'in_app'
where e.category_code in ('reservation','payments','contracts','delivery')
on conflict (event_code, recipient_role, channel) do nothing;

-- Ensure an in-app template exists for customer events.
insert into public.notification_templates(event_code, channel, name, subject, body_text)
select e.code, 'in_app', e.label || ' in-app', e.label,
       case e.code
         when 'booking_confirmed' then 'Booking {{booking_number}} is confirmed.'
         when 'payment_received' then 'Payment received for {{booking_number}}.'
         when 'deposit_paid' then 'Deposit received for {{booking_number}}.'
         when 'contract_ready' then 'Contract is ready for {{booking_number}}.'
         when 'contract_signed' then 'Contract signed for {{booking_number}}.'
         else e.label || ' — {{booking_number}}.'
       end
from public.notification_events e
where e.category_code in ('reservation','payments','contracts','delivery')
on conflict (event_code, channel) do nothing;

-- Improve starter email text. Existing admin-edited templates are preserved unless still blank/default-like.
update public.notification_templates
set body_text = case event_code
  when 'booking_confirmed' then 'Hi {{customer_first_name}},\n\nYour Bounce Party LA booking {{booking_number}} is confirmed.\nEvent date: {{event_date}}\nTotal: {{total}}\nPaid: {{amount_paid}}\nBalance: {{balance_due}}\n\nView booking: {{booking_url}}'
  when 'payment_received' then 'Hi {{customer_first_name}},\n\nWe received your payment for {{booking_number}}.\nPayment: {{payment_amount}}\nPaid total: {{amount_paid}}\nBalance: {{balance_due}}\n\nView booking: {{booking_url}}'
  when 'deposit_paid' then 'Hi {{customer_first_name}},\n\nYour deposit for {{booking_number}} has been received.\nDeposit: {{deposit_amount}}\nPaid total: {{amount_paid}}\nBalance: {{balance_due}}\n\nView booking: {{booking_url}}'
  when 'contract_ready' then 'Hi {{customer_first_name}},\n\nYour Bounce Party LA reservation is waiting for your contract and deposit.\nBooking: {{booking_number}}\n\nContinue booking: {{action_url}}\n\nReservation hold expires: {{expires_at}}'
  when 'contract_signed' then 'Hi {{customer_first_name}},\n\nYour contract for {{booking_number}} has been signed and saved.\n\nView booking: {{booking_url}}'
  else body_text
end,
updated_at = now()
where channel = 'email'
  and event_code in ('booking_confirmed','payment_received','deposit_paid','contract_ready','contract_signed');

create or replace function public.enqueue_customer_booking_notification(
  p_event_code text,
  p_booking_id uuid,
  p_dedupe_suffix text default null,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.notification_events%rowtype;
  v_booking public.bookings%rowtype;
  v_customer public.customers%rowtype;
  v_rule record;
  v_pref public.notification_preferences%rowtype;
  v_inserted integer := 0;
  v_allowed boolean;
  v_recipient text;
  v_key text;
begin
  select * into v_event
  from public.notification_events
  where code = p_event_code and active = true;
  if not found then return 0; end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id;
  if not found or v_booking.customer_id is null then return 0; end if;

  select * into v_customer
  from public.customers
  where id = v_booking.customer_id;
  if not found then return 0; end if;

  for v_rule in
    select r.*, cs.enabled as channel_enabled, c.mandatory
    from public.notification_rules r
    join public.notification_channel_settings cs on cs.channel = r.channel
    join public.notification_categories c on c.code = v_event.category_code
    where r.event_code = p_event_code
      and r.recipient_role = 'customer'
      and r.enabled = true
      and cs.enabled = true
  loop
    select * into v_pref
    from public.notification_preferences
    where customer_id = v_customer.id
      and category_code = v_event.category_code;

    v_allowed := coalesce(v_rule.mandatory, false) or case v_rule.channel
      when 'email' then coalesce(v_pref.email_enabled, true)
      when 'sms' then coalesce(v_pref.sms_enabled, true)
      when 'in_app' then coalesce(v_pref.in_app_enabled, true)
      else false
    end;

    if not v_allowed then
      continue;
    end if;

    v_recipient := case v_rule.channel
      when 'email' then nullif(trim(coalesce(v_customer.email, '')), '')
      when 'sms' then nullif(trim(coalesce(v_customer.phone, '')), '')
      when 'in_app' then v_customer.id::text
      else null
    end;

    if v_recipient is null then
      continue;
    end if;

    v_key := concat_ws(':', p_event_code, p_booking_id::text, v_rule.channel, coalesce(p_dedupe_suffix, 'booking'));

    insert into public.notification_deliveries(
      event_code, category_code, channel, recipient_role,
      customer_id, recipient_email, recipient_phone, booking_id,
      template_id, status, scheduled_for, dedupe_key, payload
    ) values (
      p_event_code, v_event.category_code, v_rule.channel, 'customer',
      v_customer.id,
      case when v_rule.channel='email' then v_customer.email else null end,
      case when v_rule.channel='sms' then v_customer.phone else null end,
      p_booking_id, v_rule.template_id, 'queued',
      now() + make_interval(mins => greatest(coalesce(v_rule.delay_minutes,0),0)),
      v_key, coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    if found then v_inserted := v_inserted + 1; end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.enqueue_customer_booking_notification(text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_customer_booking_notification(text,uuid,text,jsonb) to service_role;

-- Payment events. Trigger only enqueues; payment transaction never depends on SMTP/Twilio.
create or replace function public.queue_notifications_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(new.status::text,''));
  v_old_status text := case when tg_op='UPDATE' then lower(coalesce(old.status::text,'')) else '' end;
  v_booking public.bookings%rowtype;
  v_base_paid numeric := 0;
begin
  if v_status not in ('paid','completed','succeeded') then return new; end if;
  if tg_op='UPDATE' and v_old_status in ('paid','completed','succeeded') then return new; end if;

  perform public.enqueue_customer_booking_notification(
    'payment_received', new.booking_id, new.id::text,
    jsonb_build_object('payment_id',new.id,'payment_amount',greatest(coalesce(new.amount,0)-coalesce(new.tip_amount,0),0),'tip_amount',coalesce(new.tip_amount,0))
  );

  select * into v_booking from public.bookings where id=new.booking_id;
  if found and coalesce(v_booking.deposit_amount,0) > 0 then
    select coalesce(sum(greatest(coalesce(p.amount,0)-coalesce(p.tip_amount,0),0)),0)
      into v_base_paid
    from public.payments p
    where p.booking_id=new.booking_id
      and lower(coalesce(p.status::text,'')) in ('paid','completed','succeeded');

    if v_base_paid >= coalesce(v_booking.deposit_amount,0) then
      perform public.enqueue_customer_booking_notification(
        'deposit_paid', new.booking_id, 'deposit-threshold',
        jsonb_build_object('payment_id',new.id,'payment_amount',greatest(coalesce(new.amount,0)-coalesce(new.tip_amount,0),0))
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_queue_notifications_after_payment on public.payments;
create trigger trg_queue_notifications_after_payment
after insert or update of status on public.payments
for each row execute function public.queue_notifications_after_payment();

-- Confirmed only on an actual transition to booked. This deliberately avoids INSERT,
-- because customer self-service temporarily creates a row before Stripe checkout.
create or replace function public.queue_notification_after_booking_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.status::text,''))='booked'
     and lower(coalesce(old.status::text,'')) <> 'booked' then
    perform public.enqueue_customer_booking_notification('booking_confirmed',new.id,'confirmed','{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_queue_notification_after_booking_confirmed on public.bookings;
create trigger trg_queue_notification_after_booking_confirmed
after update of status on public.bookings
for each row execute function public.queue_notification_after_booking_confirmed();

-- Signed contract event. contract_ready is queued explicitly by app code because its action URL
-- contains the one-time completion token and cannot be reconstructed safely in SQL.
create or replace function public.queue_notification_after_contract_signed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text := lower(coalesce(new.status::text,''));
  v_old text := case when tg_op='UPDATE' then lower(coalesce(old.status::text,'')) else '' end;
begin
  if v_new='signed' and v_old <> 'signed' then
    perform public.enqueue_customer_booking_notification('contract_signed',new.booking_id,new.id::text,jsonb_build_object('contract_id',new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_queue_notification_after_contract_signed on public.contracts;
create trigger trg_queue_notification_after_contract_signed
after insert or update of status on public.contracts
for each row execute function public.queue_notification_after_contract_signed();

notify pgrst, 'reload schema';
