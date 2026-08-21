-- READ ONLY verification for Communication Engine 077
select
  c.id,
  c.subject,
  c.status,
  c.needs_reply,
  c.last_channel,
  c.last_message_at,
  c.last_inbound_at,
  c.last_outbound_at,
  count(m.id) as message_count
from public.crm_conversations c
left join public.crm_messages m on m.conversation_id = c.id
group by c.id
order by c.last_message_at desc nulls last;

select
  channel,
  direction,
  status,
  count(*) as message_count
from public.crm_messages
group by channel, direction, status
order by channel, direction, status;

select
  identity_type,
  normalized_value,
  customer_id,
  lead_id,
  display_value
from public.crm_contact_identities
order by updated_at desc;
