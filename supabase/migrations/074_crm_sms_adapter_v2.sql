-- 074 CRM SMS Adapter
-- Adds channel awareness to unified CRM conversations.
-- Depends on 070 notification_sms_suppressions / apply_notification_sms_optout
-- and 072 CRM Core tables.

alter table public.crm_conversations
  add column if not exists last_channel text;

update public.crm_conversations c
set last_channel = (
  select cm.channel
  from public.crm_messages cm
  where cm.conversation_id = c.id
  order by coalesce(cm.sent_at, cm.created_at) desc, cm.created_at desc
  limit 1
)
where c.last_channel is null
  and exists (
    select 1
    from public.crm_messages cm
    where cm.conversation_id = c.id
  );

create index if not exists idx_crm_conversations_last_channel
  on public.crm_conversations(last_channel, last_message_at desc);

-- Ensure phone identities can be matched consistently with the existing
-- notification_phone_key() behavior from migration 070.
update public.crm_contact_identities
set normalized_value = public.notification_phone_key(identity_value),
    updated_at = now()
where identity_type = 'phone'
  and public.notification_phone_key(identity_value) is not null
  and normalized_value is distinct from public.notification_phone_key(identity_value)
  and not exists (
    select 1
    from public.crm_contact_identities other
    where other.id <> crm_contact_identities.id
      and other.identity_type = 'phone'
      and other.normalized_value = public.notification_phone_key(crm_contact_identities.identity_value)
  );

notify pgrst, 'reload schema';
