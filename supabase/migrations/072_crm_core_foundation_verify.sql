select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'crm_conversations',
    'crm_contact_identities',
    'crm_messages',
    'crm_notes',
    'crm_pipeline_history'
  )
order by table_name;

select
  (select count(*) from public.crm_conversations) as conversations,
  (select count(*) from public.crm_messages) as messages,
  (select count(*) from public.crm_contact_identities) as identities,
  (select count(*) from public.crm_notes) as notes,
  (select count(*) from public.crm_pipeline_history) as pipeline_history;
