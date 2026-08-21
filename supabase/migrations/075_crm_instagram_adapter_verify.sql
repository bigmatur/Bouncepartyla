-- READ ONLY verification for CRM Instagram Adapter 075
select
  (select count(*) from public.crm_contact_identities where identity_type = 'instagram') as instagram_identities,
  (select count(*) from public.crm_messages where channel = 'instagram') as instagram_messages,
  (select count(*) from public.crm_conversations where last_channel = 'instagram') as instagram_conversations;

select
  ci.identity_value,
  ci.display_value,
  ci.customer_id,
  ci.lead_id,
  c.id as conversation_id,
  c.needs_reply,
  c.last_channel,
  c.last_message_at
from public.crm_contact_identities ci
left join public.crm_conversations c
  on (ci.customer_id is not null and c.customer_id = ci.customer_id)
  or (ci.lead_id is not null and c.lead_id = ci.lead_id)
where ci.identity_type = 'instagram'
order by ci.created_at desc
limit 20;

select
  id,
  conversation_id,
  direction,
  channel,
  sender_identity,
  recipient_identity,
  body_text,
  provider_message_id,
  status,
  sent_at,
  metadata
from public.crm_messages
where channel = 'instagram'
order by coalesce(sent_at, created_at) desc
limit 50;
