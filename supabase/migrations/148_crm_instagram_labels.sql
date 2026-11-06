-- 148_crm_instagram_labels.sql
-- Add Instagram label field to CRM conversations for manual parity with Instagram DM labels.

begin;

alter table public.crm_conversations
  add column if not exists instagram_label text;

alter table public.crm_conversations
  drop constraint if exists crm_conversations_instagram_label_check;

alter table public.crm_conversations
  add constraint crm_conversations_instagram_label_check
  check (
    instagram_label is null
    or instagram_label in (
      'flag',
      'booked',
      'lead',
      'ordered',
      'paid',
      'shipped'
    )
  );

create index if not exists idx_crm_conversations_instagram_label
  on public.crm_conversations(instagram_label)
  where instagram_label is not null;

notify pgrst, 'reload schema';

commit;
