-- =========================================================
-- 110 Homepage content settings
-- Admin-managed content for the public homepage.
-- Public rendering reads this table server-side only.
-- =========================================================

begin;

create table if not exists public.homepage_content_settings (
  id text primary key default 'default',
  content jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint homepage_content_settings_singleton_check
    check (id = 'default')
);

drop trigger if exists homepage_content_settings_set_updated_at
on public.homepage_content_settings;

create trigger homepage_content_settings_set_updated_at
before update on public.homepage_content_settings
for each row execute function public.set_updated_at();

alter table public.homepage_content_settings enable row level security;

drop policy if exists homepage_content_settings_select_admin
on public.homepage_content_settings;

drop policy if exists homepage_content_settings_insert_admin
on public.homepage_content_settings;

drop policy if exists homepage_content_settings_update_admin
on public.homepage_content_settings;

drop policy if exists homepage_content_settings_delete_admin
on public.homepage_content_settings;

create policy homepage_content_settings_select_admin
on public.homepage_content_settings
for select
to authenticated
using (
  public.is_admin()
);

create policy homepage_content_settings_insert_admin
on public.homepage_content_settings
for insert
to authenticated
with check (
  public.is_admin()
);

create policy homepage_content_settings_update_admin
on public.homepage_content_settings
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy homepage_content_settings_delete_admin
on public.homepage_content_settings
for delete
to authenticated
using (
  public.is_admin()
);

revoke all on table public.homepage_content_settings from anon;
revoke all on table public.homepage_content_settings from authenticated;

grant select, insert, update, delete
on public.homepage_content_settings
to authenticated;

insert into public.homepage_content_settings (
  id,
  content
)
values (
  'default',
  '{}'::jsonb
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;