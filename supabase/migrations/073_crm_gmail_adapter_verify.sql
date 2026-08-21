select account_key, provider, mailbox_identity, last_success_at, last_error_at, last_error, last_result
from public.crm_email_sync_state
order by account_key;

select channel, direction, status, count(*)
from public.crm_messages
group by channel, direction, status
order by channel, direction, status;

select id, subject, status, needs_reply, last_message_at, last_inbound_at, last_outbound_at
from public.crm_conversations
order by last_message_at desc nulls last
limit 25;
