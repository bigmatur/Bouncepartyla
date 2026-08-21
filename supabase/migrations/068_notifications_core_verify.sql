select code, label, customer_configurable, mandatory, sort_order
from public.notification_categories
order by sort_order, code;

select e.code, e.label, e.category_code,
       count(*) filter (where r.recipient_role='customer' and r.channel='email' and r.enabled) as customer_email_rules,
       count(*) filter (where r.recipient_role='customer' and r.channel='sms' and r.enabled) as customer_sms_rules
from public.notification_events e
left join public.notification_rules r on r.event_code=e.code
group by e.code,e.label,e.category_code,e.sort_order
order by e.sort_order;

select channel, enabled, provider, sender_label, sender_value
from public.notification_channel_settings
order by channel;

select status, channel, count(*)
from public.notification_deliveries
group by status, channel
order by channel, status;
