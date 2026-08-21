-- 074 verification

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'crm_conversations'
  and column_name = 'last_channel';

select
  channel,
  count(*) as message_count
from public.crm_messages
group by channel
order by channel;

select
  c.id,
  c.subject,
  c.status,
  c.needs_reply,
  c.last_channel,
  c.last_message_at,
  c.customer_id,
  c.lead_id
from public.crm_conversations c
order by c.last_message_at desc nulls last
limit 25;

select
  identity_type,
  identity_value,
  normalized_value,
  customer_id,
  lead_id
from public.crm_contact_identities
where identity_type = 'phone'
order by updated_at desc
limit 25;
