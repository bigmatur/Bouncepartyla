alter table public.system_settings
  add column if not exists account_help_title text,
  add column if not exists account_help_description text,
  add column if not exists account_help_email text,
  add column if not exists account_help_phone text;

update public.system_settings
set
  account_help_title = coalesce(nullif(trim(account_help_title), ''), 'Need support?'),
  account_help_description = coalesce(
    nullif(trim(account_help_description), ''),
    'Contact Bounce Party LA for booking updates, delivery window changes, payment help or contract questions.'
  ),
  account_help_email = coalesce(nullif(trim(account_help_email), ''), 'support@bouncepartyla.com'),
  account_help_phone = coalesce(nullif(trim(account_help_phone), ''), '(323) 000-0000');

notify pgrst, 'reload schema';
