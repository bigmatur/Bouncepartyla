-- 148_crm_instagram_labels_verification.sql
-- Read-only schema verification for local Instagram CRM labels.

do $$
declare
  constraint_definition text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'crm_conversations'
      and column_name = 'instagram_label'
      and data_type = 'text'
  ) then
    raise exception 'crm_conversations.instagram_label text column is missing';
  end if;

  select pg_get_constraintdef(oid)
  into constraint_definition
  from pg_constraint
  where conrelid = 'public.crm_conversations'::regclass
    and conname = 'crm_conversations_instagram_label_check'
    and contype = 'c';

  if constraint_definition is null then
    raise exception 'Instagram label check constraint is missing';
  end if;

  if constraint_definition not like '%flag%'
     or constraint_definition not like '%booked%'
     or constraint_definition not like '%lead%'
     or constraint_definition not like '%ordered%'
     or constraint_definition not like '%paid%'
     or constraint_definition not like '%shipped%'
  then
    raise exception 'Instagram label check constraint does not contain every supported label';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'crm_conversations'
      and c.relname = 'idx_crm_conversations_instagram_label'
      and i.indisvalid
  ) then
    raise exception 'Instagram label partial index is missing or invalid';
  end if;
end
$$;
