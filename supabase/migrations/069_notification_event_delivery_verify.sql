-- 069 verification. Read only.
select event_code, recipient_role, channel, enabled
from public.notification_rules
where event_code in ('booking_confirmed','payment_received','deposit_paid','contract_ready','contract_signed')
order by event_code, recipient_role, channel;

select channel, enabled, provider, sender_label, sender_value
from public.notification_channel_settings
order by channel;

select event_code, channel, status, count(*)
from public.notification_deliveries
where event_code in ('booking_confirmed','payment_received','deposit_paid','contract_ready','contract_signed')
group by event_code, channel, status
order by event_code, channel, status;

select id, booking_number, status, payment_status, contract_status, amount_paid, balance_due
from public.bookings
order by created_at desc
limit 10;
