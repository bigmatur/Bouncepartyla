-- 070 verification: read-only
select event_code, channel, name, active, subject
from public.notification_templates
order by event_code, channel;

select phone_key, customer_id, phone_raw, source, keyword, suppressed_at
from public.notification_sms_suppressions
order by suppressed_at desc
limit 50;

select channel, enabled, provider, sender_label, sender_value
from public.notification_channel_settings
order by channel;
